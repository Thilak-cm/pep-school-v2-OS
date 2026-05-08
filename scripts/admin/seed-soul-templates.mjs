/**
 * Seed soul guidelines to Firestore config collection.
 *
 * Reads markdown files from scripts/admin/soul-templates/ and writes them
 * to config/soul_guidelines_{program} documents in Firestore.
 *
 * Usage:
 *   node scripts/admin/seed-soul-templates.mjs              # dry run
 *   node scripts/admin/seed-soul-templates.mjs --apply      # write to Firestore
 *   node scripts/admin/seed-soul-templates.mjs --verify     # check existing docs
 */
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const verify = args.includes("--verify");

async function run() {
  if (verify) {
    console.log("Verifying existing soul template docs in Firestore...\n");
    for (const program of PROGRAMS) {
      const docId = `soul_guidelines_${program}`;
      const snap = await db.collection("config").doc(docId).get();
      if (!snap.exists) {
        console.log(`  ${docId}: MISSING`);
        continue;
      }
      const data = snap.data();
      const lines = (data.markdown || "").split("\n").length;
      console.log(`  ${docId}: ${lines} lines, benchmarkCount=${data.benchmarkCount || "?"}, updated=${data.updatedAt?.toDate?.()?.toISOString() || "?"}`);
    }
    return;
  }

  console.log(`${apply ? "WRITING" : "DRY RUN"}: Seeding soul templates to Firestore\n`);

  for (const program of PROGRAMS) {
    const filename = `soul_guidelines_${program}.md`;
    const filepath = resolve(__dirname, "soul-templates", filename);

    let markdown;
    try {
      markdown = readFileSync(filepath, "utf-8");
    } catch (err) {
      console.error(`  ERROR: Could not read ${filepath}: ${err.message}`);
      continue;
    }

    const lines = markdown.split("\n").length;
    const benchmarkCount = (markdown.match(/^- /gm) || []).length;
    console.log(`  ${filename}: ${lines} lines, ${benchmarkCount} benchmarks`);

    if (apply) {
      const docId = `soul_guidelines_${program}`;
      await db.collection("config").doc(docId).set({
        markdown,
        programId: program,
        benchmarkCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: "admin-script:seed-soul-templates",
      });
      console.log(`    -> Written to config/${docId}`);
    }
  }

  // Clean up old soul_template_* docs (renamed to soul_guidelines_*)
  if (apply) {
    console.log("\nCleaning up old soul_template_* docs...");
    for (const program of PROGRAMS) {
      const oldDocId = `soul_template_${program}`;
      const oldSnap = await db.collection("config").doc(oldDocId).get();
      if (oldSnap.exists) {
        await db.collection("config").doc(oldDocId).delete();
        console.log(`  Deleted config/${oldDocId}`);
      }
    }
  }

  if (!apply) {
    console.log("\nDry run complete. Add --apply to write to Firestore.");
  } else {
    console.log("\nAll guidelines seeded successfully.");
  }
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
