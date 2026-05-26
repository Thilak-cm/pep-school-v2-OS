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
 * batchGenerateMonthlyPlans — scheduled CF (24th of each month, midnight IST)
 * that generates + exports plans for all active toddler/primary students.
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
// generateMonthlyPlan
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

    // Resolve target month
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const resolvedMonth = targetMonth || `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

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
        targetMonth: resolvedMonth,
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
      console.error("[generateMonthlyPlan] network error", err);
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
      console.error("[generateMonthlyPlan] JSON parse failed:", rawContent.slice(0, 500));
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
      console.log(`[generateMonthlyPlan] archived previous plan for ${studentId} (${historyKey})`);
    }

    // 8. Save new plan to active doc
    const planDoc = {
      ...planData,
      // Ensure metadata is set even if LLM omits it
      studentId,
      studentName: studentData.displayName || studentId,
      month: resolvedMonth,
      dataWindow: planData.dataWindow || {
        from: dataWindowFrom,
        to: dataWindowTo,
        observationCount: observations.length,
      },
      // System metadata
      generatedAt: now.toISOString(),
      generatedBy: callerUid,
      generatedByName: callerDoc.data().displayName || callerUid,
      model,
      totalTokens,
      status: "generated",
    };

    await planDocRef.set(planDoc);

    console.log(`[generateMonthlyPlan] ${studentId}: ${observations.length} obs, ${mediaDocs.length} media, ${totalTokens} tokens → ${resolvedMonth}`);

    return {
      success: true,
      studentId,
      month: resolvedMonth,
      plan: planDoc,
    };
  });

// ---------------------------------------------------------------------------
// exportMonthlyPlanToDrive (PEP-279)
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

    // Idempotency: if Drive IDs already exist, return them
    if (plan.driveDocId && plan.driveChecklistId) {
      return {
        status: "ok",
        studentId,
        driveDocId: plan.driveDocId,
        driveDocLink: plan.driveDocLink,
        driveChecklistId: plan.driveChecklistId,
        driveChecklistLink: plan.driveChecklistLink,
      };
    }

    // 2. Resolve student + classroom + branch context
    const studentSnap = await db.collection("students").doc(studentId).get();
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
    // Derive student code from studentId or student doc
    const studentCode = studentData?.studentCode || studentId;
    const meta = {
      classroomName,
      studentCode,
      childNumber: "01", // Could be derived from classroom roster position
    };

    // 5. Create Detailed Plan Google Doc
    const planDocTitle = buildPlanDocTitle(studentName, plan.month);
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
        console.error("[exportMonthlyPlanToDrive] batchUpdate failed for plan doc:", err.message);
        // Trash orphaned doc
        try {
          await drive.files.update({ fileId: driveDocId, requestBody: { trashed: true }, supportsAllDrives: true });
        } catch (cleanupErr) {
          console.warn("[exportMonthlyPlanToDrive] failed to trash orphaned plan doc:", cleanupErr.message);
        }
        throw new functions.https.HttpsError("internal", "Failed to format plan document: " + err.message);
      }
    }

    // 6. Create Task Checklist Google Doc
    const checklistTitle = buildChecklistDocTitle(studentName, plan.month);
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
        console.error("[exportMonthlyPlanToDrive] batchUpdate failed for checklist doc:", err.message);
        try {
          await drive.files.update({ fileId: driveChecklistId, requestBody: { trashed: true }, supportsAllDrives: true });
        } catch (cleanupErr) {
          console.warn("[exportMonthlyPlanToDrive] failed to trash orphaned checklist doc:", cleanupErr.message);
        }
        throw new functions.https.HttpsError("internal", "Failed to format checklist document: " + err.message);
      }
    }

    // 7. Create shortcuts in student folder
    try {
      await createShortcut(drive, studentFolderId, driveDocId, planDocTitle);
      await createShortcut(drive, studentFolderId, driveChecklistId, checklistTitle);
    } catch (err) {
      // Non-fatal — canonical docs exist, shortcuts are a convenience
      console.warn("[exportMonthlyPlanToDrive] shortcut creation failed:", err.message);
    }

    // 8. Persist Drive IDs back to Firestore (idempotency guard)
    await planDocRef.update({
      driveDocId,
      driveDocLink,
      driveChecklistId,
      driveChecklistLink,
      driveExportedAt: new Date().toISOString(),
      driveExportedBy: callerUid,
    });

    console.log(`[exportMonthlyPlanToDrive] ${studentId}: plan=${driveDocId}, checklist=${driveChecklistId}`);

    return {
      status: "ok",
      studentId,
      driveDocId,
      driveDocLink,
      driveChecklistId,
      driveChecklistLink,
    };
  });

// ---------------------------------------------------------------------------
// batchGenerateMonthlyPlans (PEP-279) — scheduled cron
// ---------------------------------------------------------------------------

/**
 * Scheduled CF: runs on the 24th of each month at midnight IST.
 * Generates + exports monthly plans for all active toddler/primary students.
 *
 * Why the 24th: gives teachers 4–7 days to read the detailed plan
 * before the new month starts (4 days in Feb, 7 in 31-day months).
 */
export const batchGenerateMonthlyPlans = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 540,
    memory: "1GB",
    secrets: [OPENROUTER_API_KEY],
  })
  .pubsub.schedule("0 0 24 * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const startTime = Date.now();
    console.log("[batchGenerateMonthlyPlans] starting batch run");

    // Resolve target month (next month from current date)
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const targetMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

    // Fetch all active students
    const allStudentIds = await fetchActiveStudentIds();
    console.log(`[batchGenerateMonthlyPlans] ${allStudentIds.length} active students total`);

    // Filter to toddler/primary only
    const eligibleStudents = [];
    for (const studentId of allStudentIds) {
      const studentSnap = await db.collection("students").doc(studentId).get();
      if (!studentSnap.exists) continue;
      const studentData = studentSnap.data();

      let programId = studentData.programId || null;
      if (!programId && studentData.classroomId) {
        const classroomSnap = await db.collection("classrooms").doc(studentData.classroomId).get();
        if (classroomSnap.exists) {
          programId = classroomSnap.data().programId || null;
        }
      }
      if (["toddler", "primary"].includes(programId)) {
        eligibleStudents.push(studentId);
      }
    }

    console.log(`[batchGenerateMonthlyPlans] ${eligibleStudents.length} eligible (toddler/primary)`);

    let generated = 0;
    let exported = 0;
    let failed = 0;

    // Process with bounded concurrency — errors are swallowed per-student
    await runWithConcurrency(eligibleStudents, async (studentId) => {
      try {
        // Step 1: Generate plan via internal call (bypasses auth since we're server-side)
        const config = await getMonthlyPlanConfig();
        const studentSnap = await db.collection("students").doc(studentId).get();
        const studentData = studentSnap.data();
        const dob = studentData.dateOfBirth?.toDate?.()
          ?? (studentData.dateOfBirth ? new Date(studentData.dateOfBirth) : null);
        const age = calculateAge(dob, now);
        const ageStr = age ? `${age.years}y ${age.months}m` : "unknown age";

        let programId = studentData.programId || null;
        if (!programId && studentData.classroomId) {
          const classroomSnap = await db.collection("classrooms").doc(studentData.classroomId).get();
          if (classroomSnap.exists) {
            programId = classroomSnap.data().programId || null;
          }
        }
        programId = programId || "unknown";

        const studentRef = db.collection("students").doc(studentId);
        const fourMonthsAgo = new Date(now);
        fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

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

        const allDates = observations
          .map((o) => o.observedAt?.toDate?.() ?? (o.observedAt ? new Date(o.observedAt) : null))
          .filter(Boolean);
        const dataWindowFrom = allDates.length > 0
          ? new Date(Math.min(...allDates)).toISOString().slice(0, 10)
          : fourMonthsAgo.toISOString().slice(0, 10);
        const dataWindowTo = allDates.length > 0
          ? new Date(Math.max(...allDates)).toISOString().slice(0, 10)
          : now.toISOString().slice(0, 10);

        const userPrompt = buildUserPrompt({
          profile: {
            displayName: studentData.displayName || studentId,
            studentId,
            ageStr,
            programId,
            targetMonth,
          },
          observations,
          mediaDocs,
          writingAnalysis,
          precedingPlan,
        });

        const apiKey = getOpenRouterKey();
        const model = config.model || "gpt-5.4";
        const body = buildChatBody({
          model,
          messages: [
            { role: "system", content: config.systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: config.temperature ?? 0.3,
          max_completion_tokens: config.max_tokens || 8000,
          response_format: { type: "json_object" },
        });

        const response = await fetch(OPENROUTER_ENDPOINT, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          throw new Error(`LLM error: ${response.status} — ${errText?.slice?.(0, 200)}`);
        }

        const json = await response.json();
        const rawContent = json?.choices?.[0]?.message?.content?.trim();
        if (!rawContent) throw new Error("LLM returned empty response");

        const planData = JSON.parse(rawContent);

        // Archive previous plan
        const planDocRef = studentRef.collection("ai_summaries").doc("monthly_plan");
        if (precedingPlan && precedingPlan.month) {
          const historyKey = `${precedingPlan.month}_${now.toISOString().replace(/[:.]/g, "-")}`;
          await planDocRef.collection("history").doc(historyKey).set({
            ...precedingPlan,
            archivedAt: now.toISOString(),
            archivedReason: "overwritten by batch cron",
          });
        }

        // Save new plan
        const planDoc = {
          ...planData,
          studentId,
          studentName: studentData.displayName || studentId,
          month: targetMonth,
          dataWindow: planData.dataWindow || {
            from: dataWindowFrom,
            to: dataWindowTo,
            observationCount: observations.length,
          },
          generatedAt: now.toISOString(),
          generatedBy: "system:batchCron",
          generatedByName: "Monthly Plan Cron",
          model,
          totalTokens: json?.usage?.total_tokens || 0,
          status: "generated",
        };
        await planDocRef.set(planDoc);
        generated++;

        console.log(`[batchGenerateMonthlyPlans] generated plan for ${studentId} → ${targetMonth}`);

        // Step 2: Export to Drive
        try {
          const classroomId = studentData.classroomId;
          if (!classroomId) throw new Error("No classroom assignment");

          const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
          const classroomData = classroomSnap.data();
          const classroomName = classroomData?.name || "Unknown Classroom";
          const clsProgramId = classroomData?.programId || "";
          const branchId = classroomData?.branchId || "";

          let branchName = capitalize(branchId);
          if (branchId) {
            const branchSnap = await db.collection("branches").doc(branchId).get();
            if (branchSnap.exists) branchName = branchSnap.data()?.name || capitalize(branchId);
          }

          const { drive, docs } = await getDriveClients();

          let classroomFolderId = classroomData?.driveFolderId;
          if (!classroomFolderId) {
            classroomFolderId = await getOrCreateClassroomFolder(
              drive, branchName, capitalize(clsProgramId), classroomName,
            );
            await db.collection("classrooms").doc(classroomId).update({ driveFolderId: classroomFolderId });
          }

          const monthlyPlansFolderId = await getOrCreateFolder(drive, classroomFolderId, "Monthly Plans");
          const monthLabel = formatMonthLabel(targetMonth);
          const monthFolderId = await getOrCreateFolder(drive, monthlyPlansFolderId, monthLabel);
          const studentFolderId = await getOrCreateFolder(drive, classroomFolderId, studentData.displayName || studentId);

          const studentCode = studentData.studentCode || studentId;
          const meta = { classroomName, studentCode, childNumber: "01" };

          // Detailed plan doc
          const planDocTitle = buildPlanDocTitle(studentData.displayName || studentId, targetMonth);
          const planFile = await drive.files.create({
            requestBody: { name: planDocTitle, mimeType: "application/vnd.google-apps.document", parents: [monthFolderId] },
            supportsAllDrives: true,
            fields: "id, webViewLink",
          });
          const planRequests = buildDetailedPlanRequests(planDoc, meta);
          if (planRequests.length) {
            await docs.documents.batchUpdate({
              documentId: planFile.data.id,
              requestBody: { requests: planRequests },
            });
          }

          // Checklist doc
          const checklistTitle = buildChecklistDocTitle(studentData.displayName || studentId, targetMonth);
          const checklistFile = await drive.files.create({
            requestBody: { name: checklistTitle, mimeType: "application/vnd.google-apps.document", parents: [monthFolderId] },
            supportsAllDrives: true,
            fields: "id, webViewLink",
          });
          const checklistRequests = buildChecklistRequests(planDoc, meta);
          if (checklistRequests.length) {
            await docs.documents.batchUpdate({
              documentId: checklistFile.data.id,
              requestBody: { requests: checklistRequests },
            });
          }

          // Shortcuts in student folder (best-effort)
          try {
            await createShortcut(drive, studentFolderId, planFile.data.id, planDocTitle);
            await createShortcut(drive, studentFolderId, checklistFile.data.id, checklistTitle);
          } catch (shortcutErr) {
            console.warn(`[batchGenerateMonthlyPlans] shortcut failed for ${studentId}:`, shortcutErr.message);
          }

          // Persist Drive IDs
          await planDocRef.update({
            driveDocId: planFile.data.id,
            driveDocLink: planFile.data.webViewLink,
            driveChecklistId: checklistFile.data.id,
            driveChecklistLink: checklistFile.data.webViewLink,
            driveExportedAt: new Date().toISOString(),
            driveExportedBy: "system:batchCron",
          });

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
