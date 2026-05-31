/**
 * recover-orphaned-students.mjs
 *
 * Interactive script to re-create student profile docs for orphaned students
 * (students with subcollection data but no parent profile doc).
 *
 * For each orphan, the script extracts what it can from observations
 * (classroomId, branchId, potential name from text) and asks the operator
 * to confirm or correct before writing.
 *
 * Usage:
 *   node scripts/admin/recover-orphaned-students.mjs              # interactive
 *   node scripts/admin/recover-orphaned-students.mjs --dry-run     # show what would be created
 */

import admin from "firebase-admin";
import path from "path";
import readline from "readline";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const serviceAccount = require(
  path.resolve(__dirname, "../../firebase-service-account.json")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pep-os.firebaseio.com",
});

const db = admin.firestore();
const dryRun = process.argv.includes("--dry-run");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ---------------------------------------------------------------------------
// Orphan detection (same as find-orphaned-students.mjs)
// ---------------------------------------------------------------------------
async function getAllExistingStudentIds() {
  const snap = await db.collection("students").select().get();
  const ids = new Set();
  snap.forEach((doc) => ids.add(doc.id));
  return ids;
}

async function getStudentIdsFromCollectionGroup(collectionName) {
  const ids = new Set();
  let query = db.collectionGroup(collectionName).select().limit(500);
  let hasMore = true;
  while (hasMore) {
    const snap = await query.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const segments = doc.ref.path.split("/");
      if (segments[0] === "students" && segments.length >= 4) {
        ids.add(segments[1]);
      }
    }
    if (snap.docs.length < 500) {
      hasMore = false;
    } else {
      query = db
        .collectionGroup(collectionName)
        .select()
        .startAfter(snap.docs[snap.docs.length - 1])
        .limit(500);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Extract metadata from observations for an orphan
// ---------------------------------------------------------------------------
async function extractOrphanMetadata(studentId) {
  const subcollections = ["observations", "media", "placements", "ai_summaries", "chats", "interviews"];
  const counts = {};
  for (const sub of subcollections) {
    const snap = await db.collection(`students/${studentId}/${sub}`).select().get();
    if (snap.size > 0) counts[sub] = snap.size;
  }

  // Extract classroomId and branchId from observations
  let classroomId = null;
  let branchId = null;
  const nameCandiates = new Set();

  const obsSnap = await db
    .collection(`students/${studentId}/observations`)
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  for (const doc of obsSnap.docs) {
    const d = doc.data();
    if (!classroomId && d.classroomId) classroomId = d.classroomId;
    if (!branchId && d.branchId) branchId = d.branchId;

    // Try to extract student name from observation text and studentComment
    for (const field of ["text", "studentComment"]) {
      const text = d[field];
      if (!text || text.length < 3) continue;
      // Look for a capitalized name at the start of the text
      const match = text.match(/^([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)/);
      if (match) nameCandiates.add(match[1]);
    }
  }

  // If no observations, try placements for classroomId
  if (!classroomId) {
    const placSnap = await db
      .collection(`students/${studentId}/placements`)
      .limit(1)
      .get();
    if (!placSnap.empty) {
      const p = placSnap.docs[0].data();
      if (p.classroomId) classroomId = p.classroomId;
    }
  }

  // Grab sample observation texts for display
  const sampleTexts = [];
  for (const doc of obsSnap.docs.slice(0, 3)) {
    const d = doc.data();
    const text = d.studentComment || d.text || "";
    if (text.trim()) sampleTexts.push(text.slice(0, 150));
  }

  return { studentId, counts, classroomId, branchId, nameCandiates: [...nameCandiates], sampleTexts };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (dryRun) {
    console.log("DRY RUN — no docs will be created\n");
  }

  console.log("Detecting orphaned students...\n");
  const existingIds = await getAllExistingStudentIds();
  console.log(`  ${existingIds.size} student profile docs exist.`);

  const subcollections = ["observations", "media", "placements", "ai_summaries", "chats", "interviews"];
  const referencedIds = new Set();
  for (const sub of subcollections) {
    process.stdout.write(`  Scanning ${sub}...`);
    const ids = await getStudentIdsFromCollectionGroup(sub);
    console.log(` ${ids.size} student IDs`);
    ids.forEach((id) => referencedIds.add(id));
  }

  const orphanIds = [...referencedIds].filter((id) => !existingIds.has(id)).sort();
  console.log(`\n  Found ${orphanIds.length} orphaned students.\n`);

  if (orphanIds.length === 0) {
    console.log("Nothing to recover.");
    rl.close();
    return;
  }

  const recovered = [];
  const skipped = [];

  for (let i = 0; i < orphanIds.length; i++) {
    const studentId = orphanIds[i];
    console.log(`${"─".repeat(70)}`);
    console.log(`[${i + 1}/${orphanIds.length}] ${studentId}\n`);

    const meta = await extractOrphanMetadata(studentId);

    // Show what we know
    console.log(`  Subcollections: ${JSON.stringify(meta.counts)}`);
    console.log(`  Classroom: ${meta.classroomId || "UNKNOWN"}`);
    console.log(`  Branch: ${meta.branchId || "UNKNOWN"}`);
    if (meta.nameCandiates.length > 0) {
      console.log(`  Possible names: ${meta.nameCandiates.join(", ")}`);
    } else {
      console.log(`  Possible names: NONE FOUND`);
    }
    if (meta.sampleTexts.length > 0) {
      console.log(`  Sample observations:`);
      meta.sampleTexts.forEach((t, idx) => console.log(`    ${idx + 1}. "${t}"`));
    }
    console.log();

    // No observations at all — flag for operator
    if (!meta.counts.observations && !meta.counts.media) {
      console.log(`  ⚠ No observations or media — only ${Object.keys(meta.counts).join(", ")}`);
      const action = await ask("  Skip this orphan? (y/n): ");
      if (action.trim().toLowerCase() !== "n") {
        skipped.push({ studentId, reason: "no observations" });
        continue;
      }
    }

    // Ask for student name
    const suggestedName = meta.nameCandiates[0] || "";
    const namePrompt = suggestedName
      ? `  Enter student name [${suggestedName}]: `
      : `  Enter student name (required): `;

    let name = (await ask(namePrompt)).trim();
    if (!name && suggestedName) name = suggestedName;
    if (!name) {
      console.log("  Skipping — no name provided.");
      skipped.push({ studentId, reason: "no name provided" });
      continue;
    }

    // Parse first/last name
    const parts = name.split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ");

    // Confirm classroomId
    let finalClassroom = meta.classroomId;
    if (!finalClassroom) {
      finalClassroom = (await ask("  Enter classroomId (required): ")).trim();
      if (!finalClassroom) {
        console.log("  Skipping — no classroomId.");
        skipped.push({ studentId, reason: "no classroomId" });
        continue;
      }
    }

    // Confirm branchId
    let finalBranch = meta.branchId;
    if (!finalBranch) {
      finalBranch = (await ask("  Enter branchId (required): ")).trim();
      if (!finalBranch) {
        console.log("  Skipping — no branchId.");
        skipped.push({ studentId, reason: "no branchId" });
        continue;
      }
    }

    const profileData = {
      studentID: studentId,
      firstName,
      lastName,
      displayName: name,
      classroomId: finalClassroom,
      branchId: finalBranch,
      status: "inactive",
      inactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
      recoveredFromOrphan: true,
      createdBy: "admin-recovery",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    console.log(`\n  Will create: students/${studentId}`);
    console.log(`    displayName: "${name}"`);
    console.log(`    classroomId: "${finalClassroom}"`);
    console.log(`    branchId: "${finalBranch}"`);
    console.log(`    status: "inactive"`);

    if (dryRun) {
      console.log("  [DRY RUN] Skipped write.\n");
      recovered.push({ studentId, name, classroomId: finalClassroom, dryRun: true });
      continue;
    }

    const confirm = await ask("  Confirm write? (y/n): ");
    if (confirm.trim().toLowerCase() !== "y") {
      console.log("  Skipped.\n");
      skipped.push({ studentId, reason: "operator declined" });
      continue;
    }

    await db.collection("students").doc(studentId).set(profileData);
    console.log(`  ✓ Created.\n`);
    recovered.push({ studentId, name, classroomId: finalClassroom });
  }

  // Summary
  console.log(`\n${"═".repeat(70)}`);
  console.log("RECOVERY SUMMARY");
  console.log(`${"═".repeat(70)}`);
  console.log(`  Recovered: ${recovered.length}`);
  console.log(`  Skipped: ${skipped.length}`);
  if (recovered.length > 0) {
    console.log("\n  Recovered students:");
    recovered.forEach((r) => console.log(`    ${r.studentId} → "${r.name}" (${r.classroomId})${r.dryRun ? " [DRY RUN]" : ""}`));
  }
  if (skipped.length > 0) {
    console.log("\n  Skipped students:");
    skipped.forEach((s) => console.log(`    ${s.studentId} — ${s.reason}`));
  }

  rl.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  rl.close();
  process.exit(1);
});
