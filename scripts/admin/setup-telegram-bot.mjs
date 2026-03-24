#!/usr/bin/env node

/**
 * One-time setup script for Pep OS Telegram bot.
 *
 * 1. Registers the webhook URL with Telegram (using the bot token).
 * 2. Seeds the Firestore `config/telegram_bot` doc with allowed user IDs.
 *
 * Usage:
 *   node scripts/admin/setup-telegram-bot.mjs
 *
 * Required environment variables:
 *   TELEGRAM_BOT_TOKEN        — Bot token from BotFather
 *   TELEGRAM_WEBHOOK_SECRET   — Secret token for webhook header verification
 *
 * The script will prompt for allowed Telegram user IDs interactively,
 * or you can pass them as comma-separated args:
 *   node scripts/admin/setup-telegram-bot.mjs 123456,789012,345678
 */

import admin from "firebase-admin";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import readline from "readline";

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

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const WEBHOOK_URL =
  "https://asia-south1-pep-os.cloudfunctions.net/telegramWebhook";

if (!BOT_TOKEN) {
  console.error("Error: TELEGRAM_BOT_TOKEN environment variable is required.");
  process.exit(1);
}

if (!WEBHOOK_SECRET) {
  console.error("Error: TELEGRAM_WEBHOOK_SECRET environment variable is required.");
  process.exit(1);
}

async function askForUserIds() {
  // Check CLI args first
  const cliArg = process.argv[2];
  if (cliArg) {
    return cliArg.split(",").map((id) => parseInt(id.trim(), 10));
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      "Enter allowed Telegram user IDs (comma-separated): ",
      (answer) => {
        rl.close();
        resolve(answer.split(",").map((id) => parseInt(id.trim(), 10)));
      }
    );
  });
}

async function registerWebhook() {
  console.log(`\nRegistering webhook at: ${WEBHOOK_URL}`);

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message"],
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    console.error("Failed to register webhook:", result);
    process.exit(1);
  }

  console.log("Webhook registered successfully:", result.description);
}

async function seedFirestoreConfig(allowedUserIds) {
  console.log(
    `\nSeeding config/telegram_bot with ${allowedUserIds.length} user(s)...`
  );

  await db.collection("config").doc("telegram_bot").set(
    {
      allowedUserIds,
      webhookUrl: WEBHOOK_URL,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Firestore config/telegram_bot doc seeded successfully.");
}

async function main() {
  const allowedUserIds = await askForUserIds();

  if (allowedUserIds.some((id) => isNaN(id))) {
    console.error("Error: All user IDs must be numbers.");
    process.exit(1);
  }

  console.log(`Allowed user IDs: ${allowedUserIds.join(", ")}`);

  await registerWebhook();
  await seedFirestoreConfig(allowedUserIds);

  console.log("\nSetup complete! Send a message to your bot to test the echo.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
