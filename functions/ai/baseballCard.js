import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { db } from "../shared/firebase.js";
import { runLLM, OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY } from "../shared/llm.js";

// Fallback defaults - used when Firestore config doc lacks fields
const BASEBALL_CARD_DEFAULTS = {
  model: "gpt-5.4-mini",
  temperature: 0,
  windowDays: 42,
  timezone: "Asia/Kolkata",
  max_tokens: 1000,
};
import { getIstIsoWeekKey } from "../utils/weekKey.js";
import { Timestamp } from "firebase-admin/firestore";
import {
  formatObservationForPrompt,
  fetchStudentNotesForWindow,
  getStudentWithProgram,
} from "../shared/studentHelpers.js";
import { fetchActiveStudentIds, runWithConcurrency } from "../shared/scheduling.js";
import { patchHeatmapStudent } from "../heatmap/index.js";
import {
  computeExecutionId,
  markExecutionFailed,
  classifyError,
} from "../shared/ledger.js";
import { dispatchFanout, makeFanoutWorker } from "../shared/fanout.js";
import { PubSub } from "@google-cloud/pubsub";
import { broadcastAlert } from "../shared/telegram.js";
import { formatCrashSignal } from "../shared/verifierTelegram.js";

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");

const BASEBALL_CARD_TOPIC = "baseball-card-workers";
const pubsub = new PubSub();
const baseballCardTopic = pubsub.topic(BASEBALL_CARD_TOPIC);

// -----------------------------------------------
// AI: Baseball Card (Last 6 Weeks summary)
// -----------------------------------------------

// Per-program baseball card config: prompt + model params from config/baseball_card_{programId} (PEP-132)
const BASEBALL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const baseballCardCache = new Map(); // keyed by programId

const VALID_PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];

