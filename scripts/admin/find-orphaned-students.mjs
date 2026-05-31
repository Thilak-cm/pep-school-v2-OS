/**
 * find-orphaned-students.mjs
 *
 * Finds students whose profile doc (students/{id}) has been deleted but who
 * still have orphaned subcollection documents (observations, media, placements,
 * ai_summaries, chats, interviews).
 *
 * Usage:  node scripts/admin/find-orphaned-students.mjs
 */

import admin from "firebase-admin";
import path from "path";
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

// ---------------------------------------------------------------------------
// Step 1: Collect all student IDs that have a profile doc
// ---------------------------------------------------------------------------
async function getAllActiveStudentIds() {
  const snap = await db.collection("students").select().get();
  const ids = new Set();
  snap.forEach((doc) => ids.add(doc.id));
  return ids;
}

// ---------------------------------------------------------------------------
// Step 2: For each subcollection type, find unique studentIds via
//         collectionGroup queries
// ---------------------------------------------------------------------------
async function getStudentIdsFromCollectionGroup(collectionName) {
  const ids = new Set();
  let query = db.collectionGroup(collectionName).select().limit(500);
  let hasMore = true;

  while (hasMore) {
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      // Path: students/{studentId}/{collectionName}/{docId}
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
// Step 3: For each orphaned student, count docs per subcollection and grab
//         a sample observation to help identify the student
// ---------------------------------------------------------------------------
async function getOrphanDetails(studentId) {
  const subcollections = [
    "observations",
    "media",
    "placements",
    "ai_summaries",
    "chats",
    "interviews",
  ];

  const counts = {};
  for (const sub of subcollections) {
    const snap = await db
      .collection(`students/${studentId}/${sub}`)
      .select()
      .get();
    if (snap.size > 0) counts[sub] = snap.size;
  }

  // Grab latest observation to extract student name from text or metadata
  let sampleObs = null;
  const obsSnap = await db
    .collection(`students/${studentId}/observations`)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (!obsSnap.empty) {
    const d = obsSnap.docs[0].data();
    sampleObs = {
      text: (d.text || "").slice(0, 200),
      classroomId: d.classroomId || null,
      createdByName: d.createdByName || null,
      createdAt: d.createdAt?.toDate?.()?.toISOString?.() || null,
      type: d.type || null,
      // Lesson notes sometimes have the student name in studentComment
      studentComment: (d.studentComment || "").slice(0, 200) || undefined,
    };
  }

  return { studentId, counts, sampleObs };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Fetching all student profile doc IDs...");
  const existingIds = await getAllActiveStudentIds();
  console.log(`  Found ${existingIds.size} student profile docs.\n`);

  const subcollections = [
    "observations",
    "media",
    "placements",
    "ai_summaries",
    "chats",
    "interviews",
  ];

  const referencedIds = new Set();
  for (const sub of subcollections) {
    console.log(`Scanning collectionGroup: ${sub}...`);
    const ids = await getStudentIdsFromCollectionGroup(sub);
    console.log(`  Found ${ids.size} unique student IDs in ${sub}`);
    ids.forEach((id) => referencedIds.add(id));
  }

  // Orphans = referenced in subcollections but no profile doc
  const orphanIds = [...referencedIds].filter((id) => !existingIds.has(id));
  console.log(
    `\n==============================`
  );
  console.log(
    `ORPHANED STUDENTS: ${orphanIds.length} (subcollection data exists, profile doc missing)`
  );
  console.log(`==============================\n`);

  if (orphanIds.length === 0) {
    console.log("No orphaned students found.");
    process.exit(0);
  }

  // Gather details for each orphan
  const results = [];
  for (const id of orphanIds.sort()) {
    process.stdout.write(`  Inspecting ${id}...`);
    const details = await getOrphanDetails(id);
    results.push(details);
    console.log(
      ` ${Object.entries(details.counts).map(([k, v]) => `${k}:${v}`).join(", ")}`
    );
  }

  // Print summary table
  console.log(`\n${"=".repeat(100)}`);
  console.log("DETAILED RESULTS");
  console.log(`${"=".repeat(100)}\n`);

  for (const r of results) {
    console.log(`Student ID: ${r.studentId}`);
    console.log(`  Subcollection counts: ${JSON.stringify(r.counts)}`);
    if (r.sampleObs) {
      console.log(`  Classroom: ${r.sampleObs.classroomId}`);
      console.log(`  Last observation by: ${r.sampleObs.createdByName}`);
      console.log(`  Last observation at: ${r.sampleObs.createdAt}`);
      console.log(`  Type: ${r.sampleObs.type}`);
      console.log(`  Text preview: "${r.sampleObs.text}"`);
      if (r.sampleObs.studentComment) {
        console.log(`  Student comment: "${r.sampleObs.studentComment}"`);
      }
    }
    console.log();
  }

  // Output as JSON for scripting
  const outputPath = path.resolve(__dirname, "orphaned-students-report.json");
  const { writeFileSync } = await import("fs");
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nJSON report saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
