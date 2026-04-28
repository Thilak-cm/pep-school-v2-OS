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
 * Usage:
 *   node scripts/admin/test-question-gen.mjs <studentId>
 *
 * Requires: OPENAI_API_KEY environment variable
 */
import admin from "firebase-admin";
import readline from "node:readline";
import { FRONTIER_MODEL } from "../../functions/config/modelConstants.js";

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
  return `${years}y ${months}m`;
}

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(guidelines, soul, baseballCard, studentContext) {
  return `You are an expert Montessori interview agent conducting a live, turn-by-turn interview with a teacher about one of their students. You generate ONE question at a time, adapting based on the teacher's responses.

STUDENT CONTEXT:
Name: ${studentContext.studentName}
Age: ${studentContext.age}
Program: ${studentContext.programId}

SOUL NARRATIVE (AI-generated understanding of this child):
${soul}

GUIDELINES (evaluation framework — ## headers are developmental areas):
${guidelines}

${baseballCard ? `BASEBALL CARD (recent ${baseballCard.windowDays}-day summary, ${baseballCard.noteCount} observations):\n${baseballCard.summary}${baseballCard.coverageGaps?.length ? `\nCoverage gaps: ${baseballCard.coverageGaps.join(", ")}` : ""}` : "No baseball card available."}

YOUR BEHAVIOUR:
- On the FIRST turn, output TWO exploration areas for this interview session (a loose agenda — areas where you want to learn more, based on gaps in the soul or thin evidence). Then output your first question.
- On SUBSEQUENT turns, read the teacher's answer, then generate the next question. You may:
  - Follow up on the same topic if the answer was interesting or incomplete
  - Switch to your second exploration area
  - Go somewhere entirely new if the conversation reveals something unexpected
- You have FREE RANGE in question-asking. The only constraint: stay within this student's developmental context. Goal is to learn more about the student.
- Frame questions naturally — as a colleague asking a fellow teacher, not as an examiner
- Mix question types: some open-ended, some multiple-choice when developmental stages are useful
- Keep questions specific and observable — ask about behaviours, not abstractions

OUTPUT FORMAT (strict JSON):

First turn:
{
  "explorationAreas": [
    { "area": "Short area name", "rationale": "Why this area — what's thin, missing, or worth deepening" },
    { "area": "Short area name", "rationale": "Why this area" }
  ],
  "question": {
    "text": "The question to ask the teacher",
    "type": "open" or "mcq",
    "area": "Which developmental area this targets",
    "options": ["A", "B", "C", "D"]  // ONLY for mcq, OMIT for open
  }
}

Subsequent turns:
{
  "thinking": "Brief internal reasoning about what to ask next and why (1-2 sentences)",
  "question": {
    "text": "The next question",
    "type": "open" or "mcq",
    "area": "Which developmental area this targets",
    "options": ["A", "B", "C", "D"]  // ONLY for mcq, OMIT for open
  }
}

Output ONLY valid JSON, nothing else.`;
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

  return { rawContent, elapsed, usage: json.usage };
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

  // 5. Build system prompt
  const systemPrompt = buildSystemPrompt(guidelines, soul, baseballCard, studentContext);

  // 6. Start conversation
  const messages = [{ role: "system", content: systemPrompt }];

  // First turn — no user message needed, just ask for Q1
  messages.push({ role: "user", content: "Begin the interview. Generate your exploration areas and first question." });

  console.log(`\nPreparing interview (cold start)...`);
  const { rawContent, elapsed, usage } = await callLLM(messages);
  messages.push({ role: "assistant", content: rawContent });

  let parsed;
  try { parsed = JSON.parse(rawContent); } catch {
    console.error("Failed to parse LLM response:", rawContent.slice(0, 300));
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
    process.stdout.write(`\nThinking...`);
    const next = await callLLM(messages);
    messages.push({ role: "assistant", content: next.rawContent });

    let nextParsed;
    try { nextParsed = JSON.parse(next.rawContent); } catch {
      console.error("\nFailed to parse:", next.rawContent.slice(0, 300));
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