function getBaseballCardConfigDocId(programId) {
  if (!programId || !VALID_PROGRAMS.includes(programId)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Cannot resolve baseball card config: invalid programId "${programId}". ` +
      `Must be one of: ${VALID_PROGRAMS.join(", ")}`
    );
  }
  return `baseball_card_${programId}`;
}

async function getBaseballCardConfig(programId, { forceRefresh = false } = {}) {
  const docId = getBaseballCardConfigDocId(programId);

  if (!forceRefresh) {
    const cached = baseballCardCache.get(programId);
    if (cached?.data && (Date.now() - cached.ts < BASEBALL_CACHE_TTL_MS)) {
      return cached.data;
    }
  }

  const snap = await db.collection("config").doc(docId).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      `Baseball card config not found: config/${docId}. Run seed-baseball-card-configs.mjs --apply to create it.`
    );
  }

  const data = snap.data() || {};
  const out = {
    title: String(data.title || ""),
    description: String(data.description || ""),
    systemPrompt: String(data.systemPrompt || ""),
    version: Number.isFinite(data.version) ? data.version : 1,
    model: data.model || BASEBALL_CARD_DEFAULTS.model,
    temperature: Number.isFinite(data.temperature) ? data.temperature : BASEBALL_CARD_DEFAULTS.temperature,
    windowDays: Number.isFinite(data.windowDays) ? data.windowDays : BASEBALL_CARD_DEFAULTS.windowDays,
    timezone: data.timezone || BASEBALL_CARD_DEFAULTS.timezone,
    max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens,
  };
  baseballCardCache.set(programId, { data: out, ts: Date.now() });
  return out;
}

async function callBaseballCard(notes, config, prompt, windowDays, studentContext) {
  const safeContext = {
    studentName: studentContext?.studentName || "Unknown student",
    dob: studentContext?.dob || "dob unavailable in context",
    age: studentContext?.age || "age unavailable",
  };
  const renderedSystem = prompt.systemPrompt
    .replace("<WINDOW_DAYS>", String(windowDays))
    .replaceAll("<STUDENT_NAME>", safeContext.studentName)
    .replaceAll("<STUDENT_AGE>", safeContext.age);
  const userPrompt = `Generate the last ${windowDays}-day summary.\n\nStudent:\n${JSON.stringify(safeContext)}\n\nNotes (JSON array):\n${JSON.stringify(notes)}`;

  const { content: rawContent } = await runLLM({
    featureId: "baseball_card",
    messages: [
      { role: "system", content: renderedSystem },
      { role: "user", content: userPrompt },
    ],
    model: config.model || BASEBALL_CARD_DEFAULTS.model,
    temperature: Number.isFinite(config.temperature) ? config.temperature : BASEBALL_CARD_DEFAULTS.temperature,
    maxTokens: Number.isFinite(config.max_tokens) ? config.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens,
    responseFormat: { type: "json_object" },
    traceName: "baseball-card",
    traceMetadata: { studentId: studentContext?.studentId, windowDays, noteCount: notes.length },
  });

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err) {
    console.error("[baseballCard] JSON parse error", err, rawContent);
    throw new functions.https.HttpsError("internal", "AI returned invalid JSON");
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const redFlagRaw = parsed.redFlag || {};
  const redFlag = {
    severity: ["low", "medium", "high"].includes(redFlagRaw?.severity) ? redFlagRaw.severity : null,
    reason: typeof redFlagRaw?.reason === "string" ? redFlagRaw.reason : null,
  };
  const coverageGaps = Array.isArray(parsed.coverageGaps) ? parsed.coverageGaps.filter((c) => typeof c === "string") : [];

  return { summary, redFlag, coverageGaps, rawContent };
}

/**
 * Write the unified weekly_snapshot doc, optionally archiving the previous
 * snapshot to a history subcollection first.
 *
 * @param {string} studentId
 * @param {Object} cardPayload - Baseball card fields (summary, bullets, etc.)
 * @param {Object} signalsPayload - Signals fields (severity, redFlag, etc.)
 * @param {boolean} archiveHistory - If true, snapshot previous doc to history before overwrite
 * @param {Object|null} requesterInfo - { uid, displayName, role } for manual regens, null for batch
 * @param {Object|null} existingSnapshot - Pre-fetched existing doc data (from buildSignalsPayload) to avoid double-read
 */
async function writeWeeklySnapshot(studentId, cardPayload, signalsPayload, archiveHistory = false, requesterInfo = null, existingSnapshot = null, classroomId = null) {
  const snapshotRef = db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("weekly_snapshot");

  const merged = {
    // Baseball card fields
    summary: cardPayload.summary ?? "",
    bullets: cardPayload.bullets ?? [],
    rawContent: cardPayload.rawContent ?? null,
    sourceNoteIds: cardPayload.sourceNoteIds ?? [],
    status: cardPayload.status ?? "ok",
    windowDays: cardPayload.windowDays ?? null,
    timezone: cardPayload.timezone ?? null,
    model: cardPayload.model ?? null,
    temperature: cardPayload.temperature ?? null,
    generatedAt: cardPayload.generatedAt ?? null,
    noteCount: cardPayload.noteCount ?? 0,
    // Signals fields
    ...signalsPayload,
    classroomId,
  };

  if (archiveHistory) {
    const now = Timestamp.now();
    const prev = existingSnapshot ?? (await snapshotRef.get().then((s) => s.exists ? s.data() : null));

    const batch = db.batch();

    if (prev) {
      const weekKey = prev.weekKey || `migrated-${Date.now()}`;
      const historyRef = snapshotRef.collection("history").doc(weekKey);
      batch.set(historyRef, {
        ...prev,
        archivedAt: now,
      });
    }

    // Batch run: clean slate for the new week
    merged.edits = [];
    merged.regeneratedBy = null;
    batch.set(snapshotRef, merged);
    await batch.commit();
  } else {
    // Manual regen: snapshot previous state into edits array.
    // TODO: concurrent regens for the same student can race — the second writer
    // overwrites the first's edit entry. A Firestore transaction would fix this,
    // but the window is small (requires two humans regenerating the same student
    // within a 5-30s OpenAI call). Acceptable for now.
    const prev = existingSnapshot ?? (await snapshotRef.get().then((s) => s.exists ? s.data() : null));
    if (prev) {
      const editEntry = {
        severity: prev.severity ?? null,
        severityScore: prev.severityScore ?? null,
        summary: prev.summary ?? "",
        redFlag: prev.redFlag ?? { severity: null, reason: null },
        coverageGaps: prev.coverageGaps ?? [],
        regeneratedBy: prev.regeneratedBy ?? null,
        generatedAt: prev.generatedAt ?? null,
        replacedAt: Timestamp.now(),
      };
      const existingEdits = Array.isArray(prev.edits) ? prev.edits : [];
      merged.edits = [...existingEdits.slice(-49), editEntry];
    } else {
      merged.edits = [];
    }
    merged.regeneratedBy = requesterInfo;
    await snapshotRef.set(merged);
  }
}

const SEVERITY_SCORE = {
  clear: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function normalizeSeverity(severity) {
  const val = typeof severity === "string" ? severity.toLowerCase() : "";
  return ["low", "medium", "high"].includes(val) ? val : "clear";
}

function severityToScore(severity) {
  return SEVERITY_SCORE[normalizeSeverity(severity)] ?? 0;
}

async function buildSignalsPayload(studentId, baseSignals) {
  const ref = db.collection("students").doc(studentId).collection("ai_summaries").doc("weekly_snapshot");
  const snap = await ref.get();
  const existing = snap.exists ? (snap.data() || {}) : {};

  const currentWeekKey = getIstIsoWeekKey(new Date());
  const prevSeverity = normalizeSeverity(existing.severity);
  const prevSeverityScore = severityToScore(prevSeverity);

  let weekBaselineSeverity = normalizeSeverity(
    existing.weekKey === currentWeekKey
      ? (existing.weekBaselineSeverity || existing.severity || "clear")
      : (existing.severity || "clear"),
  );
  let weekBaselineSeverityScore = severityToScore(weekBaselineSeverity);

  let escalatedThisWeek = existing.weekKey === currentWeekKey && existing.escalatedThisWeek === true;
  let improvedThisWeek = existing.weekKey === currentWeekKey && existing.improvedThisWeek === true;

  if (existing.weekKey !== currentWeekKey) {
    weekBaselineSeverity = normalizeSeverity(existing.severity || "clear");
    weekBaselineSeverityScore = severityToScore(weekBaselineSeverity);
    escalatedThisWeek = false;
    improvedThisWeek = false;
  }

  const severity = normalizeSeverity(baseSignals?.redFlag?.severity);
  const severityScore = severityToScore(severity);

  escalatedThisWeek = escalatedThisWeek || (severityScore > prevSeverityScore);
  improvedThisWeek = improvedThisWeek || (severityScore < prevSeverityScore);

  return {
    signals: {
      ...baseSignals,
      severity,
      severityScore,
      prevSeverity,
      prevSeverityScore,
      weekKey: currentWeekKey,
      weekBaselineSeverity,
      weekBaselineSeverityScore,
      escalatedThisWeek,
      improvedThisWeek,
      lastUpdatedAt: Timestamp.now(),
    },
    existingSnapshot: snap.exists ? existing : null,
  };
}

/**
 * Generate and (unless dryRun) persist ONE student's baseball card.
 * Extracted from the batch loop (#279) so the Pub/Sub worker, the callables,
 * and the batch helper all share identical per-student behavior.
 *
 * @return {Promise<{status: string, payload: object}>} status "ok" | "no_notes".
 * @throws on generation/write failure - callers decide retry semantics.
 */
async function runBaseballCardForStudent(studentId, {
  windowDays,
  dryRun = false,
  archiveHistory = false,
  requesterInfo = null,
  forceRefresh = false,
} = {}) {
  const studentContext = await getStudentWithProgram(studentId);
  const { programId, classroomId } = studentContext;

  if (!programId) {
    throw new Error(`Cannot resolve programId for student ${studentId} (classroomId: ${classroomId})`);
  }

  const config = await getBaseballCardConfig(programId, { forceRefresh });
  const prompt = { systemPrompt: config.systemPrompt };
  const effectiveWindowDays = Number.isFinite(windowDays) && windowDays > 0 ? windowDays : config.windowDays;

  const notes = await fetchStudentNotesForWindow(studentId, effectiveWindowDays);

  if (!notes.length) {
    const payload = {
      summary: "",
      redFlag: { severity: null, reason: null },
      coverageGaps: [],
      noteCount: 0,
      windowDays: effectiveWindowDays,
      timezone: config.timezone,
      model: config.model,
      temperature: config.temperature,
      generatedAt: new Date(),
      status: "no_notes",
    };
    if (!dryRun) {
      const { signals, existingSnapshot } = await buildSignalsPayload(studentId, {
        redFlag: payload.redFlag,
        coverageGaps: payload.coverageGaps,
        noteCount: payload.noteCount,
        windowDays: payload.windowDays,
        timezone: payload.timezone,
        model: payload.model,
        temperature: payload.temperature,
        generatedAt: payload.generatedAt,
        status: payload.status,
        evidenceCount: payload.noteCount,
      });
      await writeWeeklySnapshot(studentId, payload, signals, archiveHistory, requesterInfo, existingSnapshot, classroomId);
    }
    return { status: "no_notes", payload };
  }

  const formatted = notes.map(formatObservationForPrompt);
  const aiResult = await callBaseballCard(formatted, config, prompt, effectiveWindowDays, studentContext);
  const sourceNoteIds = notes.map((n) => n.id).filter(Boolean);

  const payload = {
    summary: aiResult.summary,
    redFlag: aiResult.redFlag,
    coverageGaps: aiResult.coverageGaps,
    noteCount: formatted.length,
    windowDays: effectiveWindowDays,
    timezone: config.timezone,
    model: config.model,
    temperature: config.temperature,
    generatedAt: new Date(),
    status: "ok",
    sourceNoteIds,
    rawContent: aiResult.rawContent,
  };

  if (!dryRun) {
    const { signals, existingSnapshot } = await buildSignalsPayload(studentId, {
      redFlag: aiResult.redFlag,
      coverageGaps: aiResult.coverageGaps,
      noteCount: payload.noteCount,
      windowDays: payload.windowDays,
      timezone: payload.timezone,
      model: payload.model,
      temperature: payload.temperature,
      generatedAt: payload.generatedAt,
      status: payload.status,
      evidenceCount: payload.noteCount,
    });
    await writeWeeklySnapshot(studentId, payload, signals, archiveHistory, requesterInfo, existingSnapshot, classroomId);
  }
  return { status: "ok", payload };
}

async function runBaseballCards({
  studentIds,
  windowDays,
  dryRun = false,
  collectResults = false,
  concurrency = 12,
  archiveHistory = false,
  requesterInfo = null,
  forceRefresh = false,
}) {
  const ids = Array.isArray(studentIds) && studentIds.length ? studentIds : await fetchActiveStudentIds();
  if (!dryRun) {
    console.log(`[baseballCard] running for ${ids.length} student(s)`);
  }
  const results = [];
  let errorCount = 0;

  await runWithConcurrency(ids, async (studentId) => {
    try {
      const { status, payload } = await runBaseballCardForStudent(studentId, {
        windowDays, dryRun, archiveHistory, requesterInfo, forceRefresh,
      });
      if (dryRun && collectResults) {
        results.push({ studentId, status, payload });
      }
    } catch (err) {
      errorCount++;
      console.error(`[baseballCard] run failed for student ${studentId}`, err);
      if (dryRun && collectResults) {
        results.push({ studentId, status: "error", error: err?.message || "Unknown error" });
      }
    }
  }, concurrency);

  if (errorCount > 0) {
    console.warn(`[baseballCard] ${errorCount}/${ids.length} students failed (see errors above)`);
  }

  return results;
}

export const previewBaseballCard = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    const requesterRole = requesterSnap.data()?.role;
    if (!requesterSnap.exists || requesterRole !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only super admins can preview baseball cards");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    // Resolve programId from student doc
    const studentContext = await getStudentWithProgram(studentId);
    if (!studentContext.programId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Cannot resolve programId for student ${studentId}. Ensure the student's classroom has a programId set.`
      );
    }

    const baseConfig = await getBaseballCardConfig(studentContext.programId, { forceRefresh: !!data?.forceRefresh });

    const windowDaysInput = Number(data?.windowDays);
    const windowDays = Number.isFinite(windowDaysInput) && windowDaysInput > 0
      ? windowDaysInput
      : baseConfig.windowDays;

    const usedConfig = {
      model: baseConfig.model,
      temperature: baseConfig.temperature,
      max_tokens: baseConfig.max_tokens,
      timezone: baseConfig.timezone,
      windowDays,
    };

    const promptPayload = { title: baseConfig.title, description: baseConfig.description, systemPrompt: baseConfig.systemPrompt, version: baseConfig.version };

    const results = await runBaseballCards({
      studentIds: [studentId],
      windowDays,
      dryRun: true,
      collectResults: true,
      concurrency: 1,
      forceRefresh: !!data?.forceRefresh,
    });

    const result = results?.[0];
    if (!result) {
      throw new functions.https.HttpsError("internal", "No result returned");
    }

    if (result.status === "error") {
      throw new functions.https.HttpsError("internal", result.error || "Failed to generate baseball card preview");
    }

    return {
      status: result.status,
      noteCount: result.payload?.noteCount ?? 0,
      windowDays: result.payload?.windowDays ?? windowDays,
      usedConfig,
      usedPrompt: promptPayload,
      summary: result.payload?.summary,
      redFlag: result.payload?.redFlag,
      coverageGaps: result.payload?.coverageGaps,
      rawContent: result.payload?.rawContent,
      generatedAt: result.payload?.generatedAt?.toISOString?.() || new Date().toISOString(),
    };
  });

