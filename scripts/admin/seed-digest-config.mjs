#!/usr/bin/env node
/**
 * Seed config/weekly_digest Firestore doc for e2e testing (PEP-297).
 *
 * Usage: node scripts/admin/seed-digest-config.mjs
 *
 * Creates the config doc with testOverrideEmails so all digest emails
 * go to test recipients only. Remove testOverrideEmails field (or set
 * to null) when ready for production.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
  projectId: "pep-os",
});

const db = getFirestore();

const config = {
  // LLM settings
  model: "openai/gpt-4.1-mini",
  temperature: 0.4,
  max_tokens: 4000,

  // Test mode — all emails go to these addresses only.
  // Remove this field for production.
  testOverrideEmails: [
    "testteacher@pepschoolv2.com",
    "thilak@pepschoolv2.com",
  ],

  // Superadmin classroom overrides — these superadmins also get
  // per-classroom emails for the listed classrooms.
  superadminClassroomOverrides: {
    "HA1TiA1xbkRJ8n1MPaBi1PdGlo92": ["allstars"],  // Rahul → allstars
  },
};

async function main() {
  const ref = db.collection("config").doc("weekly_digest");
  const existing = await ref.get();

  if (existing.exists) {
    console.log("config/weekly_digest already exists. Current data:");
    console.log(JSON.stringify(existing.data(), null, 2));
    console.log("\nOverwriting with new config...");
  }

  await ref.set(config, { merge: true });
  console.log("\nconfig/weekly_digest seeded:");
  console.log(JSON.stringify(config, null, 2));
  console.log("\nDone. testOverrideEmails is active — all emails go to test recipients only.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
