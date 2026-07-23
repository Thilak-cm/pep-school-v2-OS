// #203: Verify soul + open_questions coverage for all active students.
// Reports which students are missing docs or have stale docs.
//
// Usage: node scripts/admin/verify-soul-coverage.mjs

process.env.GCLOUD_PROJECT = "pep-os";
process.env.GCP_PROJECT = "pep-os";

import { db } from "../../functions/shared/firebase.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getCurrentMonthIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}`;
}

function toMonthIST(firestoreTimestamp) {
  if (!firestoreTimestamp) return null;
  const ts = firestoreTimestamp.toDate ? firestoreTimestamp.toDate() : new Date(firestoreTimestamp);
  const ist = new Date(ts.getTime() + IST_OFFSET_MS);
  return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  const currentMonth = getCurrentMonthIST();
  console.log(`Checking soul + open_questions coverage for ${currentMonth}\n`);

  // Fetch all active students
  const studentsSnap = await db.collection("students").where("status", "==", "active").get();
  const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Active students: ${students.length}\n`);

  // Check each student in parallel (batched to avoid overwhelming Firestore)
  const BATCH_SIZE = 50;
  const results = { hasSoul: 0, hasOQ: 0, currentSoul: 0, missingSoul: [], missingOQ: [], staleSoul: [] };

  for (let i = 0; i < students.length; i += BATCH_SIZE) {
    const batch = students.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (student) => {
      const aiRef = db.collection("students").doc(student.id).collection("ai_summaries");
      const [soulSnap, oqSnap] = await Promise.all([
        aiRef.doc("soul").get(),
        aiRef.doc("open_questions").get(),
      ]);

      if (!soulSnap.exists) {
        results.missingSoul.push(student.id);
      } else {
        results.hasSoul++;
        const soulMonth = toMonthIST(soulSnap.data().updatedAt);
        if (soulMonth === currentMonth) {
          results.currentSoul++;
        } else {
          results.staleSoul.push({ id: student.id, month: soulMonth });
        }
      }

      if (!oqSnap.exists) {
        results.missingOQ.push(student.id);
      } else {
        results.hasOQ++;
      }
    }));
    process.stdout.write(`  checked ${Math.min(i + BATCH_SIZE, students.length)}/${students.length}\r`);
  }

  console.log("\n");
  console.log("=== Summary ===");
  console.log(`Total active students:     ${students.length}`);
  console.log(`Has soul doc:              ${results.hasSoul} (${results.missingSoul.length} missing)`);
  console.log(`Soul updated this month:   ${results.currentSoul} (${results.staleSoul.length} stale)`);
  console.log(`Has open_questions doc:    ${results.hasOQ} (${results.missingOQ.length} missing)`);

  if (results.missingSoul.length) {
    console.log(`\n--- Missing soul (${results.missingSoul.length}) ---`);
    results.missingSoul.forEach((id) => console.log(`  ${id}`));
  }
  if (results.missingOQ.length) {
    console.log(`\n--- Missing open_questions (${results.missingOQ.length}) ---`);
    results.missingOQ.forEach((id) => console.log(`  ${id}`));
  }
  if (results.staleSoul.length) {
    console.log(`\n--- Stale soul (not updated in ${currentMonth}) (${results.staleSoul.length}) ---`);
    results.staleSoul.forEach(({ id, month }) => console.log(`  ${id} (last: ${month || "unknown"})`));
  }

  if (!results.missingSoul.length && !results.missingOQ.length && !results.staleSoul.length) {
    console.log("\n✓ All active students have current soul + open_questions docs!");
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
