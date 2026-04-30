/**
 * Interactive interview agent prototype.
 *
 * Simulates the turn-by-turn interview flow:
 * 1. Cold start: loads soul + guidelines + baseball card, generates
 *    exploration areas + Q1
 * 2. User answers as teacher in the CLI
 * 3. Agent generates next question based on conversation history
 * 4. Repeat until user types "exit"
 *
 * Pure prompt-building and response-parsing helpers live in
 * interview-agent-core.mjs (imported by tests).
 *
 * Usage:
 *   node scripts/admin/test-question-gen.mjs <studentId>
 *
 * Requires: OPENAI_API_KEY environment variable
 */
import admin from "firebase-admin";
import readline from "node:readline";
import { FRONTIER_MODEL } from "../../functions/config/modelConstants.js";
import { assembleSystemPrompt } from "../../functions/testbench/interviewQuestions.js";

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateAge(dobValue) {
  if (!dobValue) return "age unavailable";
  const d = dobValue.toDate ? dobValue.toDate() : new Date(dobValue);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  if (now.getDate() < d.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  return parts.length > 0 ? `${parts.join(" ")} old` : "age unavailable";
}

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

async function callLLM(messages) {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    console.error("\nSet OPENAI_API_KEY environment variable");
    process.exit(1);
  }

  const model = FRONTIER_MODEL;
  const startTime = Date.now();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_completion_tokens: 1000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`\nOpenAI error ${response.status}:`, errText.slice(0, 500));
    process.exit(1);
  }

  const json = await response.json();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const rawContent = json?.choices?.[0]?.message?.content?.trim();

  if (!rawContent) {
    console.error("Empty response from OpenAI — unexpected response shape");
    process.exit(1);
  }

  return { rawContent, elapsed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const studentId = args.find((a) => !a.startsWith("--"));

if (!studentId) {
  console.error("Usage: node scripts/admin/test-question-gen.mjs <studentId>");
  process.exit(1);
}

async function run() {
  // 1. Load student
  const studentSnap = await db.collection("students").doc(studentId).get();
  if (!studentSnap.exists) {
    console.error(`Student not found: ${studentId}`);
    process.exit(1);
  }
  const studentData = studentSnap.data();
  const classroomSnap = await db.collection("classrooms").doc(studentData.classroomId).get();
  const programId = classroomSnap.exists ? classroomSnap.data()?.programId : null;
  const studentName = studentData.displayName || [studentData.firstName, studentData.lastName].filter(Boolean).join(" ");
  const studentContext = { studentName, age: calculateAge(studentData.dob), programId };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`INTERVIEW SESSION: ${studentName} (${studentId})`);
  console.log(`Program: ${programId} | Classroom: ${studentData.classroomId}`);
  console.log(`${"=".repeat(60)}`);

  // 2. Load soul
  const soulSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("soul").get();
  if (!soulSnap.exists) {
    console.error("No soul found. Run generateStudentProfile first.");
    process.exit(1);
  }
  const soul = soulSnap.data().content;
  console.log(`Soul: ${soul.length} chars`);

  // 3. Load guidelines
  const guidelinesSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("guidelines").get();
  if (!guidelinesSnap.exists) {
    console.error("No guidelines found.");
    process.exit(1);
  }
  const guidelines = guidelinesSnap.data().content;
  console.log(`Guidelines: loaded`);

  // 4. Load baseball card
  const bcSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("baseball_card").get();
  const baseballCard = bcSnap.exists ? bcSnap.data() : null;
  console.log(`Baseball card: ${baseballCard ? "loaded" : "none"}`);

  // 5. Load open questions
  const oqSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("open_questions").get();
  const openQuestions = oqSnap.exists ? oqSnap.data().questions : null;
  console.log(`Open questions: ${openQuestions ? `${openQuestions.length} loaded` : "none"}`);

  // 6. Load prompt template from Firestore config
  const configSnap = await db.collection("config").doc("interview_question_gen").get();
  if (!configSnap.exists || !configSnap.data().systemPrompt) {
    console.error("No interview_question_gen config found in Firestore. Seed config/interview_question_gen with a systemPrompt field.");
    process.exit(1);
  }
  const template = configSnap.data().systemPrompt;
  console.log(`Prompt template: ${template.length} chars`);

  // 7. Assemble system prompt from template + student data
  const systemPrompt = assembleSystemPrompt(template, {
    studentName: studentContext.studentName,
    age: studentContext.age,
    programId: studentContext.programId,
    soul,
    guidelines,
    baseballCard,
    openQuestions,
    priorInterviews: [],
  });

  // 8. Start conversation
  const messages = [{ role: "system", content: systemPrompt }];

  // First turn — no user message needed, just ask for Q1
  messages.push({ role: "user", content: "Begin the interview. Generate your exploration areas and first question." });

  console.log(`\nPreparing interview (cold start)...`);
  const { rawContent, elapsed } = await callLLM(messages);
  messages.push({ role: "assistant", content: rawContent });

  let parsed;
  try { parsed = JSON.parse(rawContent); } catch {
    console.error("Failed to parse LLM response:", (rawContent || "").slice(0, 300));
    process.exit(1);
  }

  // Show exploration areas
  if (parsed.explorationAreas) {
    console.log(`\n${"─".repeat(60)}`);
    console.log("EXPLORATION AREAS FOR THIS SESSION:");
    for (const ea of parsed.explorationAreas) {
      console.log(`  → ${ea.area}`);
      console.log(`    ${ea.rationale}`);
    }
  }

  // Show Q1
  let qNum = 1;
  console.log(`\n${"─".repeat(60)}`);
  printQuestion(parsed.question, qNum, elapsed);

  // 7. Interactive loop
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    const answer = await ask(rl, "\n📝 Your answer (or 'exit'): ");

    if (answer.trim().toLowerCase() === "exit") {
      console.log(`\nSession ended after ${qNum} questions.`);
      console.log(`Total messages in context: ${messages.length}`);
      break;
    }

    // Add teacher answer to conversation
    messages.push({ role: "user", content: answer.trim() });

    // Get next question
    qNum++;
    process.stdout.write("Thinking...");
    const next = await callLLM(messages);
    messages.push({ role: "assistant", content: next.rawContent });

    let nextParsed;
    try { nextParsed = JSON.parse(next.rawContent); } catch {
      console.error("\nFailed to parse:", (next.rawContent || "").slice(0, 300));
      continue;
    }

    // Show thinking + question
    console.log(`\r${"─".repeat(60)}`);
    if (nextParsed.thinking) {
      console.log(`💭 ${nextParsed.thinking}`);
    }
    printQuestion(nextParsed.question, qNum, next.elapsed);
  }

  rl.close();
}

function printQuestion(q, num, elapsed) {
  if (!q) { console.log("(no question in response)"); return; }
  console.log(`\nQ${num} [${(q.type || "open").toUpperCase()}] — ${q.area || "general"} (${elapsed}s)`);
  console.log(`\n  ${q.text}`);
  if (q.options) {
    q.options.forEach((opt, i) => console.log(`    ${String.fromCharCode(97 + i)}) ${opt}`));
  }
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
