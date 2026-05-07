// PEP-207: Generate soul + open_questions for a student locally.
// Replicates generateStudentProfile logic without needing Firebase Auth context.
//
// Usage: OPENAI_API_KEY=sk-... node scripts/admin/generate-soul.mjs <studentId>
// Example: OPENAI_API_KEY=sk-... node scripts/admin/generate-soul.mjs 2025-ADO-001

// Set project ID before any firebase-admin import so shared/firebase.js picks it up
process.env.GCLOUD_PROJECT = "pep-os";
process.env.GCP_PROJECT = "pep-os";

// Import db/Timestamp from shared module (same instance used by helpers)
import { db, Timestamp } from "../../functions/shared/firebase.js";

// --- Imports from functions (reuse helpers directly) ---
import {
  SOUL_DEFAULTS,
  VALID_PROGRAMS,
  buildSoulSystemPrompt,
  buildSoulUserPrompt,
  parseSoulResponse,
  buildSoulDoc,
  buildGuidelinesDoc,
  buildOpenQuestionsDoc,
  buildHistorySnapshot,
  hasEmergentObservations,
  extractGuidelinesSuggestions,
  extractOpenQuestions,
} from "../../functions/utils/soulHelpers.js";
import { buildChatBody, CHAT_ENDPOINT } from "../../functions/shared/openai.js";
import {
  getStudentWithProgram,
  fetchStudentNotesForWindow,
  fetchStudentInterviews,
  formatObservationForPrompt,
  chooseObservationTimestamp,
} from "../../functions/shared/studentHelpers.js";
import { formatInterviewForPrompt } from "../../functions/utils/interviewHelpers.js";

// --- Config ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("ERROR: OPENAI_API_KEY env var is required");
  console.error("Usage: OPENAI_API_KEY=sk-... node scripts/admin/generate-soul.mjs <studentId>");
  process.exit(1);
}

const studentId = process.argv[2]?.trim();
if (!studentId) {
  console.error("ERROR: studentId argument is required");
  console.error("Usage: OPENAI_API_KEY=sk-... node scripts/admin/generate-soul.mjs <studentId>");
  process.exit(1);
}

const SOUL_TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000;
let soulConfigCache = { data: null, ts: 0 };

async function getSoulConfig() {
  if (soulConfigCache.ts && (Date.now() - soulConfigCache.ts < SOUL_TEMPLATE_CACHE_TTL_MS)) {
    return soulConfigCache.data;
  }
  const snap = await db.collection("config").doc("soul_generation").get();
  if (!snap.exists) {
    console.log("[soul] No config/soul_generation doc — using hardcoded defaults");
    soulConfigCache = { data: null, ts: Date.now() };
    return null;
  }
  const data = snap.data();
  soulConfigCache = { data, ts: Date.now() };
  return data;
}

async function getSoulTemplateConfig(programId) {
  const docId = `soul_guidelines_${programId}`;
  const snap = await db.collection("config").doc(docId).get();
  if (!snap.exists) {
    throw new Error(`Soul template not found: ${docId}. Run seed-soul-templates.mjs`);
  }
  const data = snap.data();
  if (!data.markdown || typeof data.markdown !== "string") {
    throw new Error(`Soul template ${docId} has no markdown content`);
  }
  return { markdown: data.markdown, programId: data.programId || programId };
}

