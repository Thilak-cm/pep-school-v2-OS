/**
 * Test bench helper for interview question generation (PEP-172).
 *
 * Stateless per-turn: the client sends the full conversation history each call.
 * The function assembles the system prompt from a template + student data,
 * prepends it to the message history, and calls OpenAI.
 */
import { db } from "../shared/firebase.js";
import { CHAT_ENDPOINT, buildChatBody } from "../shared/openai.js";
import { fetchStudentInterviews, getStudentWithProgram } from "../shared/studentHelpers.js";
import { formatInterviewForPrompt } from "../utils/interviewHelpers.js";

/**
 * Replace ${placeholder} tokens in the system prompt template with student data.
 */
function assembleSystemPrompt(template, { studentName, age, programId, soul, guidelines, baseballCard, openQuestions, priorInterviews }) {
  let prompt = template;

  // Simple token replacements
  prompt = prompt.replace(/\$\{studentName\}/g, studentName || "Unknown");
  prompt = prompt.replace(/\$\{age\}/g, age || "age unavailable");
  prompt = prompt.replace(/\$\{programId\}/g, programId || "unknown");
  prompt = prompt.replace(/\$\{soul\}/g, soul || "No soul narrative available.");
  prompt = prompt.replace(/\$\{guidelines\}/g, guidelines || "No guidelines available.");

  // Baseball card — build formatted block or fallback
  const bcBlock = baseballCard
    ? `BASEBALL CARD (recent ${baseballCard.windowDays}-day summary, ${baseballCard.noteCount} observations):\n${baseballCard.summary}${baseballCard.coverageGaps?.length ? `\nCoverage gaps: ${baseballCard.coverageGaps.join(", ")}` : ""}`
    : "No baseball card available.";
  prompt = prompt.replace(/\$\{baseballCard\}/g, bcBlock);

  // Open questions — build numbered list or empty
  const oqBlock = openQuestions?.length
    ? `OPEN QUESTIONS BANK (${openQuestions.length} pre-generated questions based on gaps in the soul narrative — use these as a starting point, adapt or rephrase as needed, and generate your own when the conversation goes somewhere new):\n${openQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "";
  prompt = prompt.replace(/\$\{openQuestions\}/g, oqBlock);

  // Prior interviews — append if available
  if (priorInterviews?.length) {
    const interviewBlock = `\nPRIOR INTERVIEW TRANSCRIPTS (${priorInterviews.length} completed sessions — avoid re-asking areas already covered):\n${JSON.stringify(priorInterviews, null, 2)}`;
    prompt += interviewBlock;
  }

  return prompt;
}

/**
 * Calculate age string from a DOB value (Firestore Timestamp, Date, or string).
 */
function calculateAge(dobValue) {
  if (!dobValue) return "age unavailable";
  const d = typeof dobValue.toDate === "function" ? dobValue.toDate() : new Date(dobValue);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  if (now.getDate() < d.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  return `${years}y ${months}m`;
}

/**
 * Run a single interview turn for the test bench.
 *
 * @param {Object} params
 * @param {string} params.studentId - Student document ID
 * @param {string} params.systemPrompt - Prompt template with ${placeholders}
 * @param {Array} params.messages - Conversation history [{role, content}, ...]
 * @param {string} params.model - OpenAI model ID
 * @param {number} params.temperature - Model temperature
 * @param {number} params.maxTokens - Max completion tokens
 * @param {string} params.openAiKey - OpenAI API key
 * @returns {{ output: string, totalTokens: number }}
 */
export async function testBenchInterviewTurn({ studentId, systemPrompt, messages, model, temperature, maxTokens, openAiKey }) {
  // 1. Load student data in parallel
  const studentInfo = await getStudentWithProgram(studentId);

  const [soulSnap, guidelinesSnap, bcSnap, oqSnap, rawInterviews] = await Promise.all([
    db.collection("students").doc(studentId).collection("ai_summaries").doc("soul").get(),
    db.collection("students").doc(studentId).collection("ai_summaries").doc("guidelines").get(),
    db.collection("students").doc(studentId).collection("ai_summaries").doc("baseball_card").get(),
    db.collection("students").doc(studentId).collection("ai_summaries").doc("open_questions").get(),
    fetchStudentInterviews(studentId, 365),
  ]);

  const soul = soulSnap.exists ? soulSnap.data().content : null;
  const guidelines = guidelinesSnap.exists ? guidelinesSnap.data().content : null;
  const baseballCard = bcSnap.exists ? bcSnap.data() : null;
  const openQuestions = oqSnap.exists ? oqSnap.data().questions : null;
  const priorInterviews = rawInterviews.map(formatInterviewForPrompt);

  // 2. Assemble the full system prompt
  const assembledPrompt = assembleSystemPrompt(systemPrompt, {
    studentName: studentInfo.displayName,
    age: calculateAge(studentInfo.dob),
    programId: studentInfo.programId,
    soul,
    guidelines,
    baseballCard,
    openQuestions,
    priorInterviews,
  });

  // 3. Build full message array with assembled system prompt
  const fullMessages = [
    { role: "system", content: assembledPrompt },
    ...messages,
  ];

  // 4. Call OpenAI
  const startTime = Date.now();
  const response = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildChatBody({
      model,
      messages: fullMessages,
      temperature,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    })),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[testBenchInterview] OpenAI error", response.status, errText?.slice?.(0, 500));
    throw new Error(`OpenAI error: ${response.status}`);
  }

  const json = await response.json();
  const output = json?.choices?.[0]?.message?.content?.trim();
  const totalTokens = json?.usage?.total_tokens || 0;

  if (!output) {
    throw new Error("OpenAI returned empty response");
  }

  console.log(`[testBenchInterview] ${studentId} — ${totalTokens} tokens, ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return { output, totalTokens };
}

// Export for testing
export { assembleSystemPrompt };
