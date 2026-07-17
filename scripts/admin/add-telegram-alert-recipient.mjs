#!/usr/bin/env node

/**
 * add-telegram-alert-recipient.mjs
 *
 * Adds a chat ID to config/telegram_bot.alertChatIds array for data
 * integrity check alerts. Idempotent — won't add duplicates.
 *
 * Usage:
 *   node scripts/admin/add-telegram-alert-recipient.mjs <chat_id>
 *
 * Example:
 *   node scripts/admin/add-telegram-alert-recipient.mjs 8210978985
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

const chatId = process.argv[2];
if (!chatId) {
  console.error("Usage: node add-telegram-alert-recipient.mjs <chat_id>");
  process.exit(1);
}

const numericChatId = Number(chatId);
if (isNaN(numericChatId)) {
  console.error("chat_id must be a number");
  process.exit(1);
}

const docRef = db.collection("config").doc("telegram_bot");
const snap = await docRef.get();
const existing = snap.exists ? snap.data()?.alertChatIds || [] : [];

if (existing.includes(numericChatId)) {
  console.log(`chat_id ${numericChatId} already in alertChatIds, nothing to do.`);
} else {
  await docRef.set(
    { alertChatIds: [...existing, numericChatId] },
    { merge: true },
  );
  console.log(`Added ${numericChatId} to config/telegram_bot.alertChatIds`);
}