async function callSoulGeneration(observations, interviews, guidelinesContent, studentContext, previousSoul) {
  const soulConfig = await getSoulConfig();
  const systemPromptTemplate = soulConfig?.systemPrompt || null;
  const model = soulConfig?.model || SOUL_DEFAULTS.model;
  const temperature = soulConfig?.temperature ?? SOUL_DEFAULTS.temperature;
  const maxTokens = soulConfig?.max_tokens || SOUL_DEFAULTS.max_tokens;

  const systemContent = systemPromptTemplate
    ? (systemPromptTemplate.includes("${guidelinesContent}")
      ? systemPromptTemplate.replace("${guidelinesContent}", () => guidelinesContent)
      : systemPromptTemplate + "\n\n" + guidelinesContent)
    : buildSoulSystemPrompt(guidelinesContent);
  const userContent = buildSoulUserPrompt(studentContext, observations, interviews, previousSoul);

  console.log(`[soul] Calling ${model} (temperature=${temperature}, max_tokens=${maxTokens})`);

  const body = buildChatBody({
    model,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    temperature,
    max_completion_tokens: maxTokens,
  });

  const response = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenAI error ${response.status}: ${errText?.slice?.(0, 400)}`);
  }

  const json = await response.json();
  const rawContent = json?.choices?.[0]?.message?.content?.trim();
  const totalTokens = json?.usage?.total_tokens || 0;
  console.log(`[soul] Response received — ${totalTokens} tokens`);

  if (!rawContent) throw new Error("AI returned no content");
  return parseSoulResponse(rawContent);
}

async function writeSoulAndGuidelines(soulContent, programId, templateConfig, observationCount, interviewCount, lastObsAt, lastInterviewAt) {
  const aiSummariesRef = db.collection("students").doc(studentId).collection("ai_summaries");
  const soulRef = aiSummariesRef.doc("soul");
  const guidelinesRef = aiSummariesRef.doc("guidelines");
  const openQuestionsRef = aiSummariesRef.doc("open_questions");
  const now = Timestamp.now();
  const batch = db.batch();

  const [existingSoul, existingGuidelines] = await Promise.all([soulRef.get(), guidelinesRef.get()]);

  if (existingSoul.exists) {
    const prevData = existingSoul.data();
    const historyRef = soulRef.collection("history").doc(now.toMillis().toString());
    batch.set(historyRef, buildHistorySnapshot(prevData, `Manual regeneration on ${new Date().toISOString().split("T")[0]}`));
    console.log("[soul] Snapshotted previous soul to history");
  }

  const { suggestions: guidelinesSuggestions, content: withoutYaml } = extractGuidelinesSuggestions(soulContent);
  const { areas: openQuestionAreas, content: narrativeContent } = extractOpenQuestions(withoutYaml);

  const soulDoc = buildSoulDoc({
    content: narrativeContent,
    programId,
    observationCount,
    interviewCount,
    lastObservationAt: lastObsAt,
    lastInterviewAt: lastInterviewAt,
  });
  soulDoc.hasEmergentObservations = hasEmergentObservations(narrativeContent);
  soulDoc.guidelinesSuggestions = guidelinesSuggestions;
  soulDoc.createdAt = existingSoul.exists ? (existingSoul.data().createdAt || now) : now;
  soulDoc.updatedAt = now;
  batch.set(soulRef, soulDoc);

  const oqDoc = buildOpenQuestionsDoc({ areas: openQuestionAreas, programId });
  oqDoc.updatedAt = now;
  batch.set(openQuestionsRef, oqDoc);

  const areaCount = Object.keys(openQuestionAreas).length;
  const questionCount = Object.values(openQuestionAreas).reduce((sum, qs) => sum + qs.length, 0);

  if (!existingGuidelines.exists) {
    const guidelinesDoc = buildGuidelinesDoc({
      content: templateConfig.markdown,
      programId,
      templateDocId: `config/soul_guidelines_${programId}`,
    });
    guidelinesDoc.createdAt = now;
    guidelinesDoc.updatedAt = now;
    batch.set(guidelinesRef, guidelinesDoc);
    console.log(`[soul] Seeded guidelines from soul_guidelines_${programId}`);
  }

  await batch.commit();
  return { areaCount, questionCount, guidelinesSuggestions: guidelinesSuggestions.length };
}

// --- Main ---
async function main() {
  console.log(`\nGenerating soul for student: ${studentId}\n`);

  const studentInfo = await getStudentWithProgram(studentId);
  console.log(`Student: ${studentInfo.studentName}, program: ${studentInfo.programId}, age: ${studentInfo.age}`);

  if (!studentInfo.programId || !VALID_PROGRAMS.includes(studentInfo.programId)) {
    throw new Error(`Invalid program: ${studentInfo.programId}`);
  }

  const templateConfig = await getSoulTemplateConfig(studentInfo.programId);
  const windowDays = 365;

  const [notes, rawInterviews] = await Promise.all([
    fetchStudentNotesForWindow(studentId, windowDays),
    fetchStudentInterviews(studentId, windowDays),
  ]);
  console.log(`Found ${notes.length} observations, ${rawInterviews.length} interviews (${windowDays}-day window)`);

  const guidelinesSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("guidelines").get();
  const guidelinesContent = guidelinesSnap.exists
    ? guidelinesSnap.data().content
    : templateConfig.markdown;

  const prevSoulSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("soul").get();
  const previousSoul = prevSoulSnap.exists ? prevSoulSnap.data().content : null;

  if (!notes.length && !rawInterviews.length) {
    console.log("No observations or interviews — writing empty soul");
    await writeSoulAndGuidelines(
      "No observations or interviews available yet.",
      studentInfo.programId, templateConfig, 0, 0, null, null,
    );
    console.log("Done (empty soul).");
    return;
  }

  const formatted = notes.map(formatObservationForPrompt);
  const formattedInterviews = rawInterviews.map(formatInterviewForPrompt);

  const lastObsAt = notes.length ? chooseObservationTimestamp(notes[0]) : null;
  const lastInterviewAt = rawInterviews.length && rawInterviews[0].conductedAt
    ? (rawInterviews[0].conductedAt.toDate ? rawInterviews[0].conductedAt.toDate() : new Date(rawInterviews[0].conductedAt))
    : null;

  const soulContent = await callSoulGeneration(
    formatted, formattedInterviews, guidelinesContent,
    { studentName: studentInfo.studentName, dob: studentInfo.dob, age: studentInfo.age, programId: studentInfo.programId },
    previousSoul,
  );

  const result = await writeSoulAndGuidelines(
    soulContent, studentInfo.programId, templateConfig,
    formatted.length, formattedInterviews.length, lastObsAt, lastInterviewAt,
  );

  console.log(`\nDone! Soul generated for ${studentInfo.studentName}:`);
  console.log(`  - ${formatted.length} observations, ${formattedInterviews.length} interviews`);
  console.log(`  - ${result.questionCount} open questions across ${result.areaCount} areas`);
  console.log(`  - ${result.guidelinesSuggestions} guidelines suggestions`);
}

main().catch((err) => {
  console.error("\nFatal:", err.message || err);
  process.exit(1);
});
