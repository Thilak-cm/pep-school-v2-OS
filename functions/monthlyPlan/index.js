/**
 * PEP-260: Monthly plan production Cloud Function.
 * PEP-279: Drive export + batch cron Cloud Functions.
 *
 * generateMonthlyPlan — callable CF that gathers student context,
 * calls LLM via OpenRouter, archives the previous plan (if any),
 * and saves the new plan to Firestore.
 *
 * exportMonthlyPlanToDrive — callable CF that reads a generated plan from
 * Firestore, creates two Google Docs (detailed plan + task checklist) in
 * the shared Drive, and creates shortcuts in the student folder.
 *
 * batchGenerateMonthlyPlans — scheduled CF (24th–27th of each month,
 * midnight IST) with a runtime guard that only executes on the correct
 * day: last day of the current month minus 4. This ensures teachers get
 * exactly 4 days of lead time regardless of month length (e.g. Feb 28 →
 * 24th, Apr 30 → 26th, Jul 31 → 27th).
 */
import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { buildChatBody } from "../shared/openai.js";
import { OPENROUTER_ENDPOINT, OPENROUTER_API_KEY, getOpenRouterKey } from "../shared/openrouter.js";
import { calculateAge } from "../utils/handwritingAnalysisHelpers.js";
import { buildUserPrompt } from "./helpers.js";
import {
  getDriveClients,
  getOrCreateClassroomFolder,
  getOrCreateFolder,
  createShortcut,
  capitalize,
} from "../utils/driveHelpers.js";
import { DRIVE_CONSTANTS } from "../config/reportConstants.js";
import {
  buildDetailedPlanRequests,
  buildChecklistRequests,
  buildPlanDocTitle,
  buildChecklistDocTitle,
  formatMonthLabel,
} from "./docBuilders.js";
import { fetchActiveStudentIds, runWithConcurrency } from "../shared/scheduling.js";

// ---------------------------------------------------------------------------
// Config cache (1-day TTL)
// ---------------------------------------------------------------------------
const CONFIG_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
let cachedConfig = null;
let configFetchedAt = 0;

async function getMonthlyPlanConfig() {
  const now = Date.now();
  if (cachedConfig && now - configFetchedAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }
  const snap = await db.collection("config").doc("monthly_plan").get();
  if (!snap.exists) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "config/monthly_plan doc not found — run the seed script first",
    );
  }
  cachedConfig = snap.data();
  configFetchedAt = now;
  return cachedConfig;
}

// ---------------------------------------------------------------------------
// Drive cleanup helper
// ---------------------------------------------------------------------------

/**
 * Search a Drive folder for ALL files matching a name and trash them.
 * Handles orphaned duplicates from prior failed/repeated exports.
 */
