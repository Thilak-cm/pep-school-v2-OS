/**
 * Test soul generation for a single student (PEP-149).
 *
 * Usage:
 *   node scripts/admin/test-student-profile.mjs <studentId>
 *   node scripts/admin/test-student-profile.mjs 2025-ADO-001
 *   node scripts/admin/test-student-profile.mjs 2025-ADO-001 --window=90
 *   node scripts/admin/test-student-profile.mjs 2025-ADO-001 --write
 *
 * This bypasses the callable auth gate by directly invoking the same logic
 * the Cloud Function uses, via the admin SDK (which has full access).
 */
import admin from "firebase-admin";
import {
  SOUL_DEFAULTS, VALID_PROGRAMS,
  buildSoulSystemPrompt, buildSoulUserPrompt, parseSoulResponse,
  buildSoulDoc, buildGuidelinesDoc, buildHistorySnapshot, hasEmergentObservations, hasInformationGaps,
  extractGuidelinesSuggestions, stripGuidelinesSuggestions,
} from "../../functions/utils/soulHelpers.js";
import { formatInterviewForPrompt } from "../../functions/utils/interviewHelpers.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

// ---------------------------------------------------------------------------
// Reuse helpers from functions/index.js (lightweight copies for admin script)
// ---------------------------------------------------------------------------

function chooseObservationTimestamp(obs) {
  const raw = obs.observedAt || obs.createdAt || obs.timestamp;
  if (!raw) return null;
  if (raw.toDate) return raw.toDate();
  if (raw instanceof Date) return raw;
  if (typeof raw === "string") return new Date(raw);
  if (typeof raw === "number") return new Date(raw);
  return null;
}

function formatObservationForPrompt(obs) {
  const ts = chooseObservationTimestamp(obs);
  return {
    type: obs.type || "",
    text: obs.text || "",
    lessonTitle: obs.lessonTitle || obs.title || "",
    lessonDescription: obs.lessonDescription || obs.description || "",
    groupComment: obs.groupComment || "",
    studentComment: obs.studentComment || "",
    createdByName: obs.createdByName || obs.teacherName || "",
    observedAt: ts ? ts.toISOString() : null,
    ratings: obs.ratings || obs.dimensionRatings || {},
    dimensionOrder: obs.dimensionOrder || [],
  };
}

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
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const studentId = args.find((a) => !a.startsWith("--"));
const windowFlag = args.find((a) => a.startsWith("--window="));
const windowDays = windowFlag ? parseInt(windowFlag.split("=")[1], 10) : 365;

