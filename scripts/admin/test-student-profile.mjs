/**
 * Test generateStudentProfile for a single student.
 *
 * Usage:
 *   node scripts/admin/test-student-profile.mjs <studentId>
 *   node scripts/admin/test-student-profile.mjs 2025-ALL-001
 *   node scripts/admin/test-student-profile.mjs 2025-ALL-001 --window=90
 *
 * This bypasses the callable auth gate by directly invoking the same logic
 * the Cloud Function uses, via the admin SDK (which has full access).
 */
import admin from "firebase-admin";
import { PROGRAM_DIMENSIONS, VALID_PROGRAMS, PROFILE_DEFAULTS } from "../../functions/config/profileConstants.js";
import { parseProfileResponse } from "../../functions/utils/profileHelpers.js";

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
  console.error("Usage: node scripts/admin/test-student-profile.mjs <studentId> [--window=365]");
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

  // 2. Get dimensions
  const dimSnap = await db.collection("config").doc(`profile_dimensions_${programId}`).get();
  const dimensions = dimSnap.exists ? dimSnap.data().dimensions : PROGRAM_DIMENSIONS[programId];
  console.log(`Dimensions: ${dimensions.length} (${dimensions.map((d) => d.key).join(", ")})\n`);

  // 3. Get prompt
  const promptSnap = await db.collection("ai_prompts").doc(`profile_${programId}`).get();
  if (!promptSnap.exists) {
    console.error(`Profile prompt not found: ai_prompts/profile_${programId}`);
    console.error("Run: node scripts/admin/seed-profile-prompts.mjs");
    process.exit(1);
  }
  const promptData = promptSnap.data();
  const systemPrompt = promptData.staticSystemPrompt + (promptData.dynamicSystemPrompt || "");

  // 4. Fetch observations
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
    console.log("No observations — would write empty profile. Exiting.");
    process.exit(0);
  }

  const formatted = notes.map(formatObservationForPrompt);

  // 5. Call OpenAI
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    console.error("Set OPENAI_API_KEY environment variable");
    process.exit(1);
  }

  const dimBlock = dimensions.map((d) => `- ${d.key}: ${d.label} — ${d.description}`).join("\n");
  const jsonWrapper = `\n\nIMPORTANT: You must output your response as a JSON object.\nEach key must be one of the dimension keys listed above.\nEach value must be an object with exactly: { "narrative": string, "confidence": number, "evidenceCount": number, "trend": string, "gaps": string }\n- "gaps": a plain-text description of what is unknown, uncertain, or unobserved about this child in this dimension. Describe specific missing observations or blind spots (e.g., "No observations of independent reading. Social interactions only observed in group settings."). Use an empty string "" if the dimension is well-covered with no obvious gaps.\nOutput ONLY the JSON object, nothing else.`;

  const fullSystem = systemPrompt + "\n\nDimension keys for this student's program:\n" + dimBlock + jsonWrapper;

  const studentContext = {
    studentName,
    dob: formatDob(studentData.dob),
    age: calculateAge(studentData.dob),
    programId,
  };

  const userContent = [
    "Generate a student profile from the following observations.",
    "",
    `Student: ${JSON.stringify(studentContext)}`,
    "",
    `Observations (${formatted.length} notes, JSON array):`,
    JSON.stringify(formatted),
  ].join("\n");

  console.log(`\nCalling ${PROFILE_DEFAULTS.model}...`);
  const startTime = Date.now();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: PROFILE_DEFAULTS.model,
      messages: [
        { role: "system", content: fullSystem },
        { role: "user", content: userContent },
      ],
      temperature: PROFILE_DEFAULTS.temperature,
      max_completion_tokens: PROFILE_DEFAULTS.max_tokens,
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
  console.log(`Response received in ${elapsed}s\n`);

  const parsed = JSON.parse(rawContent);
  const profileEntries = parseProfileResponse(parsed, dimensions);

  // 6. Print results
  console.log("=".repeat(80));
  console.log(`PROFILE: ${studentName} (${programId})`);
  console.log("=".repeat(80));

  for (const entry of profileEntries) {
    const sig = entry.structuredSignals;
    console.log(`\n--- ${entry.dimensionLabel} (${entry.dimensionKey}) ---`);
    console.log(`Confidence: ${sig.confidence} | Evidence: ${sig.evidenceCount} | Trend: ${sig.trend}`);
    console.log(`\n${entry.narrative}`);
    if (entry.gaps) {
      console.log(`\nGaps: ${entry.gaps}`);
    }
    console.log();
  }

  // 7. Optionally write to Firestore
  const writeFlag = args.includes("--write");
  if (writeFlag) {
    console.log("\nWriting profile to Firestore...");
    const profileRef = db.collection("students").doc(studentId).collection("profile");
    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();

    for (const entry of profileEntries) {
      const dimRef = profileRef.doc(entry.dimensionKey);
      batch.set(dimRef, {
        dimensionKey: entry.dimensionKey,
        dimensionLabel: entry.dimensionLabel,
        programId,
        narrative: entry.narrative,
        gaps: entry.gaps || "",
        structuredSignals: {
          ...entry.structuredSignals,
          lastSourceType: "backfill",
        },
        createdAt: now,
        updatedAt: now,
        updatedBy: "admin-script:test-student-profile",
      });
    }

    await batch.commit();
    console.log(`Written ${profileEntries.length} dimension docs to students/${studentId}/profile/`);
  } else {
    console.log("\nDry run — profile NOT written to Firestore.");
    console.log("Add --write to persist: node scripts/admin/test-student-profile.mjs " + studentId + " --write");
  }
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