async function trashExistingDocsByName(drive, folderId, docName) {
  try {
    const search = await drive.files.list({
      q: `name = '${docName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`,
      driveId: DRIVE_CONSTANTS.sharedDriveId,
      corpora: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      fields: "files(id)",
    });
    for (const file of (search.data.files || [])) {
      await drive.files.update({ fileId: file.id, requestBody: { trashed: true }, supportsAllDrives: true });
    }
    if (search.data.files?.length) {
      console.log(`[trashExistingDocsByName] trashed ${search.data.files.length} existing "${docName}" in folder ${folderId}`);
    }
  } catch (err) {
    console.warn("[trashExistingDocsByName] search/trash failed:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Internal helper: generate plan (no auth check)
// ---------------------------------------------------------------------------

/**
 * Core plan generation logic shared by the callable and the batch cron.
 *
 * @param {string} studentId - Firestore student doc ID
 * @param {string} targetMonth - YYYY-MM format
 * @param {string} generatedBy - uid of the caller or "system:batchCron"
 * @param {string} generatedByName - display name or "Monthly Plan Cron"
 * @returns {Promise<object>} the saved plan doc
 */
async function generatePlanInternal(studentId, targetMonth, generatedBy, generatedByName) {
  // 1. Load config
  const config = await getMonthlyPlanConfig();
  const systemPrompt = config.systemPrompt;
  const model = config.model || "gpt-5.4";
  const temperature = config.temperature ?? 0.3;
  const maxTokens = config.max_tokens || 8000;

  // 2. Fetch student doc
  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) {
    throw new functions.https.HttpsError("not-found", `Student ${studentId} not found`);
  }
  const studentData = studentSnap.data();
  const dob = studentData.dateOfBirth?.toDate?.()
    ?? (studentData.dateOfBirth ? new Date(studentData.dateOfBirth) : null);
  const now = new Date();
  const age = calculateAge(dob, now);
  const ageStr = age ? `${age.years}y ${age.months}m` : "unknown age";

  // Compute human-readable joining date from createdAt (PEP-280: cold-start context)
  const createdAt = studentData.createdAt?.toDate?.()
    ?? (studentData.createdAt ? new Date(studentData.createdAt) : null);
  let joiningDate = null;
  if (createdAt) {
    const diffMs = now - createdAt;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      joiningDate = null; // future createdAt (data-entry error) — omit
    } else if (diffDays === 0) {
      joiningDate = "joined today";
    } else if (diffDays < 7) {
      joiningDate = `joined ${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      joiningDate = `joined ${weeks} week${weeks !== 1 ? "s" : ""} ago`;
    } else {
      const months = (now.getFullYear() - createdAt.getFullYear()) * 12 +
        (now.getMonth() - createdAt.getMonth());
      joiningDate = months < 1
        ? "joined 1 month ago"
        : `joined ${months} month${months !== 1 ? "s" : ""} ago`;
    }
  }

  // Resolve programId from classroom (student docs don't always have it)
  let programId = studentData.programId || null;
  if (!programId && studentData.classroomId) {
    const classroomSnap = await db.collection("classrooms").doc(studentData.classroomId).get();
    if (classroomSnap.exists) {
      programId = classroomSnap.data().programId || null;
    }
  }
  programId = programId || "unknown";

  // Program gate — toddler and primary only
  if (!["toddler", "primary"].includes(programId)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Monthly plans are only available for toddler and primary programs (got: ${programId})`,
    );
  }

  // 3. Fetch observations, media, writing analysis, and preceding plan in parallel
  const fourMonthsAgo = new Date(now);
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

  const studentRef = db.collection("students").doc(studentId);

  const [obsSnap, mediaSnap, writingSnap, precedingPlanSnap] = await Promise.all([
    studentRef.collection("observations")
      .where("observedAt", ">=", fourMonthsAgo)
      .orderBy("observedAt", "desc")
      .get(),
    studentRef.collection("media")
      .where("observedAt", ">=", fourMonthsAgo)
      .orderBy("observedAt", "desc")
      .get(),
    studentRef.collection("ai_summaries").doc("writing_analysis").get(),
    studentRef.collection("ai_summaries").doc("monthly_plan").get(),
  ]);

  const observations = obsSnap.docs.map((d) => d.data());
  const mediaDocs = mediaSnap.docs.map((d) => d.data());
  const writingAnalysis = writingSnap.exists ? writingSnap.data() : null;
  const precedingPlan = precedingPlanSnap.exists ? precedingPlanSnap.data() : null;

  // Compute data window
  const allDates = observations
    .map((o) => o.observedAt?.toDate?.() ?? (o.observedAt ? new Date(o.observedAt) : null))
    .filter(Boolean);
  const dataWindowFrom = allDates.length > 0
    ? new Date(Math.min(...allDates)).toISOString().slice(0, 10)
    : fourMonthsAgo.toISOString().slice(0, 10);
  const dataWindowTo = allDates.length > 0
    ? new Date(Math.max(...allDates)).toISOString().slice(0, 10)
    : now.toISOString().slice(0, 10);

  // 4. Build user prompt
  const userPrompt = buildUserPrompt({
    profile: {
      displayName: studentData.displayName || studentId,
      studentId,
      ageStr,
      programId,
      targetMonth,
      joiningDate,
    },
    observations,
    mediaDocs,
    writingAnalysis,
    precedingPlan,
  });

  // 5. Call LLM via OpenRouter
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new functions.https.HttpsError("failed-precondition", "OPENROUTER_API_KEY not configured");
  }

  const body = buildChatBody({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_completion_tokens: maxTokens,
    response_format: { type: "json_object" },
  });

  let response;
  try {
    response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[generatePlanInternal] network error", err);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable: " + (err.message || "network error"));
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new functions.https.HttpsError("internal", `LLM error: ${response.status} — ${errText?.slice?.(0, 200)}`);
  }

  const json = await response.json().catch(() => {
    throw new functions.https.HttpsError("internal", "LLM returned non-JSON response");
  });
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  const totalTokens = json?.usage?.total_tokens || 0;

  if (!rawContent) {
    throw new functions.https.HttpsError("internal", "LLM returned empty response");
  }

  // 6. Parse LLM response
  let planData;
  try {
    planData = JSON.parse(rawContent);
  } catch (e) { // eslint-disable-line no-unused-vars
    console.error("[generatePlanInternal] JSON parse failed:", rawContent.slice(0, 500));
    throw new functions.https.HttpsError("internal", "LLM response is not valid JSON");
  }

  // 7. Archive previous plan (if exists) before overwriting
  const planDocRef = studentRef.collection("ai_summaries").doc("monthly_plan");
  if (precedingPlan && precedingPlan.month) {
    const historyKey = `${precedingPlan.month}_${now.toISOString().replace(/[:.]/g, "-")}`;
    await planDocRef.collection("history").doc(historyKey).set({
      ...precedingPlan,
      archivedAt: now.toISOString(),
      archivedReason: "overwritten by new plan generation",
    });
    console.log(`[generatePlanInternal] archived previous plan for ${studentId} (${historyKey})`);
  }

  // 8. Save new plan to active doc
  const planDoc = {
    ...planData,
    // Ensure metadata is set even if LLM omits it
    studentId,
    studentName: studentData.displayName || studentId,
    month: targetMonth,
    dataWindow: planData.dataWindow || {
      from: dataWindowFrom,
      to: dataWindowTo,
      observationCount: observations.length,
    },
    // System metadata
    generatedAt: now.toISOString(),
    generatedBy,
    generatedByName,
    model,
    totalTokens,
    status: "generated",
  };

  await planDocRef.set(planDoc);

  console.log(`[generatePlanInternal] ${studentId}: ${observations.length} obs, ${mediaDocs.length} media, ${totalTokens} tokens → ${targetMonth}`);

  return planDoc;
}

