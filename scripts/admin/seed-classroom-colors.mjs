/**
 * Seed classroom color hex values to Firestore.
 *
 * Each classroom gets a `color` field used by the home page classroom cards.
 *
 * Usage:
 *   node scripts/admin/seed-classroom-colors.mjs              # dry run
 *   node scripts/admin/seed-classroom-colors.mjs --apply      # write to Firestore
 */
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "pep-os",
  });
}

const db = admin.firestore();

const args = process.argv.slice(2);
const apply = args.includes("--apply");

// Color palette — earthy/warm tones that work with light card backgrounds
const CLASSROOM_COLORS = {
  accel_cosmos:      "#5C6BC0", // indigo
  accel_elementary:  "#26A69A", // teal
  accel_periwinkle:  "#AB47BC", // purple
  adonis:           "#42A5F5", // blue
  aedon:            "#66BB6A", // green
  allstars:         "#EF5350", // red
  amazing:          "#FFA726", // orange
  argus:            "#78909C", // blue-grey
  gulmohar:         "#EC407A", // pink
  himalayas:        "#8D6E63", // brown
  nilgiris:         "#26C6DA", // cyan
  parijat:          "#FFCA28", // amber
  periwinkle:       "#7E57C2", // deep purple
  plumeria:         "#FF7043", // deep orange
  power:            "#9CCC65", // light green
  vindhyas:         "#0097A7", // dark cyan
};

async function main() {
  console.log(apply ? "APPLY MODE — writing to Firestore" : "DRY RUN — pass --apply to write");
  console.log("");

  for (const [classroomId, color] of Object.entries(CLASSROOM_COLORS)) {
    const ref = db.collection("classrooms").doc(classroomId);
    const snap = await ref.get();

    if (!snap.exists) {
      console.log(`  SKIP  ${classroomId} — doc not found`);
      continue;
    }

    const existing = snap.data()?.color;
    if (existing) {
      console.log(`  SKIP  ${classroomId} — already has color: ${existing}`);
      continue;
    }

    console.log(`  SET   ${classroomId} → ${color}`);
    if (apply) {
      await ref.update({ color });
    }
  }

  console.log("");
  console.log(apply ? "Done." : "Dry run complete. Pass --apply to write.");
}

main().catch(console.error);
