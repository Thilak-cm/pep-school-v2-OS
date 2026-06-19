import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey, buildChatBody, CHAT_ENDPOINT } from "../shared/openai.js";
import { REPORT_DEFAULTS, READINESS_DEFAULTS, READINESS_DOC_ID, DRIVE_CONSTANTS, buildCsvFilename, buildArchiveCsvFilename, buildMonthlyBaselineCsvFilename } from "../config/reportConstants.js";
import { getDefaultDateRange, parseReportResponse, parseReadinessResponse, getReportPromptDocId, getReadinessPromptDocId, mergeReportConfig, formatCsvRow, updateCsvContent, removeCsvRow, appendCsvContent, normalizeEndOfDay, assembleReportSystemContent, buildReadinessArchive } from "../utils/reportHelpers.js";
import {
  getDriveClients,
  getOrCreateClassroomFolder,
  getOrCreateFolder,
  createReportDoc,
  downloadCsvContent,
  updateDriveSummaryCsv,
  migrateLegacyCsv,
  resolveStudentName,
  capitalize,
  trashDriveFile,
  deriveAcademicYear,
} from "../utils/driveHelpers.js";
import {
  chooseObservationTimestamp,
  formatObservationForPrompt,
  getStudentWithProgram,
} from "../shared/studentHelpers.js";

// ── Report config cache + helpers ───────────────────────────────────────────

const REPORT_PROMPT_CACHE_TTL_MS = 5 * 60 * 1000;

const reportConfigCache = {};

async function getReportConfig(programId, { forceRefresh = false, reportType = "term" } = {}) {
  const docId = getReportPromptDocId(programId, reportType);
  if (!docId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Unsupported program for report generation: ${programId}`,
    );
  }

  const cached = reportConfigCache[docId];
  if (!forceRefresh && cached?.data && (Date.now() - cached.ts < REPORT_PROMPT_CACHE_TTL_MS)) {
    return cached.data;
  }

  const snap = await db.collection("config").doc(docId).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      `Report config not found for program: ${programId}. Run migrate-ai-prompts-to-config.mjs --apply`,
    );
  }

  const data = snap.data() || {};

  // Prompt fields
  const staticSystemPrompt = String(data.staticSystemPrompt || "");
  const dynamicSystemPrompt = String(data.dynamicSystemPrompt || "");
  const title = String(data.title || "");
  const description = String(data.description || "");
  const version = Number.isFinite(data.version) ? data.version : 1;

  if (!staticSystemPrompt) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Report config for ${programId} has empty staticSystemPrompt`,
    );
  }

  // Model config with fallback to defaults
  const out = {
    staticSystemPrompt,
    dynamicSystemPrompt,
    title,
    description,
    version,
    model: data.model || REPORT_DEFAULTS.model,
    temperature: Number.isFinite(data.temperature) ? data.temperature : REPORT_DEFAULTS.temperature,
    max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : REPORT_DEFAULTS.max_tokens,
    timezone: data.timezone || REPORT_DEFAULTS.timezone,
  };

  reportConfigCache[docId] = { data: out, ts: Date.now() };
  return out;
}

function fetchStudentNotesForDateRange(studentId, startDate, endDate) {
  const notesMap = new Map();
  const studentObsRef = db.collection("students").doc(studentId).collection("observations");

  const collect = async (field) => {
    try {
      const snap = await studentObsRef
        .where(field, ">=", startDate)
        .where(field, "<=", endDate)
        .get();
      snap.docs.forEach((d) => {
        notesMap.set(d.id, { id: d.id, ...d.data() });
      });
    } catch (err) {
      console.warn(`[report] query failed for field ${field} student ${studentId}:`, err);
    }
  };

  return (async () => {
    await collect("observedAt");
    await collect("createdAt");
    await collect("timestamp");

    const notes = Array.from(notesMap.values()).filter((n) => {
      const ts = chooseObservationTimestamp(n);
      return ts && ts >= startDate && ts <= endDate;
    });

    notes.sort((a, b) => {
      const ta = chooseObservationTimestamp(a);
      const tb = chooseObservationTimestamp(b);
      return (ta?.getTime() || 0) - (tb?.getTime() || 0);
    });

    return notes;
  })();
}