// ---------------------------------------------------------------------------
// Internal helper: export plan to Drive (no auth check)
// ---------------------------------------------------------------------------

/**
 * Core Drive export logic shared by the callable and the batch cron.
 *
 * Reads the plan from Firestore, creates two Google Docs (detailed plan +
 * task checklist) in the shared Drive, creates shortcuts in the student
 * folder, and persists Drive IDs back to Firestore.
 *
 * @param {string} studentId - Firestore student doc ID
 * @param {string} [exportedBy] - uid or "system:batchCron"
 * @returns {Promise<{driveDocId: string, driveDocLink: string, driveChecklistId: string, driveChecklistLink: string}>}
 */
async function exportPlanToDriveInternal(studentId, exportedBy) {
  // 1. Read plan from Firestore
  const planDocRef = db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("monthly_plan");
  const planSnap = await planDocRef.get();
  if (!planSnap.exists) {
    throw new functions.https.HttpsError("not-found", `No monthly plan found for student ${studentId}`);
  }
  const plan = planSnap.data();

  if (plan.status !== "generated") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Plan status is "${plan.status}", expected "generated"`,
    );
  }

  // 2. Resolve student + classroom + branch context
  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) {
    throw new functions.https.HttpsError("not-found", `Student ${studentId} not found`);
  }
  const studentData = studentSnap.data();
  const studentName = studentData?.displayName || studentData?.name || studentId;
  const classroomId = studentData?.classroomId;

  if (!classroomId) {
    throw new functions.https.HttpsError("failed-precondition", "Student has no classroom assignment");
  }

  const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
  const classroomData = classroomSnap.data();
  const classroomName = classroomData?.name || "Unknown Classroom";
  const programId = classroomData?.programId || "";
  const branchId = classroomData?.branchId || "";

  let branchName = capitalize(branchId);
  if (branchId) {
    const branchSnap = await db.collection("branches").doc(branchId).get();
    if (branchSnap.exists) {
      branchName = branchSnap.data()?.name || capitalize(branchId);
    }
  }
  const programName = capitalize(programId);

  // 3. Get/create Drive folder hierarchy
  const { drive, docs } = await getDriveClients();

  let classroomFolderId = classroomData?.driveFolderId;
  if (!classroomFolderId) {
    classroomFolderId = await getOrCreateClassroomFolder(
      drive, branchName, programName, classroomName,
    );
    await db.collection("classrooms").doc(classroomId).update({
      driveFolderId: classroomFolderId,
    });
  }

  // Create "Monthly Plans" → "{Month YYYY}" subfolder (canonical location)
  const monthlyPlansFolderId = await getOrCreateFolder(drive, classroomFolderId, "Monthly Plans");
  const monthLabel = formatMonthLabel(plan.month);
  const monthFolderId = await getOrCreateFolder(drive, monthlyPlansFolderId, monthLabel);

  // Student folder (for shortcuts) — create if absent
  const studentFolderId = await getOrCreateFolder(drive, classroomFolderId, studentName);

  // 4. Build student metadata for doc builders
  const meta = { classroomName };

  // 5. Trash any existing docs with the same name in both folders
  const planDocTitle = buildPlanDocTitle(studentName, plan.month);
  const checklistTitle = buildChecklistDocTitle(studentName, plan.month);
  await Promise.all([
    trashExistingDocsByName(drive, monthFolderId, planDocTitle),
    trashExistingDocsByName(drive, monthFolderId, checklistTitle),
    trashExistingDocsByName(drive, studentFolderId, planDocTitle),
    trashExistingDocsByName(drive, studentFolderId, checklistTitle),
  ]);

  // 6. Create Detailed Plan Google Doc
  const planFile = await drive.files.create({
    requestBody: {
      name: planDocTitle,
      mimeType: "application/vnd.google-apps.document",
      parents: [monthFolderId],
    },
    supportsAllDrives: true,
    fields: "id, webViewLink",
  });
  const driveDocId = planFile.data.id;
  const driveDocLink = planFile.data.webViewLink;

  const planRequests = buildDetailedPlanRequests(plan, meta);
  if (planRequests.length) {
    try {
      await docs.documents.batchUpdate({
        documentId: driveDocId,
        requestBody: { requests: planRequests },
      });
    } catch (err) {
      console.error("[exportPlanToDriveInternal] batchUpdate failed for plan doc:", err.message);
      // Trash orphaned doc
      try {
        await drive.files.update({ fileId: driveDocId, requestBody: { trashed: true }, supportsAllDrives: true });
      } catch (cleanupErr) {
        console.warn("[exportPlanToDriveInternal] failed to trash orphaned plan doc:", cleanupErr.message);
      }
      throw new functions.https.HttpsError("internal", "Failed to format plan document: " + err.message);
    }
  }

  // 7. Create Task Checklist Google Doc
  const checklistFile = await drive.files.create({
    requestBody: {
      name: checklistTitle,
      mimeType: "application/vnd.google-apps.document",
      parents: [monthFolderId],
    },
    supportsAllDrives: true,
    fields: "id, webViewLink",
  });
  const driveChecklistId = checklistFile.data.id;
  const driveChecklistLink = checklistFile.data.webViewLink;

  const checklistRequests = buildChecklistRequests(plan, meta);
  if (checklistRequests.length) {
    try {
      await docs.documents.batchUpdate({
        documentId: driveChecklistId,
        requestBody: { requests: checklistRequests },
      });
    } catch (err) {
      console.error("[exportPlanToDriveInternal] batchUpdate failed for checklist doc:", err.message);
      // Trash both orphaned docs — checklist + already-created plan doc
      try {
        await drive.files.update({ fileId: driveChecklistId, requestBody: { trashed: true }, supportsAllDrives: true });
      } catch (cleanupErr) {
        console.warn("[exportPlanToDriveInternal] failed to trash orphaned checklist doc:", cleanupErr.message);
      }
      try {
        await drive.files.update({ fileId: driveDocId, requestBody: { trashed: true }, supportsAllDrives: true });
      } catch (cleanupErr) {
        console.warn("[exportPlanToDriveInternal] failed to trash orphaned plan doc:", cleanupErr.message);
      }
      throw new functions.https.HttpsError("internal", "Failed to format checklist document: " + err.message);
    }
  }

  // 8. Create shortcuts in student folder
  try {
    await createShortcut(drive, studentFolderId, driveDocId, planDocTitle);
    await createShortcut(drive, studentFolderId, driveChecklistId, checklistTitle);
  } catch (err) {
    // Non-fatal — canonical docs exist, shortcuts are a convenience
    console.warn("[exportPlanToDriveInternal] shortcut creation failed:", err.message);
  }

  // 9. Persist Drive IDs back to Firestore (idempotency guard)
  await planDocRef.update({
    driveDocId,
    driveDocLink,
    driveChecklistId,
    driveChecklistLink,
    driveExportedAt: new Date().toISOString(),
    driveExportedBy: exportedBy || "unknown",
  });

  console.log(`[exportPlanToDriveInternal] ${studentId}: plan=${driveDocId}, checklist=${driveChecklistId}`);

  return { driveDocId, driveDocLink, driveChecklistId, driveChecklistLink };
}

// ---------------------------------------------------------------------------
// generateMonthlyPlan (callable)
// ---------------------------------------------------------------------------
export const generateMonthlyPlan = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB",
    secrets: [OPENROUTER_API_KEY],
  })
  .https.onCall(async (data, context) => {
    // Auth + role gate
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be signed in");
    }
    const callerUid = context.auth.uid;
    const callerDoc = await db.collection("users").doc(callerUid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only superadmins can generate monthly plans");
    }

    const { studentId, targetMonth } = data || {};
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    // Resolve target month (default: next month)
    const now = new Date();
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const resolvedMonth = targetMonth || `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

    const planDoc = await generatePlanInternal(
      studentId,
      resolvedMonth,
      callerUid,
      callerDoc.data().displayName || callerUid,
    );

    return {
      success: true,
      studentId,
      month: resolvedMonth,
      plan: planDoc,
    };
  });

