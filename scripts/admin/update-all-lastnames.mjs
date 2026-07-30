/**
 * Update ALL orphan docs with full names confirmed from Google Drive report folders.
 * Usage: node scripts/admin/update-all-lastnames.mjs
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

// All confirmed from Drive folder names + Accel spreadsheet
const UPDATES = [
  // === BATCH 1 (Accel - Whitefield) ===
  // 2025-AC-COS-003 already updated to "Sashvatha A Vishnu"
  // 2025-AC-COS-012: Drive folder says just "Shaurya" — no last name
  // 2025-AC-ELE-003 already updated to "Nilan P S"
  // 2025-AC-ELE-015 already updated to "Srushti Parui"
  // 2025-AC-ELE-016 already updated to "Vaishnavi Venkatesh"
  // 2025-AC-PER-002 already updated to "Viyaansh R"
  // 2025-AC-PER-013: Drive spreadsheet says just "Saharsh" — no last name
  // 2025-AC-PER-021 already updated to "Janvi Krishna Naidu"
  // 2025-AC-PER-030 already updated to "Venkata Sai Tagorenath"
  // 2025-AC-PER-032 already updated to "Vrihaan Singh"

  // Accel Periwinkle — two Vivaans disambiguated:
  // Drive: "Vivaan Jain" and "Vivaan Kuppireddy" are both in ACCEL Periwinkle folder
  // AC-PER-016 classroom=accel_cosmos (transferred), AC-PER-029 classroom=accel_periwinkle
  // Vivaan Kuppireddy folder is in ACCEL Periwinkle. Going with Kuppireddy for PER-029, Jain for PER-016.
  { id: "2025-AC-PER-016", firstName: "Vivaan", lastName: "Jain", displayName: "Vivaan Jain" },
  { id: "2025-AC-PER-029", firstName: "Vivaan", lastName: "Kuppireddy", displayName: "Vivaan Kuppireddy" },

  // === BATCH 2 (Mixed Accel + HSR) ===
  // 2025-ACC-001: "Skand" — not found in Drive, keep as-is

  // HSR Allstars (from Drive folder names):
  { id: "2025-ADO-013", firstName: "Kanav", lastName: "Bhalotia", displayName: "Kanav Bhalotia" },
  { id: "2025-ADO-030", firstName: "Milan", lastName: "Waseem", displayName: "Milan Waseem" },
  // 2025-ADO-031: "Yashmit" — not found in Allstars Drive folder
  { id: "2025-ADO-032", firstName: "Tulip", lastName: "Parui", displayName: "Tulip Parui" },
  { id: "2025-ADO-033", firstName: "Shubhi", lastName: "Gogoi", displayName: "Shubhi Gogoi" },

  // HSR Gulmohar (from Drive folder names):
  { id: "2025-GUL-003", firstName: "Akshleena", lastName: "Mishra", displayName: "Akshleena Mishra" },
  { id: "2025-GUL-006", firstName: "Arya", lastName: "Lamba", displayName: "Arya Lamba" },
  { id: "2025-GUL-007", firstName: "Aveer", lastName: "Singh Thethi", displayName: "Aveer Singh Thethi" },
  // 2025-GUL-013: "Harnika" — not found in Gulmohar Term 2 folder (likely Term 1)
  { id: "2025-GUL-017", firstName: "Kartik", lastName: "Maheshwari", displayName: "Kartik Maheshwari" },
  // 2025-GUL-022: "Panktee" — not found in Gulmohar Term 2 folder (likely Term 1)
  { id: "2025-GUL-032", firstName: "Tanveer", lastName: "Singh", displayName: "Tanveer Singh" },
  { id: "2025-GUL-033", firstName: "Trishika", lastName: "Jaiswal", displayName: "Trishika Jaiswal" },

  // === BATCH 3 (HSR Parijat) ===
  { id: "2025-PAR-002", firstName: "Ahaan", lastName: "Bhopalkar", displayName: "Ahaan Bhopalkar" },
  { id: "2025-PAR-009", firstName: "Evana", lastName: "Vivian", displayName: "Evana Vivian" },
  { id: "2025-PAR-011", firstName: "Kimaya", lastName: "Rohatgi", displayName: "Kimaya Rohatgi" },
  { id: "2025-PAR-031", firstName: "Vismay", lastName: "Hosamani", displayName: "Vismay Hosamani" },

  // === BATCH 4 (HSR Periwinkle + Plumeria) ===
  // 2025-PER-001: already has lastName "Gupta" — confirmed by Drive folder "Aarav Gupta"
  { id: "2025-PER-007", firstName: "Avyaan", lastName: "Sood", displayName: "Avyaan Sood" },
  { id: "2025-PER-016", firstName: "Reeyansh", lastName: "Reddy", displayName: "Reeyansh Reddy" },
  // 2025-PER-004: "Arundhati" — not found in Periwinkle Drive folder
  // 2025-PER-023: "Sia" — not found in Periwinkle Drive folder
  // 2025-PER-024: "Swasti" — not found in Periwinkle Drive folder
  // 2025-PLU-001: "Aavishi" — not found in Plumeria Drive folder
  // 2025-PLU-006: "Arsh" — not found in Plumeria Drive folder
  { id: "2025-PLU-007", firstName: "Atharv", lastName: "Choubey", displayName: "Atharv Choubey" },
  // 2025-PLU-016: "Ivaan" — not found in Plumeria Drive folder
];

async function main() {
  console.log("=== Updating ALL orphan docs with Drive-confirmed last names ===\n");

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