export const regenerateBaseballCardForStudent = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    const requesterData = requesterSnap.data() || {};
    const requesterRole = requesterData.role;
    if (!requesterSnap.exists || !["superadmin", "classroomadmin", "teacher"].includes(requesterRole)) {
      throw new functions.https.HttpsError("permission-denied", "You do not have permission to regenerate baseball cards");
    }

    const requesterInfo = {
      uid: context.auth.uid,
      displayName: requesterData.displayName || requesterData.name || null,
      role: requesterRole,
    };

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    const windowDaysInput = Number(data?.windowDays);
    const windowDays = Number.isFinite(windowDaysInput) && windowDaysInput > 0
      ? windowDaysInput
      : BASEBALL_CARD_DEFAULTS.windowDays;

    const regenResults = await runBaseballCards({
      studentIds: [studentId],
      windowDays,
      dryRun: false,
      collectResults: true,
      concurrency: 1,
      requesterInfo,
      forceRefresh: !!data?.forceRefresh,
    });

    const regenResult = regenResults?.[0];
    if (regenResult?.status === "error") {
      throw new functions.https.HttpsError(
        "internal",
        regenResult.error || `Baseball card generation failed for student ${studentId}`
      );
    }

    // Patch heatmap cache with updated student data (PEP-303)
    try {
      await patchHeatmapStudent(studentId);
    } catch (err) {
      console.error("[baseballCard] heatmap patch failed:", err);
    }

    // Regeneration writes directly to Firestore; return a simple ack.
    return {
      status: "ok",
      studentId,
      windowDays,
      regeneratedAt: new Date().toISOString(),
    };
  });