// ---------------------------------------------------------------------------
// exportMonthlyPlanToDrive (callable, PEP-279)
// ---------------------------------------------------------------------------

export const exportMonthlyPlanToDrive = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 120, memory: "512MB" })
  .https.onCall(async (data, context) => {
    // Auth + role gate
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be signed in");
    }
    const callerUid = context.auth.uid;
    const callerDoc = await db.collection("users").doc(callerUid).get();
    if (!callerDoc.exists || callerDoc.data().role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only superadmins can export monthly plans");
    }

    const { studentId } = data || {};
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    const result = await exportPlanToDriveInternal(studentId, callerUid);

    return {
      status: "ok",
      studentId,
      ...result,
    };
  });

// ---------------------------------------------------------------------------
// batchGenerateMonthlyPlans (PEP-279) — scheduled cron
// ---------------------------------------------------------------------------

/**
 * Scheduled CF: runs on the 24th–27th of each month at midnight IST.
 * A runtime guard ensures it only executes on the correct day: last day
 * of the current month minus 4. This gives teachers exactly 4 days of
 * lead time regardless of month length:
 *   - Feb 28 → fires on 24th
 *   - Feb 29 (leap) → fires on 25th
 *   - 30-day months → fires on 26th
 *   - 31-day months → fires on 27th
 *
 * Generates + exports monthly plans for all active toddler/primary students.
 */
