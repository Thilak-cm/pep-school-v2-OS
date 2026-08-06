/**
 * Update Accel orphan docs with last names from the official student list.
 * Usage: node scripts/admin/update-accel-lastnames.mjs
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

// Confirmed from "ACCEL PEP- Student list- AY 25-26" spreadsheet
const UPDATES = [
  { id: "2025-AC-COS-003", firstName: "Sashvatha", lastName: "A Vishnu", displayName: "Sashvatha A Vishnu" },
  { id: "2025-AC-ELE-003", firstName: "Nilan", lastName: "P S", displayName: "Nilan P S" },
  { id: "2025-AC-ELE-015", firstName: "Srushti", lastName: "Parui", displayName: "Srushti Parui" },
  { id: "2025-AC-ELE-016", firstName: "Vaishnavi", lastName: "Venkatesh", displayName: "Vaishnavi Venkatesh" },
  { id: "2025-AC-PER-002", firstName: "Viyaansh", lastName: "R", displayName: "Viyaansh R" },
  { id: "2025-AC-PER-021", firstName: "Janvi", lastName: "Krishna Naidu", displayName: "Janvi Krishna Naidu" },
  { id: "2025-AC-PER-030", firstName: "Venkata Sai Tagorenath", lastName: "", displayName: "Venkata Sai Tagorenath" },
  { id: "2025-AC-PER-032", firstName: "Vrihaan", lastName: "Singh", displayName: "Vrihaan Singh" },
];

async function main() {
  console.log("=== Updating Accel orphan docs with last names ===\n");

  for (const update of UPDATES) {
    const docRef = db.collection("students").doc(update.id);
    const existing = await docRef.get();
    if (!existing.exists) {
      console.log(`SKIP ${update.id} — doc doesn't exist`);
      continue;
    }

    await docRef.update({
      firstName: update.firstName,
      lastName: update.lastName,
      displayName: update.displayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`UPDATED ${update.id} → ${update.displayName}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