/**
 * Dispatcher: seeds the ledger and publishes one message per active student
 * (#279 - converted from a direct loop that ran ~1h for 488 students inside
 * one 540s-capped invocation). Heatmap cache rebuild moved to the standalone
 * rebuildHeatmapCache cron (Sun 02:30 IST) since no single invocation
 * observes batch completion anymore.
 */
export const generateBaseballCards = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 120, memory: "512MB", secrets: [TELEGRAM_BOT_TOKEN] })
  .pubsub.schedule("0 0 * * 0")
  .timeZone(BASEBALL_CARD_DEFAULTS.timezone)
  .onRun(async () => {
    const JOB_KEY = "baseballCards";
    const executionId = computeExecutionId(JOB_KEY);

    try {
      const ids = await fetchActiveStudentIds();
      console.log(`[baseballCard] dispatching for ${ids.length} active student(s)`);

      const result = await dispatchFanout({
        jobKey: JOB_KEY,
        topic: baseballCardTopic,
        executionId,
        targetIds: ids,
        buildPayload: (studentId) => ({ studentId, executionId }),
      });

      console.log(`[baseballCard] dispatch done: ${result.published} published, ${result.publishFailed} failed to publish`);
      return null;
    } catch (err) {
      console.error("[baseballCard] Fatal error:", err);
      await markExecutionFailed(JOB_KEY, executionId, err).catch(() => {});
      const msg = formatCrashSignal(JOB_KEY, executionId, classifyError(err), err.message);
      await broadcastAlert(TELEGRAM_BOT_TOKEN.value(), db, msg).catch(() => {});
      throw err;
    }
  });

