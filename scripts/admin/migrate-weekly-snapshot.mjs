/**
 * Migration script: Seed weekly_snapshot docs from existing baseball_card + signals.
 *
 * Reads each active student's `ai_summaries/baseball_card` and `ai_summaries/signals`
 * docs, merges them into a single `ai_summaries/weekly_snapshot` doc.
 *
 * - No history entry created (this is a schema migration, not a weekly regeneration)
 * - Idempotent: safe to re-run (overwrites weekly_snapshot if it already exists)
 * - Adds a `migratedAt` timestamp to mark migration-seeded docs
 *
 * Usage: node scripts/admin/migrate-weekly-snapshot.mjs [--dry-run]
 *
 * PEP-229
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
db.settings({ ignoreUndefinedProperties: true });

const dryRun = process.argv.includes("--dry-run");

/**
 * Merge baseball_card + signals data into a unified weekly_snapshot shape.
 */
export function mergeToWeeklySnapshot(cardData, signalsData, migratedAt) {
  const merged = {};

  // Baseball card fields
  if (cardData) {
    merged.summary = cardData.summary ?? "";
    merged.bullets = cardData.bullets ?? [];
    merged.rawContent = cardData.rawContent ?? null;
    merged.sourceNoteIds = cardData.sourceNoteIds ?? [];
    merged.status = cardData.status ?? "ok";
    merged.windowDays = cardData.windowDays ?? null;
    merged.timezone = cardData.timezone ?? null;
    merged.model = cardData.model ?? null;
    merged.temperature = cardData.temperature ?? null;
    merged.generatedAt = cardData.generatedAt ?? null;
    merged.noteCount = cardData.noteCount ?? 0;
  }

  // Signals fields
  if (signalsData) {
    merged.redFlag = signalsData.redFlag ?? { severity: null, reason: null };
    merged.severity = signalsData.severity ?? "clear";
    merged.severityScore = signalsData.severityScore ?? 0;
    merged.prevSeverity = signalsData.prevSeverity ?? "clear";
    merged.prevSeverityScore = signalsData.prevSeverityScore ?? 0;
    merged.weekKey = signalsData.weekKey ?? null;
    merged.weekBaselineSeverity = signalsData.weekBaselineSeverity ?? "clear";
    merged.weekBaselineSeverityScore = signalsData.weekBaselineSeverityScore ?? 0;
    merged.escalatedThisWeek = signalsData.escalatedThisWeek ?? false;
    merged.improvedThisWeek = signalsData.improvedThisWeek ?? false;
    merged.coverageGaps = signalsData.coverageGaps ?? [];
    merged.evidenceCount = signalsData.evidenceCount ?? 0;
    merged.lastUpdatedAt = signalsData.lastUpdatedAt ?? null;
    if (Number.isFinite(signalsData.noteCount)) {
      merged.noteCount = signalsData.noteCount;
    }
    if (!merged.generatedAt && signalsData.generatedAt) {
      merged.generatedAt = signalsData.generatedAt;
    }
  } else {
    merged.redFlag = { severity: null, reason: null };
    merged.severity = "clear";
    merged.severityScore = 0;
    merged.coverageGaps = [];
    merged.escalatedThisWeek = false;
    merged.improvedThisWeek = false;
    merged.evidenceCount = 0;
  }

  merged.migratedAt = migratedAt;

  return merged;
}

async function main() {
  console.log(`\n🔄 Migrating baseball_card + signals → weekly_snapshot${dryRun ? " (DRY RUN)" : ""}\n`);

  // Fetch all students (active + inactive — migrate everything)
  const studentsSnap = await db.collection("students").get();
  const studentIds = studentsSnap.docs.map((d) => d.id);
  console.log(`Found ${studentIds.length} students\n`);

  const now = admin.firestore.FieldValue.serverTimestamp();
  let migrated = 0;
  let skippedNoData = 0;
  let errors = 0;

  // Process in batches of 500 (Firestore batch limit)
  const BATCH_SIZE = 250; // 1 write per student, well under 500 limit
  for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
    const chunk = studentIds.slice(i, i + BATCH_SIZE);
    const batch = dryRun ? null : db.batch();

    for (const studentId of chunk) {
      try {
        const aiRef = db.collection("students").doc(studentId).collection("ai_summaries");
        const [cardSnap, signalsSnap] = await Promise.all([
          aiRef.doc("baseball_card").get(),
          aiRef.doc("signals").get(),
        ]);

        const cardData = cardSnap.exists ? cardSnap.data() : null;
        const signalsData = signalsSnap.exists ? signalsSnap.data() : null;

        if (!cardData && !signalsData) {
          skippedNoData++;
          continue;
        }

        const merged = mergeToWeeklySnapshot(cardData, signalsData, now);

        if (dryRun) {
          console.log(`  [DRY] ${studentId}: card=${!!cardData} signals=${!!signalsData} → weekly_snapshot`);
          console.log(`         severity=${merged.severity}, noteCount=${merged.noteCount}, weekKey=${merged.weekKey}`);
        } else {
          const snapshotRef = aiRef.doc("weekly_snapshot");
          batch.set(snapshotRef, merged);
        }

        migrated++;
      } catch (err) {
        console.error(`  ❌ ${studentId}: ${err.message}`);
        errors++;
      }
    }

    if (!dryRun && batch) {
      await batch.commit();
      console.log(`  Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} students)`);
    }
  }

  console.log(`\n✅ Done.`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Skipped (no data): ${skippedNoData}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${studentIds.length}`);

  if (dryRun) {
    console.log(`\n   Re-run without --dry-run to apply changes.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
