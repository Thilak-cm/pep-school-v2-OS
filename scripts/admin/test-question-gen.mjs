/**
 * Prototype: Generate interview questions from a student's profile.
 *
 * Reads a student's profile dimensions + baseball card from Firestore,
 * calls OpenAI to generate 7 targeted interview questions, and outputs
 * structured JSON to the console for human review.
 *
 * Usage:
 *   node scripts/admin/test-question-gen.mjs <studentId>
 *   node scripts/admin/test-question-gen.mjs 2025-ADO-001
 *
 * Requires: OPENAI_API_KEY environment variable
 */
import admin from "firebase-admin";
import { FRONTIER_MODEL } from "../../functions/config/modelConstants.js";

// ---------------------------------------------------------------------------
// Firebase init (only when running as a script, not when imported for tests)
// ---------------------------------------------------------------------------

let db;
const isMainScript = process.argv[1]?.endsWith("test-question-gen.mjs");

if (isMainScript) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: "pep-os",
    });
  }
  db = admin.firestore();
}

// ---------------------------------------------------------------------------
// Helpers (reused from test-student-profile.mjs)
// ---------------------------------------------------------------------------

function formatDob(dobValue) {
  if (!dobValue) return "dob unavailable";
  const d = dobValue.toDate ? dobValue.toDate() : new Date(dobValue);
  return d.toISOString().split("T")[0];
}