/**
 * Worker: generates ONE student's baseball card per invocation (#279).
 * 512MB (text-only LLM); maxInstances caps concurrent OpenRouter calls
 * (see soulWorker's #270 credit-hold rationale). Intentional same-week
 * regeneration stays on the regenerateBaseballCardForStudent callable,
 * which bypasses the ledger and this guard.
 */
export const baseballCardWorker = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 300,
    memory: "512MB",
    maxInstances: 10,
    secrets: [OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY],
  })
  .pubsub.topic(BASEBALL_CARD_TOPIC)
  .onPublish(makeFanoutWorker({
    jobKey: "baseballCards",
    // Idempotency guard: weekly_snapshot stamps weekKey with the ISO week
    // (same value as executionId). Prevents duplicate LLM spend on Pub/Sub
    // at-least-once redelivery - the direct loop had no such guard.
    isAlreadyDone: async ({ studentId, executionId }) => {
      const snap = await db.collection("students").doc(studentId)
        .collection("ai_summaries").doc("weekly_snapshot").get();
      return snap.exists && snap.data().weekKey === executionId;
    },
    process: async ({ studentId }) => {
      const { status, payload } = await runBaseballCardForStudent(studentId, {
        archiveHistory: true,
      });
      return {
        state: "success",
        evidence: status === "ok"
          ? { status, noteCount: payload.noteCount }
          : { status },
      };
    },
  }));

