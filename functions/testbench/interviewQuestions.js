/**
 * Test bench helper for interview question generation (PEP-172).
 *
 * Stateless per-turn: the client sends the full conversation history each call.
 * The function assembles the system prompt from a template + student data,
 * prepends it to the message history, and calls OpenAI.
 */
import { db } from "../shared/firebase.js";
import { buildChatBody } from "../shared/openai.js";
import { OPENROUTER_ENDPOINT } from "../shared/openrouter.js";
import { fetchStudentInterviews, getStudentWithProgram } from "../shared/studentHelpers.js";
import { formatInterviewForPrompt } from "../utils/interviewHelpers.js";
import { assembleSystemPrompt } from "./promptAssembly.js";

/**
 * Run a single interview turn for the test bench.
 *
 * @param {Object} params
 * @param {string} params.studentId - Student document ID
 * @param {string} params.systemPrompt - Prompt template with ${placeholders}
 * @param {Array} params.messages - Conversation history [{role, content}, ...]
 * @param {string} params.model - OpenRouter model slug
 * @param {number} params.temperature - Model temperature
 * @param {number} params.maxTokens - Max completion tokens
 * @param {string} params.apiKey - OpenRouter API key
 * @returns {{ output: string, totalTokens: number }}
 */
export async function testBenchInterviewTurn({ studentId, systemPrompt, messages, model, temperature, maxTokens, apiKey, elapsedMinutes, questionCount }) {
  // 1. Load student data in parallel
  const studentInfo = await getStudentWithProgram(studentId);

  const [soulSnap, guidelinesSnap, bcSnap, oqSnap, rawInterviews] = await Promise.all([
    db.collection("students").doc(studentId).collection("ai_summaries").doc("soul").get(),
    db.collection("students").doc(studentId).collection("ai_summaries").doc("guidelines").get(),
    db.collection("students").doc(studentId).collection("ai_summaries").doc("baseball_card").get(),
    db.collection("students").doc(studentId).collection("ai_summaries").doc("open_questions").get(),
    fetchStudentInterviews(studentId, 365),
  ]);

  const soul = soulSnap.exists ? soulSnap.data()?.content ?? null : null;
  const guidelines = guidelinesSnap.exists ? guidelinesSnap.data()?.content ?? null : null;
  const baseballCard = bcSnap.exists ? bcSnap.data() : null;
  const openQuestions = oqSnap.exists ? oqSnap.data()?.areas ?? null : null;
  const priorInterviews = rawInterviews.map(formatInterviewForPrompt);

  // 2. Assemble the full system prompt
  const sessionProgress = (elapsedMinutes != null && questionCount != null)
    ? { elapsedMinutes, questionCount }
    : undefined;

  const assembledPrompt = assembleSystemPrompt(systemPrompt, {
    studentName: studentInfo.studentName,
    age: studentInfo.age,
    programId: studentInfo.programId,
    soul,
    guidelines,
    baseballCard,
    openQuestions,
    priorInterviews,
    sessionProgress,
  });

  // 3. Build full message array with assembled system prompt
  const fullMessages = [
    { role: "system", content: assembledPrompt },
    ...messages,
  ];

  // 4. Call LLM via OpenRouter
  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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
    console.error("[testBenchInterview] LLM error", response.status, errText?.slice?.(0, 500));
    throw new Error(`LLM error: ${response.status}`);
  }

  const json = await response.json();
  const output = json?.choices?.[0]?.message?.content?.trim();
  const totalTokens = json?.usage?.total_tokens || 0;

  if (!output) {
    throw new Error("OpenAI returned empty response");
  }

  return { output, totalTokens };
}

// Re-export for consumers that import from this module
export { assembleSystemPrompt } from "./promptAssembly.js";