function calculateAge(dobValue) {
  if (!dobValue) return "age unavailable";
  const d = dobValue.toDate ? dobValue.toDate() : new Date(dobValue);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  let months = now.getMonth() - d.getMonth();
  if (now.getDate() < d.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  return `${years} years ${months} months old`;
}

// ---------------------------------------------------------------------------
// Exported functions (testable)
// ---------------------------------------------------------------------------

export function buildSystemPrompt(profileDims) {
  const dimList = profileDims.map((d) =>
    `- ${d.dimensionKey} (${d.dimensionLabel}): confidence=${d.structuredSignals.confidence}, evidenceCount=${d.structuredSignals.evidenceCount}, trend=${d.structuredSignals.trend}`
  ).join("\n");

  return `You are an expert Montessori educator conducting a structured interview with a teacher about one of their students. Your goal is to generate targeted interview questions that will extract the most valuable new information about this child's development.

You will receive:
1. The student's profile dimensions — each with a narrative, confidence score (0-1), evidence count, and trend
2. The student's baseball card — a condensed AI summary from recent observations

Your task: Generate exactly 7 interview questions for a teacher, targeting the dimensions where the profile has the weakest confidence or fewest observations. Mix question types between "mcq" (multiple choice) and "open" (open-ended). Aim for roughly 3-4 MCQ and 3-4 open-ended questions.

Guidelines:
- Prioritize low-confidence dimensions — these are where interviews add the most value
- For MCQ questions, options should reflect developmental stages appropriate to the child's program and age. Options should be mutually exclusive and cover the realistic range of behaviors
- For open-ended questions, ask about specific observable behaviors, not abstract assessments
- Include at least one question about a high-confidence dimension to confirm and deepen existing knowledge
- Frame questions naturally — as a colleague asking a fellow teacher, not as an examiner
- Each question should target a specific dimension
- Include a rationale for each question explaining why it was chosen

Profile dimensions for this student:
${dimList}

IMPORTANT: You must output your response as a JSON object with this exact structure:
{
  "questions": [
    {
      "id": number,
      "text": "The question text",
      "type": "mcq" or "open",
      "dimension": "dimension_key from the list above",
      "rationale": "Why this question was chosen",
      "options": ["Option A", "Option B", "Option C", "Option D"]
    }
  ],
  "coverageReport": {
    "dimensionsTargeted": ["dim_key_1", "dim_key_2"],
    "dimensionsSkipped": ["dim_key_3"],
    "gapsCovered": number,
    "gapsTotal": number,
    "reasoning": "Explanation of prioritization logic"
  }
}

Notes on the JSON schema:
- "options" is required for "mcq" type, omit for "open" type
- "dimensionsTargeted" lists dimensions that have at least one question
- "dimensionsSkipped" lists dimensions with no questions (explain why in reasoning)
- "gapsCovered" counts how many low-confidence (< 0.5) dimensions have questions
- "gapsTotal" counts total low-confidence dimensions
Output ONLY the JSON object, nothing else.`;
}

export function buildUserPrompt(studentContext, profileDims, baseballCard) {
  const profileBlock = profileDims.map((d) => ({
    dimensionKey: d.dimensionKey,
    dimensionLabel: d.dimensionLabel,
    narrative: d.narrative,
    confidence: d.structuredSignals.confidence,
    evidenceCount: d.structuredSignals.evidenceCount,
    trend: d.structuredSignals.trend,
  }));

  let baseballCardBlock;
  if (baseballCard) {
    baseballCardBlock = [
      `Baseball Card (last ${baseballCard.windowDays} days, ${baseballCard.noteCount} observations):`,
      baseballCard.summary,
      baseballCard.coverageGaps?.length
        ? `Coverage gaps identified: ${baseballCard.coverageGaps.join(", ")}`
        : "",
    ].filter(Boolean).join("\n");
  } else {
    baseballCardBlock = "Baseball card: No baseball card available for this student.";
  }

  return [
    "Generate 7 interview questions for this student based on their profile and baseball card.",
    "",
    `Student: ${studentContext.studentName}, ${studentContext.age}, program: ${studentContext.programId}`,
    "",
    "Profile dimensions:",
    JSON.stringify(profileBlock, null, 2),
    "",
    baseballCardBlock,
  ].join("\n");
}

export function parseQuestionResponse(rawContent, dimensionKeys) {
  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON: ${rawContent.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.questions)) {
    throw new Error('LLM response must contain a "questions" array');
  }

  const warnings = [];

  for (const q of parsed.questions) {
    if (q.dimension && !dimensionKeys.includes(q.dimension)) {
      warnings.push(`Question ${q.id}: unknown dimension "${q.dimension}" (expected one of: ${dimensionKeys.join(", ")})`);
    }
  }

  return {
    questions: parsed.questions,
    coverageReport: parsed.coverageReport || null,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Main (only when running as a script)
// ---------------------------------------------------------------------------

if (isMainScript) {
  const args = process.argv.slice(2);
  const studentId = args.find((a) => !a.startsWith("--"));

  if (!studentId) {
    console.error("Usage: node scripts/admin/test-question-gen.mjs <studentId>");
    process.exit(1);
  }

  async function run() {
    // 1. Get student + program
    const studentSnap = await db.collection("students").doc(studentId).get();
    if (!studentSnap.exists) {
      console.error(`Student not found: ${studentId}`);
      process.exit(1);
    }
    const studentData = studentSnap.data();
    const classroomSnap = await db.collection("classrooms").doc(studentData.classroomId).get();
    const programId = classroomSnap.exists ? classroomSnap.data()?.programId : null;

    const studentName = studentData.displayName || [studentData.firstName, studentData.lastName].filter(Boolean).join(" ");
    const studentContext = {
      studentName,
      dob: formatDob(studentData.dob),
      age: calculateAge(studentData.dob),
      programId,
    };

    console.log(`\nStudent: ${studentName} (${studentId})`);
    console.log(`Program: ${programId} | Classroom: ${studentData.classroomId}\n`);

    // 2. Fetch profile dimensions
    const profileSnap = await db.collection("students").doc(studentId).collection("profile").get();
    if (profileSnap.empty) {
      console.error(`No profile dimensions found for student: ${studentId}`);
      console.error("Run generateStudentProfile first.");
      process.exit(1);
    }

    const profileDims = [];
    profileSnap.forEach((doc) => {
      const d = doc.data();
      profileDims.push({
        dimensionKey: d.dimensionKey,
        dimensionLabel: d.dimensionLabel,
        narrative: d.narrative,
        structuredSignals: d.structuredSignals,
      });
    });

    console.log(`Profile dimensions loaded: ${profileDims.length}`);
    for (const dim of profileDims) {
      const sig = dim.structuredSignals;
      console.log(`  ${dim.dimensionKey}: confidence=${sig.confidence}, evidence=${sig.evidenceCount}, trend=${sig.trend}`);
    }

    // 3. Fetch baseball card
    const bcSnap = await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("baseball_card").get();
    const baseballCard = bcSnap.exists ? bcSnap.data() : null;

    if (baseballCard) {
      console.log(`\nBaseball card loaded (${baseballCard.noteCount} notes, ${baseballCard.windowDays}-day window)`);
    } else {
      console.log("\nNo baseball card found — proceeding without it.");
    }

    // 4. Build prompts
    const systemPrompt = buildSystemPrompt(profileDims);
    const userPrompt = buildUserPrompt(studentContext, profileDims, baseballCard);

    // 5. Call OpenAI
    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      console.error("\nSet OPENAI_API_KEY environment variable");
      process.exit(1);
    }

    const model = FRONTIER_MODEL;
    console.log(`\nCalling ${model}...`);
    const startTime = Date.now();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`OpenAI error ${response.status}:`, errText.slice(0, 500));
      process.exit(1);
    }

    const json = await response.json();
    const rawContent = json?.choices?.[0]?.message?.content?.trim();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Response received in ${elapsed}s`);

    // 6. Parse and validate
    const dimKeys = profileDims.map((d) => d.dimensionKey);
    const result = parseQuestionResponse(rawContent, dimKeys);

    if (result.warnings.length > 0) {
      console.log("\nWarnings:");
      for (const w of result.warnings) console.log(`  ! ${w}`);
    }

    // 7. Output
    console.log("\n" + "=".repeat(80));
    console.log("INTERVIEW QUESTIONS");
    console.log("=".repeat(80));

    for (const q of result.questions) {
      console.log(`\n--- Q${q.id}: [${q.type.toUpperCase()}] ${q.dimension} ---`);
      console.log(q.text);
      if (q.options) {
        q.options.forEach((opt, i) => console.log(`  ${String.fromCharCode(97 + i)}) ${opt}`));
      }
      console.log(`  Rationale: ${q.rationale}`);
    }

    console.log("\n" + "-".repeat(80));
    console.log("COVERAGE REPORT");
    console.log("-".repeat(80));
    if (result.coverageReport) {
      const cr = result.coverageReport;
      console.log(`Dimensions targeted: ${cr.dimensionsTargeted?.join(", ")}`);
      console.log(`Dimensions skipped: ${cr.dimensionsSkipped?.join(", ") || "none"}`);
      console.log(`Gaps covered: ${cr.gapsCovered}/${cr.gapsTotal}`);
      console.log(`Reasoning: ${cr.reasoning}`);
    }

    // 8. Full JSON output
    console.log("\n" + "-".repeat(80));
    console.log("RAW JSON OUTPUT");
    console.log("-".repeat(80));
    console.log(JSON.stringify(result, null, 2));

    // 9. Token usage
    if (json.usage) {
      console.log("\n" + "-".repeat(80));
      console.log(`Tokens — prompt: ${json.usage.prompt_tokens}, completion: ${json.usage.completion_tokens}, total: ${json.usage.total_tokens}`);
    }
  }

  run().catch((err) => {
    console.error("Failed:", err);
    process.exit(1);
  });
}
