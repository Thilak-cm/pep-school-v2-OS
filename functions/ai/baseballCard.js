import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey, buildChatBody, CHAT_ENDPOINT } from "../shared/openai.js";
import { BASEBALL_CARD_DEFAULTS } from "../config/baseballCardConstants.js";
import { getIstIsoWeekKey } from "../utils/weekKey.js";
import { Timestamp } from "firebase-admin/firestore";
import {
  formatObservationForPrompt,
  fetchStudentNotesForWindow,
  getStudentWithProgram,
} from "../shared/studentHelpers.js";
import { fetchActiveStudentIds, runWithConcurrency } from "../shared/scheduling.js";
import { writeHeatmapCache, patchHeatmapStudent } from "../heatmap/index.js";

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
  const openAiKey = getOpenAiKey();
  if (!openAiKey) {
    throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
  }

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

  const body = buildChatBody({
    model: config.model || BASEBALL_CARD_DEFAULTS.model,
    messages: [
      { role: "system", content: renderedSystem },
      { role: "user", content: userPrompt }
    ],
    temperature: Number.isFinite(config.temperature) ? config.temperature : BASEBALL_CARD_DEFAULTS.temperature,
    max_completion_tokens: Number.isFinite(config.max_tokens) ? config.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens,
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
    console.error("[baseballCard] network error", e);
    throw new functions.https.HttpsError("unavailable", "AI service unavailable");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[baseballCard] OpenAI error", response.status, errText?.slice?.(0, 400));
    throw new functions.https.HttpsError("internal", `AI error: ${response.status}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new functions.https.HttpsError("internal", "AI returned no content");
  }

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
        if (dryRun && collectResults) {
          results.push({ studentId, status: "no_notes", payload });
        } else if (!dryRun) {
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
        return;
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

      if (dryRun && collectResults) {
        results.push({ studentId, status: "ok", payload });
      } else if (!dryRun) {
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
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    const requesterSnap = await db.collection("users").doc(context.auth.uid).get();
    const requesterRole = requesterSnap.data()?.role;
    if (!requesterSnap.exists || requesterRole !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Only super admins can preview baseball cards");
    }

    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
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
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [OPENAI_API_KEY] })
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

    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

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

export const generateBaseballCards = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "1GB", secrets: [OPENAI_API_KEY] })
  .pubsub.schedule("0 0 * * 0")
  .timeZone(BASEBALL_CARD_DEFAULTS.timezone)
  .onRun(async () => {
    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      console.error("[baseballCard] OpenAI key not configured");
      return null;
    }

    console.log("[baseballCard] generating for active students (per-program config)");

    await runBaseballCards({
      dryRun: false,
      collectResults: false,
      concurrency: 12,
      archiveHistory: true,
    });

    console.log("[baseballCard] generation run complete");

    // Build heatmap cache from fresh snapshots (PEP-303)
    try {
      await writeHeatmapCache();
    } catch (err) {
      console.error("[baseballCard] heatmap cache write failed:", err);
    }

    return null;
  });
