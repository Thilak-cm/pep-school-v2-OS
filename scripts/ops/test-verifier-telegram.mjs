#!/usr/bin/env node
/**
 * One-shot test: calls the verifier engine for a single jobKey
 * to verify that Telegram messages arrive correctly.
 *
 * Since no ledger data exists yet, this will trigger the "missed start"
 * path and send a red "Job Never Started" message to your alert chats.
 *
 * Usage:
 *   node scripts/ops/test-verifier-telegram.mjs --dry-run
 *   node scripts/ops/test-verifier-telegram.mjs
 *   node scripts/ops/test-verifier-telegram.mjs --job soulRegen
 *
 * Reads TELEGRAM_BOT_TOKEN via: firebase functions:secrets:access TELEGRAM_BOT_TOKEN
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { execSync } from "node:child_process";
import {
  formatMissedStartSignal,
} from "../../functions/shared/verifierTelegram.js";
import { sendTelegramAlert, getAlertChatIds } from "../../functions/shared/telegram.js";
import { computeExecutionId } from "../../functions/shared/ledger.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const jobIdx = args.indexOf("--job");
const jobKey = jobIdx >= 0 ? args[jobIdx + 1] : "baseballCards";

initializeApp({ credential: applicationDefault(), projectId: "pep-os" });
const db = getFirestore();

async function main() {
  const executionId = computeExecutionId(jobKey);
  console.log(`Job: ${jobKey}, ExecutionId: ${executionId}`);

  const missedMsg = formatMissedStartSignal(jobKey, executionId);
  console.log("\n--- Message that will be sent ---");
  console.log(missedMsg.replace(/<[^>]+>/g, "")); // Strip HTML for terminal
  console.log("--- End message ---\n");

  if (dryRun) {
    console.log("[dry-run] Would send to Telegram. Run without --dry-run to send.");
    return;
  }

  // Read token via Firebase CLI (uses your gcloud credentials)
  console.log("Reading TELEGRAM_BOT_TOKEN via Firebase CLI...");
  const token = execSync(
    "firebase functions:secrets:access TELEGRAM_BOT_TOKEN --project=pep-os",
    { encoding: "utf8" },
  ).trim();

  if (!token) {
    console.error("Could not read TELEGRAM_BOT_TOKEN");
    process.exit(1);
  }

  const chatIds = await getAlertChatIds(db);
  if (chatIds.length === 0) {
    console.error("No alertChatIds configured in config/telegram_bot");
    process.exit(1);
  }

  console.log(`Sending to ${chatIds.length} chat(s): ${chatIds.join(", ")}`);
  await Promise.all(chatIds.map((id) => sendTelegramAlert(token, id, missedMsg)));
  console.log("Sent! Check your Telegram.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
