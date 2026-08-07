#!/usr/bin/env node
/**
 * One-time bulk sync: grant Drive folder permissions to all eligible users.
 * Run: node scripts/admin/bulk-sync-drive-permissions.mjs [--dry-run]
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// googleapis lives in functions/node_modules
const { google } = await import("../../functions/node_modules/googleapis/build/src/index.js");
import {
  buildBulkSyncPlan,
  grantDrivePermission,
} from "../../functions/utils/drivePermissions.js";

const DRY_RUN = process.argv.includes("--dry-run");

initializeApp({ credential: applicationDefault(), projectId: "pep-os" });
const db = getFirestore();

async function main() {
  console.log(`Bulk sync Drive permissions ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"}\n`);

  // Auth Drive client
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const drive = google.drive({ version: "v3", auth });

  // Load data
  const [classroomsSnap, usersSnap] = await Promise.all([
    db.collection("classrooms").get(),
    db.collection("users").get(),
  ]);

  const classrooms = classroomsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log(`Loaded ${classrooms.length} classrooms, ${allUsers.length} users`);

  const plan = buildBulkSyncPlan(classrooms, allUsers);
  console.log(`${plan.length} classrooms have Drive folders\n`);

  let totalGranted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const entry of plan) {
    console.log(`--- ${entry.classroomId} (folder: ${entry.driveFolderId})`);
    console.log(`    Desired: ${[...entry.desiredEmails].join(", ") || "(none)"}`);

    // Get current permissions
    let currentEmails;
    try {
      const res = await drive.permissions.list({
        fileId: entry.driveFolderId,
        supportsAllDrives: true,
        fields: "permissions(id,emailAddress,role)",
      });
      currentEmails = new Set(
        (res.data.permissions || [])
          .filter((p) => p.emailAddress && p.role !== "owner" && p.role !== "organizer")
          .map((p) => p.emailAddress.toLowerCase()),
      );
      console.log(`    Current: ${[...currentEmails].join(", ") || "(none)"}`);
    } catch (err) {
      console.error(`    ERROR listing permissions: ${err.message}`);
      totalErrors++;
      continue;
    }

    for (const email of entry.desiredEmails) {
      if (currentEmails.has(email.toLowerCase())) {
        totalSkipped++;
        continue;
      }
      if (DRY_RUN) {
        console.log(`    [DRY RUN] Would grant: ${email}`);
        totalGranted++;
      } else {
        try {
          await grantDrivePermission(drive, entry.driveFolderId, email);
          console.log(`    Granted: ${email}`);
          totalGranted++;
        } catch (err) {
          console.error(`    ERROR granting ${email}: ${err.message}`);
          totalErrors++;
        }
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Classrooms processed: ${plan.length}`);
  console.log(`Permissions granted:  ${totalGranted}`);
  console.log(`Already had access:   ${totalSkipped}`);
  console.log(`Errors:               ${totalErrors}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
