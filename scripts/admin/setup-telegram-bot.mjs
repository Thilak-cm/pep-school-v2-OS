#!/usr/bin/env node

/**
 * Setup script for Pep OS Telegram bot (Claude Code Channels architecture).
 *
 * 1. Deregisters any old webhook with Telegram (the new architecture uses
 *    long-polling via Claude Code Channels, so no webhook should be active).
 * 2. Seeds the Firestore `config/telegram_bot` doc with allowed user IDs.
 *
 * Usage:
 *   node scripts/admin/setup-telegram-bot.mjs
 *
 * Required environment variables:
 *   TELEGRAM_BOT_TOKEN  — Bot token from BotFather
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

if (!BOT_TOKEN) {
  console.error("Error: TELEGRAM_BOT_TOKEN environment variable is required.");
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

async function deleteWebhook() {
  console.log("\nDeregistering any existing webhook...");

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`;
  const response = await fetch(url, {
    method: "POST",
  });

  const result = await response.json();

  if (!result.ok) {
    console.error("Failed to delete webhook:", result);
    process.exit(1);
  }

  console.log("Webhook deregistered successfully:", result.description);
}

async function seedFirestoreConfig(allowedUserIds) {
  console.log(
    `\nSeeding config/telegram_bot with ${allowedUserIds.length} user(s)...`
  );

  await db.collection("config").doc("telegram_bot").set(
    {
      allowedUserIds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Firestore config/telegram_bot doc seeded successfully.");
}

async function main() {
  const rawIds = await askForUserIds();
  const allowedUserIds = rawIds.filter((id) => !isNaN(id) && id > 0);

  if (allowedUserIds.length === 0) {
    console.error("Error: At least one valid user ID is required.");
    process.exit(1);
  }

  console.log(`Allowed user IDs: ${allowedUserIds.join(", ")}`);

  await deleteWebhook();
  await seedFirestoreConfig(allowedUserIds);

  console.log("\nSetup complete! Start the bot with the `ct` alias.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
