/**
 * Migrate report config doc IDs (PEP-325):
 *
 * 1. Copy  config/report_{program}          → config/term_report_{program}
 * 2. Delete config/report_monthly_{program}  (seeded earlier, now renamed)
 * 3. Copy  seed prompt content               → config/baseline_report_{program}
 *
 * Old config/report_{program} docs are kept as tombstones until the deployed
 * CF reads the new names. Delete them manually once the new CF is live.
 *
 * Usage:
 *   node scripts/admin/migrate-report-config-doc-ids.mjs          # dry run
 *   node scripts/admin/migrate-report-config-doc-ids.mjs --apply  # apply changes
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();
const dryRun = !process.argv.includes("--apply");

if (dryRun) {
  console.log("=== DRY RUN (pass --apply to execute) ===\n");
}

const PROGRAMS = ["adolescent", "elementary", "primary", "toddler"];

// Step 1: Copy report_{program} → term_report_{program}
console.log("--- Step 1: Copy term report configs ---");
for (const program of PROGRAMS) {
  const oldId = `report_${program}`;
  const newId = `term_report_${program}`;

  const oldSnap = await db.collection("config").doc(oldId).get();
  if (!oldSnap.exists) {
    console.log(`  SKIP ${oldId} — does not exist`);
    continue;
  }

  const newSnap = await db.collection("config").doc(newId).get();
  if (newSnap.exists) {
    console.log(`  SKIP ${newId} — already exists`);
    continue;
  }

  if (dryRun) {
    console.log(`  WOULD copy ${oldId} → ${newId}`);
  } else {
    await db.collection("config").doc(newId).set(oldSnap.data());
    console.log(`  COPIED ${oldId} → ${newId}`);
  }
}

// Step 2: Delete report_monthly_{program} (old seeded docs)
console.log("\n--- Step 2: Delete old monthly config docs ---");
for (const program of PROGRAMS) {
  const oldMonthlyId = `report_monthly_${program}`;

  const snap = await db.collection("config").doc(oldMonthlyId).get();
  if (!snap.exists) {
    console.log(`  SKIP ${oldMonthlyId} — does not exist`);
    continue;
  }

  if (dryRun) {
    console.log(`  WOULD delete ${oldMonthlyId}`);
  } else {
    await db.collection("config").doc(oldMonthlyId).delete();
    console.log(`  DELETED ${oldMonthlyId}`);
  }
}

// Step 3: Create baseline_report_{program} from seed-monthly-report-prompts content
// Import the seed prompts inline to keep this script self-contained
console.log("\n--- Step 3: Create baseline report configs ---");
for (const program of PROGRAMS) {
  const newId = `baseline_report_${program}`;

  const existingSnap = await db.collection("config").doc(newId).get();
  if (existingSnap.exists) {
    console.log(`  SKIP ${newId} — already exists`);
    continue;
  }

  // Try to read from the old monthly doc that may still exist (in dry run)
  // or from the seed script's content
  const oldMonthlyId = `report_monthly_${program}`;
  const oldMonthlySnap = await db.collection("config").doc(oldMonthlyId).get();

  if (oldMonthlySnap.exists) {
    // Copy from old monthly doc
    if (dryRun) {
      console.log(`  WOULD copy ${oldMonthlyId} → ${newId}`);
    } else {
      await db.collection("config").doc(newId).set(oldMonthlySnap.data());
      console.log(`  COPIED ${oldMonthlyId} → ${newId}`);
    }
  } else {
    console.log(`  MANUAL NEEDED: ${newId} — no source doc found. Run seed-monthly-report-prompts.mjs first (update doc IDs to baseline_report_*)`);
  }
}

console.log("\n--- Summary ---");
if (dryRun) {
  console.log("Dry run complete. Run with --apply to execute.");
} else {
  console.log("Migration complete.");
  console.log("NOTE: Old config/report_{program} docs kept as tombstones.");
  console.log("Delete them manually once the new CF is deployed and verified:");
  for (const program of PROGRAMS) {
    console.log(`  firebase firestore:delete config/report_${program}`);
  }
}

process.exit(0);
