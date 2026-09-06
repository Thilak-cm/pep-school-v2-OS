/**
 * Trigger the baseballCard dispatcher/worker via the triggerBaseballCards callable.
 *
 * The worker's idempotency guard skips students who already have a
 * weekly_snapshot with weekKey matching the target week - only failures
 * or missing students get processed.
 *
 * Prerequisites:
 *   - Application Default Credentials (gcloud auth application-default login)
 *
 * Usage:
 *   node scripts/ops/trigger-baseball-cards.mjs                         # current week, all students
 *   node scripts/ops/trigger-baseball-cards.mjs --week 2026-W36         # retry W36 failures only
 *   node scripts/ops/trigger-baseball-cards.mjs --student S1 --student S2  # specific students
 */
import admin from "firebase-admin";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serviceAccount = require(resolve(__dirname, "../../firebase-service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "pep-os",
  });
}

const FIREBASE_API_KEY = "AIzaSyAC4ibFMiIOtAlinYTXQjvQCf10jBAqKJQ";
const CF_BASE = "https://asia-south1-pep-os.cloudfunctions.net";
const SUPERADMIN_UID = "T1iLA2qjTqMvgS4hamw2PEtNsov1"; // Thilak

async function getIdToken(uid) {
  const customToken = await admin.auth().createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return (await res.json()).idToken;
}

async function callFunction(name, data, idToken) {
  const res = await fetch(`${CF_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  return body.result;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { week: null, studentIds: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--week" && args[i + 1]) result.week = args[++i];
    else if (args[i] === "--student" && args[i + 1]) result.studentIds.push(args[++i]);
    else if (args[i] === "--help" || args[i] === "-h") {
      console.log("Usage: node scripts/ops/trigger-baseball-cards.mjs [--week YYYY-WNN] [--student ID ...]");
      process.exit(0);
    }
  }
  return result;
}

async function main() {
  const { week, studentIds } = parseArgs();

  const payload = {};
  if (week) {
    if (!/^\d{4}-W\d{2}$/.test(week)) {
      console.error(`Invalid week format: ${week} (expected YYYY-WNN, e.g. 2026-W36)`);
      process.exit(1);
    }
    payload.targetWeek = week;
  }
  if (studentIds.length) payload.studentIds = studentIds;

  console.log("Calling triggerBaseballCards with:", JSON.stringify(payload));
  const idToken = await getIdToken(SUPERADMIN_UID);
  const result = await callFunction("triggerBaseballCards", payload, idToken);
  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
