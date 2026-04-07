/**
 * Seed config/profile_dimensions_{program} docs in Firestore.
 *
 * Usage: node scripts/admin/seed-profile-dimensions.mjs
 *
 * Safe to re-run — overwrites existing docs with latest dimension definitions.
 */
import admin from "firebase-admin";
import { PROGRAM_DIMENSIONS, VALID_PROGRAMS } from "../../functions/config/profileConstants.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

async function seed() {
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const program of VALID_PROGRAMS) {
    const docId = `profile_dimensions_${program}`;
    const ref = db.collection("config").doc(docId);
    batch.set(ref, {
      programId: program,
      dimensions: PROGRAM_DIMENSIONS[program],
      createdAt: now,
      updatedAt: now,
    });
    console.log(`  Seeding config/${docId} (${PROGRAM_DIMENSIONS[program].length} dimensions)`);
  }

  await batch.commit();
  console.log("\nDone — seeded profile dimension configs for all programs.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
