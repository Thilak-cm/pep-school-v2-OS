import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey, buildChatBody, CHAT_ENDPOINT } from "../shared/openai.js";
import { BASEBALL_CARD_DEFAULTS } from "../config/baseballCardConstants.js";
import { BASEBALL_SYSTEM_PROMPT_FALLBACK } from "../config/baseballCardPrompt.js";
import { getIstIsoWeekKey } from "../utils/weekKey.js";
import { Timestamp } from "firebase-admin/firestore";
import {
  formatObservationForPrompt,
  fetchStudentNotesForWindow,
  getStudentContext,
} from "../shared/studentHelpers.js";
import { fetchActiveStudentIds, runWithConcurrency } from "../shared/scheduling.js";

// -----------------------------------------------
// AI: Baseball Card (Last 6 Weeks summary)
// -----------------------------------------------

// Unified baseball card config: prompt + model params from config/baseball_card (PEP-139)
const BASEBALL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let baseballCardCache = { data: null, ts: 0 };

function isFreshCache(cacheEntry) {
  return cacheEntry?.data && (Date.now() - cacheEntry.ts < BASEBALL_CACHE_TTL_MS);
}

async function getBaseballCardConfig({ forceRefresh = false } = {}) {
  if (!forceRefresh && isFreshCache(baseballCardCache)) return baseballCardCache.data;

  try {
    const snap = await db.collection("config").doc("baseball_card").get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const out = {
      // Prompt fields
      title: String(data.title || ""),
      description: String(data.description || ""),
      systemPrompt: String(data.systemPrompt || BASEBALL_SYSTEM_PROMPT_FALLBACK),
      version: Number.isFinite(data.version) ? data.version : 1,
      // Model config with fallback to defaults
      model: data.model || BASEBALL_CARD_DEFAULTS.model,
      temperature: Number.isFinite(data.temperature) ? data.temperature : BASEBALL_CARD_DEFAULTS.temperature,
      windowDays: Number.isFinite(data.windowDays) ? data.windowDays : BASEBALL_CARD_DEFAULTS.windowDays,
      timezone: data.timezone || BASEBALL_CARD_DEFAULTS.timezone,
      max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens,
    };
    baseballCardCache = { data: out, ts: Date.now() };
    return out;
  } catch (err) {
    console.warn("[baseballCard] config fetch failed, using defaults:", err);
    const out = {
      title: "Baseball Card Summary",
      description: "Coach Pepper's last 6 weeks summary",
      systemPrompt: BASEBALL_SYSTEM_PROMPT_FALLBACK,
      version: 1,
      ...BASEBALL_CARD_DEFAULTS,
    };
    baseballCardCache = { data: out, ts: Date.now() };
    return out;
  }
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
  const renderedSystem = (prompt.systemPrompt || BASEBALL_SYSTEM_PROMPT_FALLBACK)
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
 */
async function writeWeeklySnapshot(studentId, cardPayload, signalsPayload, archiveHistory = false) {
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
  };

  if (archiveHistory) {
    const now = Timestamp.now();
    const existing = await snapshotRef.get();

    const batch = db.batch();

    if (existing.exists) {
      const prevData = existing.data();
      const weekKey = prevData.weekKey || `migrated-${Date.now()}`;
      const historyRef = snapshotRef.collection("history").doc(weekKey);
      batch.set(historyRef, {
        ...prevData,
        archivedAt: now,
      });
    }

    batch.set(snapshotRef, merged);
    await batch.commit();
  } else {
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
  };
}