const REPORT_JSON_WRAPPER = `

IMPORTANT: You must output your response as a JSON object with exactly this structure:
{
  "reportText": "<the full report narrative as a single string, using \\n for line breaks and ## for section headers>"
}

The reportText should contain the complete parent-facing report following the prompt instructions above.
Output ONLY the JSON object, nothing else.`;

async function callReportGeneration(notes, prompt, studentContext, dateRange, config = REPORT_DEFAULTS, reportType = "term") {
  const openAiKey = getOpenAiKey();
  if (!openAiKey) {
    throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
  }

  const safeContext = {
    studentName: studentContext?.studentName || "Unknown student",
    dob: studentContext?.dob || "dob unavailable in context",
    age: studentContext?.age || "age unavailable",
  };

  const systemContent = assembleReportSystemContent(
    prompt.staticSystemPrompt,
    prompt.dynamicSystemPrompt,
    REPORT_JSON_WRAPPER,
  );

  const startStr = dateRange.start instanceof Date
    ? dateRange.start.toISOString().split("T")[0]
    : String(dateRange.start);
  const endStr = dateRange.end instanceof Date
    ? dateRange.end.toISOString().split("T")[0]
    : String(dateRange.end);

  const userContent = [
    `Generate the ${reportType === "monthly" ? "Monthly Baseline Report" : "Educator Summary"} for the period ${startStr} to ${endStr}.`,
    "",
    `Student: ${JSON.stringify(safeContext)}`,
    "",
    `Notes (${notes.length} observations, JSON array):`,
    JSON.stringify(notes),
  ].join("\n");

  const body = buildChatBody({
    model: config.model || REPORT_DEFAULTS.model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    temperature: Number.isFinite(config.temperature) ? config.temperature : REPORT_DEFAULTS.temperature,
    max_completion_tokens: Number.isFinite(config.max_tokens) ? config.max_tokens : REPORT_DEFAULTS.max_tokens,
    response_format: { type: "json_object" },
  });

  let response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[report] network error", e);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[report] OpenAI error", response.status, errText?.slice?.(0, 400));
    throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new functions.https.HttpsError("internal", "AI returned no content");
  }

  return parseReportResponse(rawContent);
}

async function writeReportDoc(studentId, payload, docId) {
  const resolvedId = docId || `report_${Date.now()}`;
  const ref = db.collection("students").doc(studentId).collection("ai_summaries").doc(resolvedId);
  const enriched = { ...payload, studentId, kind: "report" };
  await ref.set(enriched);
  return resolvedId;
}