if (!studentId) {
  console.error("Usage: node scripts/admin/test-student-profile.mjs <studentId> [--window=365] [--write]");
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
  console.log(`\nStudent: ${studentName} (${studentId})`);
  console.log(`Program: ${programId} | Classroom: ${studentData.classroomId}`);
  console.log(`Window: ${windowDays} days\n`);

  if (!programId || !VALID_PROGRAMS.includes(programId)) {
    console.error(`Invalid program: ${programId}`);
    process.exit(1);
  }

  // 2. Get soul template from config
  const templateSnap = await db.collection("config").doc(`soul_template_${programId}`).get();
  if (!templateSnap.exists) {
    console.error(`Soul template not found: config/soul_template_${programId}. Run seed-soul-templates.mjs --apply first.`);
    process.exit(1);
  }
  const templateMarkdown = templateSnap.data().markdown;
  console.log(`Template loaded: ${templateMarkdown.split("\n").length} lines\n`);

  // 3. Read existing guidelines (or use template)
  const guidelinesSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("guidelines").get();
  const guidelinesContent = guidelinesSnap.exists
    ? guidelinesSnap.data().content
    : templateMarkdown;
  console.log(`Guidelines: ${guidelinesSnap.exists ? "per-student (existing)" : "from template (first run)"}`);

  // 4. Read previous soul for continuity
  const prevSoulSnap = await db.collection("students").doc(studentId)
    .collection("ai_summaries").doc("soul").get();
  const previousSoul = prevSoulSnap.exists ? prevSoulSnap.data().content : null;
  if (previousSoul) {
    console.log(`Previous soul: ${previousSoul.split("\n").length} lines`);
  }

  // 5. Fetch observations
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const notesMap = new Map();
  const obsRef = db.collection("students").doc(studentId).collection("observations");

  for (const field of ["observedAt", "createdAt", "timestamp"]) {
    try {
      const snap = await obsRef.where(field, ">=", cutoff).get();
      snap.docs.forEach((doc) => notesMap.set(doc.id, { id: doc.id, ...doc.data() }));
    } catch (err) { console.warn(`[obs query] field=${field} skipped:`, err.message); }
  }

  const notes = Array.from(notesMap.values()).filter((n) => {
    const ts = chooseObservationTimestamp(n);
    return ts && ts >= cutoff;
  });
  notes.sort((a, b) => {
    const ta = chooseObservationTimestamp(a);
    const tb = chooseObservationTimestamp(b);
    return (tb?.getTime() || 0) - (ta?.getTime() || 0);
  });

  console.log(`Observations found: ${notes.length}`);

  if (!notes.length) {
    console.log("No observations — would write empty soul. Exiting.");
    process.exit(0);
  }

  const formatted = notes.map(formatObservationForPrompt);

  // 5b. Fetch interviews
  const interviewsRef = db.collection("students").doc(studentId).collection("interviews");
  let rawInterviews = [];
  try {
    const interviewSnap = await interviewsRef
      .where("status", "==", "completed")
      .where("conductedAt", ">=", cutoff)
      .orderBy("conductedAt", "desc")
      .get();
    rawInterviews = interviewSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.warn(`[interviews] fetch failed: ${err.message}`);
  }
  const formattedInterviews = rawInterviews.map(formatInterviewForPrompt);
  console.log(`Interviews found: ${rawInterviews.length}`);

  // 6. Call OpenAI
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    console.error("Set OPENAI_API_KEY environment variable");
    process.exit(1);
  }

  const studentContext = {
    studentName,
    dob: formatDob(studentData.dob),
    age: calculateAge(studentData.dob),
    programId,
  };

  const systemContent = buildSoulSystemPrompt(guidelinesContent);
  const userContent = buildSoulUserPrompt(studentContext, formatted, formattedInterviews, previousSoul);

  const model = SOUL_DEFAULTS.model;
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
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      temperature: SOUL_DEFAULTS.temperature,
      max_completion_tokens: SOUL_DEFAULTS.max_tokens,
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
  console.log(`Response received in ${elapsed}s\n`);

  const fullContent = parseSoulResponse(rawContent);
  const guidelinesSuggestions = extractGuidelinesSuggestions(fullContent);
  const soulContent = stripGuidelinesSuggestions(fullContent);

  // 7. Print results
  console.log("=".repeat(80));
  console.log(`SOUL: ${studentName} (${programId})`);
  console.log("=".repeat(80));
  console.log();
  console.log(soulContent);
  console.log();
  console.log("=".repeat(80));
  console.log(`Emergent observations: ${hasEmergentObservations(soulContent) ? "YES" : "No"}`);
  console.log(`Information gaps: ${hasInformationGaps(soulContent) ? "YES" : "No"}`);
  if (guidelinesSuggestions.length > 0) {
    console.log(`Guidelines suggestions: ${guidelinesSuggestions.length}`);
    for (const s of guidelinesSuggestions) {
      console.log(`  - ${s.area} → ${s.discipline}: ${s.rationale}`);
    }
  }
  console.log("=".repeat(80));

  // 8. Optionally write to Firestore
  const writeFlag = args.includes("--write");
  if (writeFlag) {
    console.log("\nWriting soul + guidelines to Firestore...");
    const aiSummariesRef = db.collection("students").doc(studentId).collection("ai_summaries");
    const soulRef = aiSummariesRef.doc("soul");
    const guidelinesRef = aiSummariesRef.doc("guidelines");
    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();

    // Snapshot previous soul to history
    if (prevSoulSnap.exists) {
      const historyRef = soulRef.collection("history").doc(now.toMillis().toString());
      batch.set(historyRef, buildHistorySnapshot(prevSoulSnap.data(), "Admin script regeneration"));
    }

    // Write soul
    const lastObsAt = notes.length ? chooseObservationTimestamp(notes[0]) : null;
    const lastInterviewAt = rawInterviews.length && rawInterviews[0].conductedAt
      ? (rawInterviews[0].conductedAt.toDate ? rawInterviews[0].conductedAt.toDate() : new Date(rawInterviews[0].conductedAt))
      : null;
    const soulDoc = buildSoulDoc({
      content: soulContent,
      programId,
      observationCount: formatted.length,
      interviewCount: formattedInterviews.length,
      lastObservationAt: lastObsAt,
      lastInterviewAt,
    });
    soulDoc.hasEmergentObservations = hasEmergentObservations(soulContent);
    soulDoc.hasInformationGaps = hasInformationGaps(soulContent);
    soulDoc.guidelinesSuggestions = guidelinesSuggestions;
    soulDoc.createdAt = prevSoulSnap.exists ? (prevSoulSnap.data().createdAt || now) : now;
    soulDoc.updatedAt = now;
    batch.set(soulRef, soulDoc);

    // Seed guidelines if missing
    if (!guidelinesSnap.exists) {
      const guidelinesDoc = buildGuidelinesDoc({
        content: templateMarkdown,
        programId,
        templateDocId: `config/soul_template_${programId}`,
      });
      guidelinesDoc.createdAt = now;
      guidelinesDoc.updatedAt = now;
      batch.set(guidelinesRef, guidelinesDoc);
      console.log(`  Seeded guidelines from soul_template_${programId}`);
    }

    await batch.commit();
    console.log(`  Written soul to students/${studentId}/ai_summaries/soul`);
  } else {
    console.log("\nDry run — soul NOT written to Firestore.");
    console.log("Add --write to persist: node scripts/admin/test-student-profile.mjs " + studentId + " --write");
  }
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
