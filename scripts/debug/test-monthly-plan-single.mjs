/**
 * Smoke-test: generate a monthly plan for a single student via the deployed
 * generateMonthlyPlan callable. Reuses the backfill script's auth pattern.
 *
 * Usage:
 *   node scripts/debug/test-monthly-plan-single.mjs --student 2026-PAR-010
 *   node scripts/debug/test-monthly-plan-single.mjs --student 2026-PAR-010 --month 2026-10
 */
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!admin.apps.length) {
  const saPath = resolve(__dirname, "../../firebase-service-account.json");
  admin.initializeApp({
    credential: admin.credential.cert(saPath),
    projectId: "pep-os",
  });
}

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY ||
  readFileSync(resolve(__dirname, "../../montessori-os/.env"), "utf8")
    .match(/^VITE_FIREBASE_API_KEY="?([^"\n]+)"?/m)?.[1];
if (!FIREBASE_API_KEY) throw new Error("FIREBASE_API_KEY not found in env or montessori-os/.env");

const CF_BASE = "https://asia-south1-pep-os.cloudfunctions.net";

async function getIdToken(uid) {
  const customToken = await admin.auth().createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return (await res.json()).idToken;
}

async function callFunction(name, data, idToken) {
  const res = await fetch(`${CF_BASE}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  return body.result;
}

const args = process.argv.slice(2);
const studentIdx = args.indexOf("--student");
const monthIdx = args.indexOf("--month");

if (studentIdx < 0) {
  console.error("Usage: node scripts/debug/test-monthly-plan-single.mjs --student <id> [--month YYYY-MM]");
  process.exit(1);
}

const studentId = args[studentIdx + 1];
const callerUid = "T1iLA2qjTqMvgS4hamw2PEtNsov1"; // Thilak (superadmin)

const now = new Date();
const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const targetMonth = monthIdx >= 0
  ? args[monthIdx + 1]
  : `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;

console.log(`Generating monthly plan for ${studentId}, month=${targetMonth}`);
const idToken = await getIdToken(callerUid);
const result = await callFunction("generateMonthlyPlan", { studentId, targetMonth }, idToken);
console.log(`Success: ${result.plan.sections?.length} sections, ${result.plan.totalTokens} tokens`);
console.log(`planningMode: ${result.plan.planningMode}`);
console.log(`sections: ${result.plan.sections?.map((s) => s.name).join(", ")}`);
process.exit(0);