async function runSingleReport({ studentId, dateRangeStart, dateRangeEnd, requesterId, requesterName, configOverrides, promptOverride, dryRun = false, reportType = "term" }) {
  const studentInfo = await getStudentWithProgram(studentId);
  if (!studentInfo.programId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Student ${studentId} has no associated program. Check classroom assignment.`,
    );
  }

  const baseConfig = await getReportConfig(studentInfo.programId, { reportType });
  const config = configOverrides
    ? mergeReportConfig(configOverrides, baseConfig)
    : baseConfig;

  const prompt = promptOverride
    ? { ...baseConfig, staticSystemPrompt: promptOverride.staticSystemPrompt || baseConfig.staticSystemPrompt, dynamicSystemPrompt: promptOverride.dynamicSystemPrompt || baseConfig.dynamicSystemPrompt }
    : baseConfig;

  if (!prompt.staticSystemPrompt) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "staticSystemPrompt cannot be empty",
    );
  }

  const startDate = dateRangeStart ? new Date(dateRangeStart) : getDefaultDateRange().start;
  const endDate = dateRangeEnd ? normalizeEndOfDay(new Date(dateRangeEnd)) : new Date();

  const notes = await fetchStudentNotesForDateRange(studentId, startDate, endDate);

  if (!notes.length) {
    const payload = {
      reportText: "",
      noteCount: 0,
      reportType,
      dateRangeStart: startDate,
      dateRangeEnd: endDate,
      programId: studentInfo.programId,
      classroomId: studentInfo.classroomId || null,
      model: config.model,
      generatedAt: new Date(),
      generatedBy: requesterId,
      generatedByName: requesterName || null,
      status: "no_notes",
      sourceNoteIds: [],
    };
    if (!dryRun) {
      const docId = await writeReportDoc(studentId, payload);
      return { studentId, status: "no_notes", docId, payload };
    }
    return { studentId, status: "no_notes", payload };
  }

  const formatted = notes.map(formatObservationForPrompt);
  const aiResult = await callReportGeneration(formatted, prompt, studentInfo, { start: startDate, end: endDate }, config, reportType);
  const sourceNoteIds = notes.map((n) => n.id).filter(Boolean);

  const payload = {
    reportText: aiResult.reportText,
    noteCount: formatted.length,
    reportType,
    dateRangeStart: startDate,
    dateRangeEnd: endDate,
    programId: studentInfo.programId,
    classroomId: studentInfo.classroomId || null,
    model: config.model,
    generatedAt: new Date(),
    generatedBy: requesterId,
    generatedByName: requesterName || null,
    status: "ok",
    sourceNoteIds,
  };

  if (!dryRun) {
    const docId = await writeReportDoc(studentId, payload);
    return { studentId, status: "ok", docId, payload };
  }
  return { studentId, status: "ok", payload };
}

async function checkReportPermission(uid, studentId) {
  const requesterSnap = await db.collection("users").doc(uid).get();
  if (!requesterSnap.exists) {
    throw new functions.https.HttpsError("permission-denied", "User not found");
  }
  const requester = requesterSnap.data();
  const role = requester.role;
  const displayName = requester.displayName || requester.name || null;

  if (role === "superadmin") return { displayName };

  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) {
    throw new functions.https.HttpsError("not-found", `Student not found: ${studentId}`);
  }
  const classroomId = studentSnap.data()?.classroomId;

  if (role === "classroomadmin" || role === "admin") {
    const manageable = requester.manageableClassrooms || [];
    if (classroomId && manageable.includes(classroomId)) return { displayName };
    throw new functions.https.HttpsError("permission-denied", "Classroom admin does not manage this student's classroom");
  }

  if (role === "teacher") {
    if (classroomId) {
      const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
      const teacherIds = classroomSnap.data()?.teacherIds || [];
      if (teacherIds.includes(uid)) return { displayName };
    }
    throw new functions.https.HttpsError("permission-denied", "Teacher is not assigned to this student's classroom");
  }

  throw new functions.https.HttpsError("permission-denied", "Insufficient permissions");
}

// ── Exported Cloud Functions ────────────────────────────────────────────────

export const generateStudentReport = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    const { displayName: requesterName } = await checkReportPermission(context.auth.uid, studentId);
    const reportType = data?.reportType === "monthly" ? "monthly" : "term";

    const result = await runSingleReport({
      studentId,
      dateRangeStart: data?.dateRangeStart || null,
      dateRangeEnd: data?.dateRangeEnd || null,
      requesterId: context.auth.uid,
      requesterName,
      reportType,
      dryRun: true,
    });

    return {
      status: result.status,
      studentId: result.studentId,
      noteCount: result.payload.noteCount,
      reportText: result.payload.reportText,
      reportType: result.payload.reportType,
      dateRangeStart: result.payload.dateRangeStart?.toISOString?.() || null,
      dateRangeEnd: result.payload.dateRangeEnd?.toISOString?.() || null,
      programId: result.payload.programId,
      model: result.payload.model,
      sourceNoteIds: result.payload.sourceNoteIds,
      generatedAt: result.payload.generatedAt?.toISOString?.() || new Date().toISOString(),
      generatedBy: result.payload.generatedBy,
      generatedByName: result.payload.generatedByName,
    };
  });

export const previewStudentReport = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    const requesterRole = requesterSnap.data()?.role;
    if (!requesterSnap.exists || requesterRole !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only super admins can preview reports");
    }

    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    const result = await runSingleReport({
      studentId,
      dateRangeStart: data?.dateRangeStart || null,
      dateRangeEnd: data?.dateRangeEnd || null,
      requesterId: context.auth.uid,
      configOverrides: data?.config || null,
      promptOverride: (typeof data?.staticSystemPrompt === "string" && data.staticSystemPrompt.trim()) || (typeof data?.dynamicSystemPrompt === "string" && data.dynamicSystemPrompt.trim())
        ? { staticSystemPrompt: data.staticSystemPrompt, dynamicSystemPrompt: data.dynamicSystemPrompt }
        : null,
      dryRun: true,
    });

    return {
      status: result.status,
      studentId: result.studentId,
      noteCount: result.payload.noteCount,
      reportText: result.payload.reportText,
      model: result.payload.model,
      generatedAt: result.payload.generatedAt?.toISOString?.() || new Date().toISOString(),
    };
  });

// ─── Google Drive Export ────────────────────────────────────────────────────

/**
 * Export a single student report to Google Drive as a Google Doc.
 * Creates classroom folder if needed, creates doc, updates summary CSV.
 */
export const exportReportToDrive = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 120, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const studentId = String(data?.studentId || "").trim();
    const reportDocId = String(data?.reportDocId || "").trim();
    const reportPayload = data?.reportPayload || null;

    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }
    if (!reportDocId && !reportPayload) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Either reportDocId or reportPayload is required",
      );
    }
    if (reportPayload && !reportDocId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "reportDocId is required when reportPayload is provided",
      );
    }

    // Permission check (same as report generation)
    const { displayName: requesterName } = await checkReportPermission(context.auth.uid, studentId);

    // Resolve report data: from Firestore (existing report) or from payload (draft)
    let report;
    let reportRef;
    if (reportDocId && reportPayload) {
      // Idempotent draft path — client provided a stable reportDocId with a draft payload.
      // Check if this report was already created by a previous attempt.
      reportRef = db.collection("students").doc(studentId)
        .collection("ai_summaries").doc(reportDocId);
      const existingSnap = await reportRef.get();
      if (existingSnap.exists) {
        const existingReport = existingSnap.data();
        if (existingReport.driveDocId) {
          // Previous attempt fully completed — return existing data (idempotent retry).
          // Read studentName from the stored doc to avoid an extra Firestore read.
          const earlyStudentName = existingReport.studentName || "Student";
          return {
            status: "ok",
            docId: reportDocId,
            driveDocId: existingReport.driveDocId,
            driveDocLink: existingReport.driveDocLink,
            studentName: earlyStudentName,
          };
        }
        // Previous attempt wrote pending_drive but crashed before Drive completion.
        // Re-use the saved report data and proceed to Drive work.
        if (!existingReport.reportText) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "Stored pending_drive report has no content — cannot resume export",
          );
        }
        report = existingReport;
      } else {
        // First attempt — build report from payload.
        report = {
          reportText: reportPayload.reportText,
          noteCount: reportPayload.noteCount ?? 0,
          reportType: reportPayload.reportType || "term",
          dateRangeStart: reportPayload.dateRangeStart ? new Date(reportPayload.dateRangeStart) : null,
          dateRangeEnd: reportPayload.dateRangeEnd ? new Date(reportPayload.dateRangeEnd) : null,
          programId: reportPayload.programId || "",
          model: reportPayload.model || "",
          sourceNoteIds: reportPayload.sourceNoteIds || [],
          generatedAt: reportPayload.generatedAt ? new Date(reportPayload.generatedAt) : new Date(),
          generatedBy: reportPayload.generatedBy || context.auth.uid,
          generatedByName: reportPayload.generatedByName || requesterName || null,
          status: "pending_drive",
        };
        if (!report.reportText) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "reportPayload.reportText is required",
          );
        }
      }
    } else if (reportDocId) {
      // Existing report path — load from Firestore
      reportRef = db.collection("students").doc(studentId)
        .collection("ai_summaries").doc(reportDocId);
      const reportSnap = await reportRef.get();
      if (!reportSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Report not found");
      }
      report = reportSnap.data();
    }

    if (!report.reportText) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Report has no content to export",
      );
    }

    // Get student + classroom info
    const studentSnap = await db.collection("students").doc(studentId).get();
    const studentData = studentSnap.data();
    const studentName = resolveStudentName(studentData);
    const classroomId = studentData?.classroomId;

    if (!classroomId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Student has no classroom assignment",
      );
    }

    // For first-attempt drafts, persist the pending_drive doc now that we have
    // studentName (single read).  This claims the reportDocId before Drive work.
    if (reportRef && report.status === "pending_drive" && !report.studentName) {
      report.studentName = studentName;
      report.studentId = studentId;
      report.classroomId = classroomId;
      report.kind = "report";
      await reportRef.set(report);
    }

    const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
    const classroomData = classroomSnap.data();
    const classroomName = classroomData?.name || "Unknown Classroom";
    const programId = classroomData?.programId || "";
    const branchId = classroomData?.branchId || "";

    // Resolve branch display name
    let branchName = capitalize(branchId);
    if (branchId) {
      const branchSnap = await db.collection("branches").doc(branchId).get();
      if (branchSnap.exists) {
        branchName = branchSnap.data()?.name || capitalize(branchId);
      }
    }
    const programName = capitalize(programId);

    // Get or create Drive folder hierarchy: Branch → Program → Classroom
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

    // Create student subfolder inside classroom folder
    const studentFolderId = await getOrCreateFolder(
      drive, classroomFolderId, studentName,
    );

    // For monthly reports, create a "Monthly Reports" subfolder; term reports go directly in student folder (PEP-325)
    const isMonthly = (report.reportType || "term") === "monthly";
    const reportFolderId = isMonthly
      ? await getOrCreateFolder(drive, studentFolderId, "Monthly Reports")
      : studentFolderId;

    // Handle both Firestore Timestamp (.toDate()) and plain JS Date (.toISOString())
    const generatedAtIso = (report.generatedAt?.toDate?.() || report.generatedAt)?.toISOString?.() || new Date().toISOString();

    // Create the Google Doc in the appropriate folder (Drive first to minimize orphans)
    const academicYear = deriveAcademicYear(new Date());
    const reportStartDate = reportDocId
      ? (report.dateRangeStart?.toDate?.() || report.dateRangeStart)
      : report.dateRangeStart;
    const { docId: driveDocId, docLink } = await createReportDoc(
      drive, docs, reportFolderId, studentName, report.reportText,
      generatedAtIso,
      { programName, academicYear, startDate: reportStartDate, reportType: report.reportType || "term" },
    );

    // Persist driveDocId immediately so retries find it and skip Drive creation.
    // This narrows the unguarded window to near-zero — if the function crashes
    // during CSV work below, the next retry will hit the early-return path.
    // Note: if this update itself fails (e.g. network error after Drive creation),
    // the next retry will create a new Google Doc — this is an accepted narrow
    // residual window (PEP-101).
    if (reportRef && reportPayload) {
      await reportRef.update({ driveDocId, driveDocLink: docLink });
    }

    // Update summary + archive CSVs in classroom folder (best-effort)
    // Read scores from readiness cache (PEP-68)
    let readinessScores = { sentimentScore: null, areaBalanceScore: null, missingInputFlags: [] };
    try {
      const readinessSnap = await db.collection("students").doc(studentId)
        .collection("ai_summaries").doc(READINESS_DOC_ID).get();
      if (readinessSnap.exists) {
        const rd = readinessSnap.data();
        readinessScores = {
          sentimentScore: rd.sentimentScore ?? null,
          areaBalanceScore: rd.areaBalanceScore ?? null,
          missingInputFlags: rd.missingInputFlags || [],
        };
      }
    } catch (readinessErr) {
      console.warn("[drive-export] readiness doc read failed (non-blocking):", readinessErr);
    }

    try {
      const csvRow = formatCsvRow({
        studentName,
        branch: branchName,
        program: programName,
        classroom: classroomName,
        generatedAt: generatedAtIso,
        author: report.generatedByName || "",
        sentimentScore: readinessScores.sentimentScore,
        areaBalanceScore: readinessScores.areaBalanceScore,
        missingInputFlags: readinessScores.missingInputFlags,
        docLink,
      });

      const summaryCsvName = isMonthly
        ? buildMonthlyBaselineCsvFilename(classroomName)
        : buildCsvFilename(classroomName);
      const archiveCsvName = buildArchiveCsvFilename(classroomName);

      // Migrate legacy CSV if it exists under the old name
      await migrateLegacyCsv(drive, classroomFolderId, summaryCsvName);

      // Summary CSV: one row per student (replace on regeneration)
      const existingCsv = await downloadCsvContent(drive, classroomFolderId, summaryCsvName);
      const newCsv = updateCsvContent(existingCsv, csvRow, studentName, DRIVE_CONSTANTS.csvHeaders);
      await updateDriveSummaryCsv(drive, classroomFolderId, newCsv, summaryCsvName);

      // Archive CSV: append-only (accumulates historical rows)
      const existingArchive = await downloadCsvContent(drive, classroomFolderId, archiveCsvName);
      const newArchive = appendCsvContent(existingArchive, csvRow, DRIVE_CONSTANTS.csvHeaders);
      await updateDriveSummaryCsv(drive, classroomFolderId, newArchive, archiveCsvName);
    } catch (csvError) {
      console.warn("[drive-export] CSV update failed (non-blocking):", csvError);
    }

    // Write to Firestore — update existing doc or finalize pending draft
    let docId;
    if (reportDocId && reportPayload) {
      // Idempotent draft path — doc already exists (written as pending_drive).
      // driveDocId and driveDocLink were already persisted right after createReportDoc.
      // Finalize status and attach studentName.
      await reportRef.update({
        status: "ok",
        studentName,
        studentId,
        classroomId,
        kind: "report",
      });
      docId = reportDocId;
    } else if (reportDocId) {
      // Existing report path — just attach the Drive link
      await reportRef.update({ driveDocId, driveDocLink: docLink });
      docId = reportDocId;
    } else {
      // Fallback — should not be reached given validation above
      docId = await writeReportDoc(studentId, {
        ...report,
        driveDocId,
        driveDocLink: docLink,
      });
    }

    return {
      status: "ok",
      docId,
      driveDocId,
      driveDocLink: docLink,
      studentName,
    };
  });

// ── Report Readiness Checker (PEP-68) ─────────────────────────────────────────

const READINESS_JSON_WRAPPER = `

IMPORTANT: You must output your response as a JSON object with exactly this structure:
{
  "sentimentScore": <integer 1-5>,
  "areaBalanceScore": <integer 1-5>,
  "missingInputFlags": ["<flag1>", "<flag2>"]
}

The sentimentScore and areaBalanceScore should follow the scoring rubrics in the prompt.
The missingInputFlags should list any curriculum domains with zero or very few observations.
Return an empty array [] for missingInputFlags if coverage is adequate.
Output ONLY the JSON object, nothing else.`;

let readinessPromptCache = {};

async function getReadinessPrompt(programId) {
  const docId = getReadinessPromptDocId(programId);
  if (!docId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `This student's classroom has no program configured (programId: ${programId}). Ask an administrator to set the program for the classroom.`,
    );
  }

  const cached = readinessPromptCache[docId];
  if (cached?.data && (Date.now() - cached.ts < REPORT_PROMPT_CACHE_TTL_MS)) {
    return cached.data;
  }

  const snap = await db.collection("config").doc(docId).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      `Readiness config not found for program: ${programId}. Run migrate-ai-prompts-to-config.mjs --apply`,
    );
  }

  const data = snap.data() || {};
  const prompt = {
    systemPrompt: String(data.systemPrompt || ""),
    version: Number.isFinite(data.version) ? data.version : 1,
    model: data.model || READINESS_DEFAULTS.model,
    temperature: typeof data.temperature === "number" ? data.temperature : READINESS_DEFAULTS.temperature,
    max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : READINESS_DEFAULTS.max_tokens,
  };

  if (!prompt.systemPrompt) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Readiness config for ${programId} has empty systemPrompt`,
    );
  }

  readinessPromptCache[docId] = { data: prompt, ts: Date.now() };
  return prompt;
}

async function writeReadinessDoc(studentId, payload, displayName) {
  const ref = db.collection("students").doc(studentId)
    .collection("ai_summaries").doc(READINESS_DOC_ID);

  const existingSnap = await ref.get();
  const archive = existingSnap.exists
    ? buildReadinessArchive(existingSnap.data(), `Readiness recheck by ${displayName || "unknown"}`)
    : null;

  const batch = db.batch();
  if (archive) {
    const historyRef = ref.collection("history").doc(Date.now().toString());
    batch.set(historyRef, archive);
  }
  batch.set(ref, payload);
  await batch.commit();
}

export const checkReportReadiness = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    const { displayName } = await checkReportPermission(context.auth.uid, studentId);

    const studentInfo = await getStudentWithProgram(studentId);
    const prompt = await getReadinessPrompt(studentInfo.programId);

    const dateRangeStart = data?.dateRangeStart || null;
    const dateRangeEnd = data?.dateRangeEnd || null;
    const startDate = dateRangeStart ? new Date(dateRangeStart) : getDefaultDateRange().start;
    const endDate = dateRangeEnd ? normalizeEndOfDay(new Date(dateRangeEnd)) : new Date();

    const notes = await fetchStudentNotesForDateRange(studentId, startDate, endDate);

    if (!notes.length) {
      const payload = {
        sentimentScore: null,
        areaBalanceScore: null,
        missingInputFlags: ["No observations found in date range"],
        noteCount: 0,
        noteCountAtCheck: 0,
        checkedAt: new Date(),
        dateRangeStart: startDate,
        dateRangeEnd: endDate,
        programId: studentInfo.programId,
        status: "no_notes",
        generatedBy: context.auth.uid,
        generatedByName: displayName || null,
      };
      await writeReadinessDoc(studentId, payload, displayName);
      return {
        ...payload,
        checkedAt: payload.checkedAt.toISOString(),
        dateRangeStart: payload.dateRangeStart?.toISOString?.() || null,
        dateRangeEnd: payload.dateRangeEnd?.toISOString?.() || null,
      };
    }

    const formatted = notes.map(formatObservationForPrompt);
    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    const systemContent = prompt.systemPrompt + READINESS_JSON_WRAPPER;
    const userContent = [
      `Evaluate the observation data quality for the period ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}.`,
      "",
      `Student: ${JSON.stringify({ studentName: studentInfo.studentName, age: studentInfo.age })}`,
      "",
      `Notes (${formatted.length} observations, JSON array):`,
      JSON.stringify(formatted),
    ].join("\n");

    const body = buildChatBody({
      model: prompt.model,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      temperature: prompt.temperature,
      max_completion_tokens: prompt.max_tokens,
      response_format: { type: "json_object" },
    });

    let response;
    try {
      response = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.error("[readiness] network error", e);
      throw new functions.https.HttpsError("unavailable", "AI service unavailable");
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[readiness] OpenAI error", response.status, errText?.slice?.(0, 400));
      throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
    }

    const json = await response.json();
    const rawContent = json?.choices?.[0]?.message?.content?.trim();
    if (!rawContent) {
      throw new functions.https.HttpsError("internal", "AI returned no content");
    }

    const scores = parseReadinessResponse(rawContent);

    const payload = {
      sentimentScore: scores.sentimentScore,
      areaBalanceScore: scores.areaBalanceScore,
      missingInputFlags: scores.missingInputFlags,
      noteCount: formatted.length,
      noteCountAtCheck: formatted.length,
      checkedAt: new Date(),
      dateRangeStart: startDate,
      dateRangeEnd: endDate,
      programId: studentInfo.programId,
      model: prompt.model,
      status: "ok",
      generatedBy: context.auth.uid,
      generatedByName: displayName || null,
    };

    await writeReadinessDoc(studentId, payload, displayName);

    return {
      ...payload,
      checkedAt: payload.checkedAt.toISOString(),
      dateRangeStart: payload.dateRangeStart?.toISOString?.() || null,
      dateRangeEnd: payload.dateRangeEnd?.toISOString?.() || null,
    };
  });

// ── Delete a student report (admins only — superadmin or scoped classroomadmin) ─
export const deleteStudentReport = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 120, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const studentId = String(data?.studentId || "").trim();
    const reportDocId = String(data?.reportDocId || "").trim();
    if (!studentId || !reportDocId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId and reportDocId are required");
    }

    // Admin-only access: superadmins can delete any report,
    // classroomadmins can delete reports for students in their programs
    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!requesterSnap.exists) {
      throw new functions.https.HttpsError("permission-denied", "User not found");
    }
    const requesterData = requesterSnap.data();
    const requesterRole = requesterData?.role;

    if (requesterRole === "superadmin") {
      // Allowed — superadmins can delete any report
    } else if (requesterRole === "classroomadmin" || requesterRole === "admin") {
      const studentSnap = await db.collection("students").doc(studentId).get();
      if (!studentSnap.exists) {
        throw new functions.https.HttpsError("not-found", `Student not found: ${studentId}`);
      }
      const classroomId = studentSnap.data()?.classroomId;
      const manageable = requesterData.manageableClassrooms || [];
      if (!classroomId || !manageable.includes(classroomId)) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Classroom admin does not manage this student's classroom",
        );
      }
    } else {
      throw new functions.https.HttpsError("permission-denied", "Only admins can delete reports");
    }

    // Load report doc
    const reportRef = db.collection("students").doc(studentId)
      .collection("ai_summaries").doc(reportDocId);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Report not found");
    }
    const reportData = reportSnap.data();

    // If report was exported to Drive, trash the doc and update CSV
    if (reportData.driveDocId) {
      try {
        const { drive } = await getDriveClients();

        // Trash the Google Doc (recoverable for 30 days)
        await trashDriveFile(drive, reportData.driveDocId);

        // Remove student row from summary CSV only (archive is immutable)
        const studentSnap = await db.collection("students").doc(studentId).get();
        const classroomId = studentSnap.data()?.classroomId;
        if (classroomId) {
          const classroomSnap = await db.collection("classrooms").doc(classroomId).get();
          const classroomData2 = classroomSnap.data();
          const driveFolderId = classroomData2?.driveFolderId;
          if (driveFolderId) {
            const studentName = resolveStudentName(studentSnap.data());
            const clsName = classroomData2?.name || "Unknown Classroom";
            const summaryCsvName = buildCsvFilename(clsName);

            const existingCsv = await downloadCsvContent(drive, driveFolderId, summaryCsvName);
            if (existingCsv) {
              const updatedCsv = removeCsvRow(existingCsv, studentName, DRIVE_CONSTANTS.csvHeaders);
              await updateDriveSummaryCsv(drive, driveFolderId, updatedCsv, summaryCsvName);
            }
          }
        }
      } catch (driveErr) {
        console.error("[delete-report] Drive cleanup failed:", driveErr);
        // Continue with Firestore deletion even if Drive cleanup fails
      }
    }

    // Delete Firestore doc
    await reportRef.delete();

    return { status: "ok", deletedDocId: reportDocId };
  });