async function runBaseballCards({
  studentIds,
  config,
  prompt,
  windowDays,
  dryRun = false,
  collectResults = false,
  concurrency = 12,
  archiveHistory = false,
}) {
  const ids = Array.isArray(studentIds) && studentIds.length ? studentIds : await fetchActiveStudentIds();
  if (!dryRun) {
    console.log(`[baseballCard] running for ${ids.length} student(s)`);
  }
  const results = [];
  const effectiveWindowDays = Number.isFinite(windowDays) && windowDays > 0 ? windowDays : config.windowDays;

  await runWithConcurrency(ids, async (studentId) => {
    try {
      const notes = await fetchStudentNotesForWindow(studentId, effectiveWindowDays);
      const studentContext = await getStudentContext(studentId);

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
          const signalsPayload = await buildSignalsPayload(studentId, {
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
          await writeWeeklySnapshot(studentId, payload, signalsPayload, archiveHistory);
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
        const signalsPayload = await buildSignalsPayload(studentId, {
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
        await writeWeeklySnapshot(studentId, payload, signalsPayload, archiveHistory);
      }
    } catch (err) {
      console.error(`[baseballCard] run failed for student ${studentId}`, err);
      if (dryRun && collectResults) {
        results.push({ studentId, status: "error", error: err?.message || "Unknown error" });
      }
    }
  }, concurrency);

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

    const baseConfig = await getBaseballCardConfig({ forceRefresh: !!data?.forceRefresh });

    const windowDaysInput = Number(data?.windowDays);
    const windowDays = Number.isFinite(windowDaysInput) && windowDaysInput > 0
      ? windowDaysInput
      : baseConfig.windowDays;

    const mergedConfig = {
      model: data?.config?.model || baseConfig.model,
      temperature: Number.isFinite(Number(data?.config?.temperature))
        ? Number(data?.config?.temperature)
        : baseConfig.temperature,
      max_tokens: Number.isFinite(Number(data?.config?.max_tokens))
        ? Number(data?.config?.max_tokens)
        : baseConfig.max_tokens,
      timezone: data?.config?.timezone || baseConfig.timezone,
    };

    const systemPrompt = typeof data?.systemPrompt === "string" && data.systemPrompt.trim()
      ? data.systemPrompt
      : (baseConfig.systemPrompt || BASEBALL_SYSTEM_PROMPT_FALLBACK);
    const promptPayload = { title: baseConfig.title, description: baseConfig.description, systemPrompt, version: baseConfig.version };

    const results = await runBaseballCards({
      studentIds: [studentId],
      config: mergedConfig,
      prompt: promptPayload,
      windowDays,
      dryRun: true,
      collectResults: true,
      concurrency: 1,
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
      usedConfig: mergedConfig,
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
    const requesterRole = requesterSnap.data()?.role;
    if (!requesterSnap.exists || !["superadmin", "classroomadmin", "teacher"].includes(requesterRole)) {
      throw new functions.https.HttpsError("permission-denied", "You do not have permission to regenerate baseball cards");
    }

    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    const studentId = String(data?.studentId || "").trim();
    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    const baseConfig = await getBaseballCardConfig({ forceRefresh: !!data?.forceRefresh });

    const windowDaysInput = Number(data?.windowDays);
    const windowDays = Number.isFinite(windowDaysInput) && windowDaysInput > 0
      ? windowDaysInput
      : baseConfig.windowDays;

    const mergedConfig = {
      model: baseConfig.model,
      temperature: baseConfig.temperature,
      max_tokens: baseConfig.max_tokens,
      timezone: baseConfig.timezone,
    };

    await runBaseballCards({
      studentIds: [studentId],
      config: mergedConfig,
      prompt: { title: baseConfig.title, description: baseConfig.description, systemPrompt: baseConfig.systemPrompt, version: baseConfig.version },
      windowDays,
      dryRun: false,
      collectResults: false,
      concurrency: 1,
    });

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

    const config = await getBaseballCardConfig();

    console.log("[baseballCard] generating for active students");

    await runBaseballCards({
      config,
      prompt: { title: config.title, description: config.description, systemPrompt: config.systemPrompt, version: config.version },
      windowDays: config.windowDays,
      dryRun: false,
      collectResults: false,
      concurrency: 12,
      archiveHistory: true,
    });

    console.log("[baseballCard] generation run complete");
    return null;
  });
