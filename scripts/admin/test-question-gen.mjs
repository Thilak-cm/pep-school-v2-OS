/**
 * Prototype: Generate interview questions from a student's soul + guidelines.
 *
 * Reads a student's soul narrative, guidelines, recent interviews, and
 * baseball card from Firestore, calls OpenAI to generate targeted interview
 * questions, and outputs structured JSON to the console for human review.
 *
 * This validates the soul-based prompting strategy for the turn-by-turn
 * interview agent (PEP-143).
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
// Helpers
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

/**
 * Extract ## section headers from guidelines markdown as the valid area list.
 */
export function extractGuidelinesAreas(guidelinesContent) {
  const headers = [];
  for (const line of guidelinesContent.split("\n")) {
    const match = line.match(/^## (.+)$/);
    if (match) headers.push(match[1].trim());
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Exported functions (testable)
// ---------------------------------------------------------------------------

export function buildSystemPrompt(guidelinesContent) {
  const areas = extractGuidelinesAreas(guidelinesContent);
  const areaList = areas.map((a) => `- ${a}`).join("\n");

  return `You are an expert Montessori educator conducting a structured interview with a teacher about one of their students. Your goal is to generate targeted interview questions that will extract the most valuable new information about this child's development.

You will receive:
1. The student's soul narrative — a free-form AI-generated summary of who this child is, including areas needing further exploration
2. The student's guidelines — the evaluation framework with developmental areas and benchmarks
3. Recent interview transcripts — what has already been asked and answered recently
4. The student's baseball card — a condensed summary from recent observations

Your task: Generate 5-8 interview questions for a teacher, targeting areas where the soul identifies gaps or thin evidence. Mix question types between "mcq" (multiple choice) and "open" (open-ended).

Guidelines for question generation:
- Prioritise areas listed under "Areas Needing Further Exploration" in the soul — these are where interviews add the most value
- Avoid re-asking questions that were already covered in recent interviews — check the transcript summaries
- For MCQ questions, options should reflect developmental stages appropriate to the child's program and age. Options should be mutually exclusive and cover the realistic range of behaviours
- For open-ended questions, ask about specific observable behaviours, not abstract assessments
- Include at least one question about a well-evidenced area to confirm and deepen existing knowledge
- Frame questions naturally — as a colleague asking a fellow teacher, not as an examiner
- Each question must target one of the guideline areas listed below
- Include a rationale for each question explaining why it was chosen

Valid guideline areas for this student:
${areaList}

IMPORTANT: You must output your response as a JSON object with this exact structure:
{
  "questions": [
    {
      "id": number,
      "text": "The question text",
      "type": "mcq" or "open",
      "area": "One of the guideline areas listed above — must match exactly",
      "rationale": "Why this question was chosen",
      "options": ["Option A", "Option B", "Option C", "Option D"]  // ONLY for "mcq" type
    }
  ],
  "coverageReport": {
    "areasCovered": ["area1", "area2"],
    "areasSkipped": ["area3"],
    "gapsCovered": number,
    "gapsTotal": number,
    "reasoning": "Explanation of prioritisation logic"
  }
}

Notes on the JSON schema:
- "options" field: INCLUDE with 3-4 choices for "mcq" type. OMIT ENTIRELY (do not include the key) for "open" type
- "area" must EXACTLY match one of the guideline areas listed above
- "areasCovered" lists areas that have at least one question
- "areasSkipped" lists areas with no questions (explain why in reasoning)
- "gapsCovered" counts how many soul-identified gaps got at least one question
- "gapsTotal" counts total gaps identified in the soul's "Areas Needing Further Exploration"
Output ONLY the JSON object, nothing else.`;
}

export function buildUserPrompt(studentContext, soul, guidelines, recentInterviews, baseballCard) {
  const sections = [
    "Generate interview questions for this student based on their soul, guidelines, and recent context.",
    "",
    `Student: ${studentContext.studentName}, ${studentContext.age}, program: ${studentContext.programId}`,
    "",
    "--- SOUL NARRATIVE ---",
    soul,
    "",
    "--- GUIDELINES ---",
    guidelines,
    "",
  ];

  // Recent interviews
  sections.push("--- RECENT INTERVIEWS ---");
  if (recentInterviews && recentInterviews.length > 0) {
    for (const interview of recentInterviews) {
      sections.push(`Interview by ${interview.teacherName} on ${interview.conductedAt}:`);
      sections.push(`Areas covered: ${interview.areasCovered?.join(", ") || "unknown"}`);
      for (const ex of interview.exchanges || []) {
        sections.push(`  Q: ${ex.questionText}`);
        sections.push(`  A: ${ex.responseText || ex.selectedOptionText || "(no response)"}`);
      }
      sections.push("");
    }
  } else {
    sections.push("No recent interviews available for this student.");
    sections.push("");
  }

  // Baseball card
  sections.push("--- BASEBALL CARD ---");
  if (baseballCard) {
    sections.push(`Summary (last ${baseballCard.windowDays} days, ${baseballCard.noteCount} observations):`);
    sections.push(baseballCard.summary);
    if (baseballCard.coverageGaps?.length) {
      sections.push(`Coverage gaps: ${baseballCard.coverageGaps.join(", ")}`);
    }
  } else {
    sections.push("No baseball card available for this student.");
  }

  return sections.join("\n");
}

export function parseQuestionResponse(rawContent, guidelinesAreas) {
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
    if (q.area && !guidelinesAreas.includes(q.area)) {
      warnings.push(`Question ${q.id}: unknown area "${q.area}" (expected one of: ${guidelinesAreas.join(", ")})`);
    }
    // Strip spurious options from open-ended questions
    if (q.type === "open" && Array.isArray(q.options)) {
      delete q.options;
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

    // 2. Fetch soul narrative
    const soulSnap = await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("soul").get();
    if (!soulSnap.exists) {
      console.error(`No soul found for student: ${studentId}`);
      console.error("Run generateStudentProfile first.");
      process.exit(1);
    }
    const soul = soulSnap.data().content;
    console.log(`Soul loaded (${soul.length} chars)`);

    // 3. Fetch guidelines
    const guidelinesSnap = await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("guidelines").get();
    if (!guidelinesSnap.exists) {
      console.error(`No guidelines found for student: ${studentId}`);
      process.exit(1);
    }
    const guidelines = guidelinesSnap.data().content;
    const areas = extractGuidelinesAreas(guidelines);
    console.log(`Guidelines loaded (${areas.length} areas: ${areas.join(", ")})`);

    // 4. Fetch recent interviews (last 14 days)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const interviewsSnap = await db.collection("students").doc(studentId)
      .collection("interviews")
      .where("conductedAt", ">=", twoWeeksAgo)
      .where("status", "==", "completed")
      .orderBy("conductedAt", "desc")
      .limit(5)
      .get();

    const recentInterviews = [];
    interviewsSnap.forEach((doc) => {
      const data = doc.data();
      recentInterviews.push({
        teacherName: data.teacherName,
        conductedAt: data.conductedAt?.toDate?.()?.toISOString() || data.conductedAt,
        status: data.status,
        areasCovered: data.areasCovered || [],
        exchanges: data.exchanges || [],
      });
    });
    console.log(`Recent interviews loaded: ${recentInterviews.length}`);

    // 5. Fetch baseball card
    const bcSnap = await db.collection("students").doc(studentId)
      .collection("ai_summaries").doc("baseball_card").get();
    const baseballCard = bcSnap.exists ? bcSnap.data() : null;

    if (baseballCard) {
      console.log(`Baseball card loaded (${baseballCard.noteCount} notes, ${baseballCard.windowDays}-day window)`);
    } else {
      console.log("No baseball card found — proceeding without it.");
    }

    // 6. Build prompts
    const systemPrompt = buildSystemPrompt(guidelines);
    const userPrompt = buildUserPrompt(studentContext, soul, guidelines, recentInterviews, baseballCard);

    // 7. Call OpenAI
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

    if (!rawContent) {
      console.error("Empty response from OpenAI — unexpected response shape");
      process.exit(1);
    }

    // 8. Parse and validate
    const result = parseQuestionResponse(rawContent, areas);

    if (result.warnings.length > 0) {
      console.log("\nWarnings:");
      for (const w of result.warnings) console.log(`  ! ${w}`);
    }

    // 9. Output
    console.log("\n" + "=".repeat(80));
    console.log("INTERVIEW QUESTIONS");
    console.log("=".repeat(80));

    for (const q of result.questions) {
      console.log(`\n--- Q${q.id}: [${q.type.toUpperCase()}] ${q.area} ---`);
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
      console.log(`Areas covered: ${cr.areasCovered?.join(", ")}`);
      console.log(`Areas skipped: ${cr.areasSkipped?.join(", ") || "none"}`);
      console.log(`Gaps covered: ${cr.gapsCovered}/${cr.gapsTotal}`);
      console.log(`Reasoning: ${cr.reasoning}`);
    }

    // 10. Full JSON output
    console.log("\n" + "-".repeat(80));
    console.log("RAW JSON OUTPUT");
    console.log("-".repeat(80));
    console.log(JSON.stringify(result, null, 2));

    // 11. Token usage
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