export const batchGenerateMonthlyPlans = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 540,
    memory: "1GB",
    secrets: [OPENROUTER_API_KEY],
  })
  .pubsub.schedule("0 0 24-27 * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    // Runtime guard: only execute on last-day-of-month minus 4.
    // Cloud Functions clock is UTC; cron fires at midnight IST (UTC+5:30),
    // so we must convert to IST before checking the date.
    const now = new Date();
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);
    const lastDay = new Date(istNow.getFullYear(), istNow.getMonth() + 1, 0).getDate();
    const targetDay = lastDay - 4;
    if (istNow.getDate() !== targetDay) {
      console.log(`[batchGenerateMonthlyPlans] skipping — IST day is ${istNow.getDate()}, target is ${targetDay}`);
      return null;
    }

    const startTime = Date.now();
    console.log("[batchGenerateMonthlyPlans] starting batch run");

    // Resolve target month (next month from current IST date)
    const nextMonth = new Date(istNow.getFullYear(), istNow.getMonth() + 1, 1);
    const targetMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

    // Fetch all active students
    const allStudentIds = await fetchActiveStudentIds();
    console.log(`[batchGenerateMonthlyPlans] ${allStudentIds.length} active students total`);

    // Filter to toddler/primary only — parallel reads (W4)
    const studentSnaps = await Promise.all(
      allStudentIds.map((id) => db.collection("students").doc(id).get()),
    );

    // Collect students needing classroom lookup vs directly eligible
    const needsClassroomLookup = [];
    const directEligible = [];
    for (const snap of studentSnaps) {
      if (!snap.exists) continue;
      const data = snap.data();
      if (["toddler", "primary"].includes(data.programId)) {
        directEligible.push(snap.id);
      } else if (data.classroomId) {
        needsClassroomLookup.push({ id: snap.id, classroomId: data.classroomId });
      }
    }

    // Batch classroom lookups
    const uniqueClassroomIds = [...new Set(needsClassroomLookup.map((s) => s.classroomId))];
    const classroomSnaps = await Promise.all(
      uniqueClassroomIds.map((id) => db.collection("classrooms").doc(id).get()),
    );
    const classroomProgramMap = {};
    for (const snap of classroomSnaps) {
      if (snap.exists) classroomProgramMap[snap.id] = snap.data().programId || null;
    }

    const fromClassroom = needsClassroomLookup
      .filter((s) => ["toddler", "primary"].includes(classroomProgramMap[s.classroomId]))
      .map((s) => s.id);

    const eligibleStudents = [...directEligible, ...fromClassroom];

    console.log(`[batchGenerateMonthlyPlans] ${eligibleStudents.length} eligible (toddler/primary)`);

    let generated = 0;
    let exported = 0;
    let failed = 0;

    // Process with bounded concurrency — errors are swallowed per-student
    await runWithConcurrency(eligibleStudents, async (studentId) => {
      try {
        // Step 1: Generate plan via shared internal helper
        await generatePlanInternal(
          studentId,
          targetMonth,
          "system:batchCron",
          "Monthly Plan Cron",
        );
        generated++;

        console.log(`[batchGenerateMonthlyPlans] generated plan for ${studentId} → ${targetMonth}`);

        // Step 2: Export to Drive via shared internal helper
        try {
          await exportPlanToDriveInternal(studentId, "system:batchCron");
          exported++;
          console.log(`[batchGenerateMonthlyPlans] exported to Drive for ${studentId}`);
        } catch (driveErr) {
          console.error(`[batchGenerateMonthlyPlans] Drive export failed for ${studentId}:`, driveErr.message);
          // Plan was generated but export failed — will be retried on next manual export
        }
      } catch (err) {
        failed++;
        console.error(`[batchGenerateMonthlyPlans] failed for ${studentId}:`, err.message);
      }
    }, 5); // concurrency limit: 5 (LLM calls are heavy)

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[batchGenerateMonthlyPlans] done in ${duration}s: ${generated} generated, ${exported} exported, ${failed} failed`);
    return null;
  });
