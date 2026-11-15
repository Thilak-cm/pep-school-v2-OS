/**
 * One-time backfill: index existing observations into Typesense.
 *
 * Iterates all students, then all observations per student. Skips assessment
 * and medical types. Uses a local JSON checkpoint file for resume support.
 *
 * Dry-run by default. Requires --yes to execute writes.
 * Pass --resume to continue from the last checkpoint.
 *
 * Usage:
 *   node scripts/ops/backfill-typesense.mjs                    # dry-run
 *   node scripts/ops/backfill-typesense.mjs --yes              # apply
 *   node scripts/ops/backfill-typesense.mjs --yes --resume     # resume from checkpoint
 */

import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import Typesense from "typesense";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(__dirname, "../../functions/package.json"));
const serviceAccount = require(path.resolve(__dirname, "../../firebase-service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const shouldApply = process.argv.includes("--yes");
const shouldResume = process.argv.includes("--resume");
const dryRun = !shouldApply;

const CHECKPOINT_PATH = path.resolve(__dirname, ".backfill-typesense-checkpoint.json");
const COLLECTION = "observations";
const SKIPPED_TYPES = new Set(["assessment", "medical"]);
const BATCH_SIZE = 40; // Typesense import batch size

function loadCheckpoint() {
  if (!shouldResume || !fs.existsSync(CHECKPOINT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveCheckpoint(data) {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(data, null, 2));
}

function buildTypesenseDoc(observationData, studentId, observationId) {
  const coachSelections = observationData.coach?.selections || {};
  return {
    id: `${studentId}_${observationId}`,
    studentId,
    observationId,
    classroomId: observationData.classroomId || "",
    type: observationData.type || "text",
    createdBy: observationData.createdBy || "",
    observedAt: observationData.observedAt?.seconds
      || (observationData.observedAt?._seconds)
      || Math.floor(Date.now() / 1000),
    programId: observationData.programId || "",
    starScore: observationData.starScore || 0,
    groupId: observationData.groupId || "",
    studentName: observationData.studentName || "",
    text: observationData.text || "",
    lessonTitle: observationData.lessonTitle || "",
    lessonDescription: observationData.lessonDescription || "",
    groupComment: observationData.groupComment || "",
    studentComment: observationData.studentComment || "",
    teacherComment: observationData.teacherComment || "",
    curriculumArea: observationData.curriculumArea || "",
    materialsIdentified: Array.isArray(observationData.materialsIdentified)
      ? observationData.materialsIdentified.join(", ")
      : "",
    pdfTitle: observationData.pdfTitle || "",
    essence_text: observationData.essence_text || "",
    evidence_quote: coachSelections.evidence_quote || "",
    objective_line: coachSelections.objective_line || "",
  };
}

async function main() {
  console.log(dryRun
    ? "DRY-RUN: no writes will be applied. Re-run with --yes to apply."
    : "APPLY MODE: writes will be committed to Typesense.");

  const checkpoint = loadCheckpoint();
  if (checkpoint) {
    console.log(`Resuming from checkpoint: last student ${checkpoint.lastStudentId}`);
  }

  let client;
  if (!dryRun) {
    const host = process.env.TYPESENSE_HOST;
    const apiKey = process.env.TYPESENSE_API_KEY;
    if (!host || !apiKey) {
      console.error("Set TYPESENSE_HOST and TYPESENSE_API_KEY env vars for apply mode.");
      process.exit(1);
    }
    client = new Typesense.Client({
      nodes: [{ host, port: 443, protocol: "https" }],
      apiKey,
    });
  }

  const studentsSnap = await db.collection("students").orderBy("__name__").get();
  console.log(`Students found: ${studentsSnap.size}`);

  let totalIndexed = 0;
  let totalSkipped = 0;
  let totalStudents = 0;
  let pastCheckpoint = !checkpoint;

  for (const studentDoc of studentsSnap.docs) {
    const studentId = studentDoc.id;

    // Resume support: skip students before the checkpoint
    if (!pastCheckpoint) {
      if (studentId === checkpoint.lastStudentId) {
        pastCheckpoint = true;
      }
      continue;
    }

    const obsSnap = await db
      .collection("students")
      .doc(studentId)
      .collection("observations")
      .get();

    let batch = [];
    let studentIndexed = 0;

    for (const obsDoc of obsSnap.docs) {
      const data = obsDoc.data();
      const type = data?.type || "";

      // Skip assessment and medical observations
      if (SKIPPED_TYPES.has(type)) {
        totalSkipped++;
        continue;
      }

      const tsDoc = buildTypesenseDoc(data, studentId, obsDoc.id);

      if (dryRun) {
        studentIndexed++;
        totalIndexed++;
        continue;
      }

      batch.push(tsDoc);

      if (batch.length >= BATCH_SIZE) {
        await client.collections(COLLECTION).documents().import(batch, { action: "upsert" });
        totalIndexed += batch.length;
        studentIndexed += batch.length;
        batch = [];
      }
    }

    // Flush remaining batch
    if (!dryRun && batch.length > 0) {
      await client.collections(COLLECTION).documents().import(batch, { action: "upsert" });
      totalIndexed += batch.length;
      studentIndexed += batch.length;
    }

    totalStudents++;
    if (studentIndexed > 0) {
      console.log(`  ${studentId}: ${studentIndexed} observations indexed`);
    }

    // Save checkpoint after each student
    if (!dryRun) {
      saveCheckpoint({ lastStudentId: studentId, totalIndexed, timestamp: new Date().toISOString() });
    }
  }

  console.log(`\nDone. Students: ${totalStudents}, Indexed: ${totalIndexed}, Skipped: ${totalSkipped}`);
  if (dryRun) {
    console.log("(dry-run - no writes applied)");
  } else {
    // Clean up checkpoint on successful completion
    if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
