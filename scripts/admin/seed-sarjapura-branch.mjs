/**
 * Seed the Sarjapura branch with two Primary classrooms: Sirius and Orion.
 *
 * Creates:
 *   1. branches/sarjapura          — branch doc with classrooms array
 *   2. classrooms/sirius           — Primary classroom in Sarjapura
 *   3. classrooms/orion            — Primary classroom in Sarjapura
 *   4. Updates programs/primary    — adds classrooms/sirius + classrooms/orion
 *
 * Usage:
 *   node scripts/admin/seed-sarjapura-branch.mjs          # dry run
 *   node scripts/admin/seed-sarjapura-branch.mjs --apply  # write to Firestore
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

const args = process.argv.slice(2);
const apply = args.includes("--apply");

const now = FieldValue.serverTimestamp();

// --- Data ---

const BRANCH = {
  id: "sarjapura",
  name: "Sarjapura",
  status: "active",
  classrooms: ["sirius", "orion"],
  createdAt: now,
  updatedAt: now,
};

const CLASSROOMS = [
  {
    id: "sirius",
    name: "Sirius",
    programId: "primary",
    branchId: "sarjapura",
    status: "active",
    studentCount: 0,
    teacherCount: 0,
    teacherIds: [],
    driveFolderId: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "orion",
    name: "Orion",
    programId: "primary",
    branchId: "sarjapura",
    status: "active",
    studentCount: 0,
    teacherCount: 0,
    teacherIds: [],
    driveFolderId: null,
    createdAt: now,
    updatedAt: now,
  },
];

// --- Execute ---

async function run() {
  console.log(apply ? "APPLY MODE — writing to Firestore\n" : "DRY RUN — pass --apply to write\n");

  // 1. Branch doc
  const branchRef = db.collection("branches").doc(BRANCH.id);
  const branchSnap = await branchRef.get();
  if (branchSnap.exists) {
    console.log(`  SKIP  branches/${BRANCH.id} — already exists`);
  } else {
    const { id, ...data } = BRANCH;
    console.log(`  CREATE  branches/${BRANCH.id}`, JSON.stringify({ ...data, createdAt: "<server>", updatedAt: "<server>" }, null, 2));
    if (apply) await branchRef.set(data);
  }

  // 2. Classroom docs
  for (const cls of CLASSROOMS) {
    const ref = db.collection("classrooms").doc(cls.id);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`  SKIP  classrooms/${cls.id} — already exists`);
    } else {
      const { id, ...data } = cls;
      console.log(`  CREATE  classrooms/${cls.id}  (program: ${cls.programId}, branch: ${cls.branchId})`);
      if (apply) await ref.set(data);
    }
  }

  // 3. Update programs/primary — append new classroom refs
  const primaryRef = db.collection("programs").doc("primary");
  const primarySnap = await primaryRef.get();
  const existing = primarySnap.data()?.classrooms || [];
  const toAdd = CLASSROOMS
    .map((c) => `classrooms/${c.id}`)
    .filter((path) => !existing.includes(path));

  if (toAdd.length === 0) {
    console.log("  SKIP  programs/primary — classrooms already present");
  } else {
    console.log(`  UPDATE  programs/primary — adding ${toAdd.join(", ")}`);
    if (apply) {
      await primaryRef.update({
        classrooms: FieldValue.arrayUnion(...toAdd),
        updatedAt: now,
      });
    }
  }

  console.log("\nDone.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