// ---------------------------------------------------------------------------
// Manual trigger: superadmin-only callable dispatcher (#279)
// Publishes to the worker topic with a caller-specified executionId (ISO week
// key, e.g. "2026-W36"). The worker's idempotency guard checks
// weekly_snapshot.weekKey against this executionId, so students who already
// have a card for that week are skipped - only failures/missing get processed.
// Does NOT seed a new ledger execution: workItems from the original scheduled
// run still exist, and the worker's workItem updates overwrite them.
// ---------------------------------------------------------------------------

export const triggerBaseballCards = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 120, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!requesterSnap.exists || requesterSnap.data()?.role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only superadmins can trigger baseball card generation");
    }

    // targetWeek defaults to current ISO week; pass a past week (e.g. "2026-W36")
    // to retry only the students that failed that week's run.
    const targetWeek = data?.targetWeek || computeExecutionId("baseballCards");
    if (!/^\d{4}-W\d{2}$/.test(targetWeek)) {
      throw new functions.https.HttpsError("invalid-argument", "targetWeek must be YYYY-WNN format (e.g. 2026-W36)");
    }

    let studentIds;
    if (data?.studentIds && Array.isArray(data.studentIds) && data.studentIds.length > 0) {
      studentIds = data.studentIds.map((id) => String(id).trim()).filter(Boolean);
      console.log(`[baseballCard-trigger] manual dispatch for ${studentIds.length} specific students, targetWeek=${targetWeek}`);
    } else {
      studentIds = await fetchActiveStudentIds();
      console.log(`[baseballCard-trigger] manual dispatch for all ${studentIds.length} active students, targetWeek=${targetWeek}`);
    }

    let published = 0;
    let publishFailed = 0;
    await Promise.all(
      studentIds.map(async (studentId) => {
        try {
          const payload = JSON.stringify({ studentId, executionId: targetWeek });
          await baseballCardTopic.publishMessage({ data: Buffer.from(payload) });
          published++;
        } catch (err) {
          publishFailed++;
          console.error(`[baseballCard-trigger] publish failed for ${studentId}:`, err.message);
        }
      }),
    );

    return {
      status: publishFailed > 0 ? "partial" : "ok",
      targetWeek,
      studentsDispatched: studentIds.length,
      published,
      publishFailed,
    };
  });
