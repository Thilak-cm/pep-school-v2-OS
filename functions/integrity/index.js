/**
 * Scheduled data integrity checks (#161).
 *
 * Runs daily at 6:00 AM IST. Executes all registered checks and sends
 * results to Coach Pepper on Telegram — heartbeat on all-pass, detailed
 * alert on any failure.
 */

import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { db } from "../shared/firebase.js";
import { ALL_CHECKS } from "./checks.js";

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");

/**
 * Send a message via Coach Pepper Telegram bot.
 * @param {string} chatId
 * @param {string} text - Telegram HTML-formatted message
 */
async function sendTelegramAlert(chatId, text) {
  const token = TELEGRAM_BOT_TOKEN.value();
  if (!token) {
    console.error("[integrity] TELEGRAM_BOT_TOKEN not set, skipping alert");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[integrity] Telegram send failed: ${res.status} ${body}`);
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Format results into a Telegram message.
 * @param {Array<{name: string, passed: boolean, details: string}>} results
 * @returns {string}
 */
function formatMessage(results) {
  const failures = results.filter((r) => !r.passed);
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  if (failures.length === 0) {
    return `All ${results.length} checks passed. ${now}`;
  }

  const lines = [`<b>Data integrity alert</b> - ${now}\n`];
  for (const f of failures) {
    lines.push(`<b>${escapeHtml(f.name)}</b>`);
    lines.push(`${escapeHtml(f.details)}\n`);
  }

  const passCount = results.length - failures.length;
  lines.push(`${passCount}/${results.length} checks passed.`);
  return lines.join("\n");
}

export const dataIntegrityChecks = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 120, memory: "512MB", secrets: [TELEGRAM_BOT_TOKEN] })
  .pubsub.schedule("0 6 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    console.log("[integrity] Starting data integrity checks");

    const results = [];
    for (const check of ALL_CHECKS) {
      try {
        const result = await check();
        results.push(result);
        console.log(
          `[integrity] ${result.name}: ${result.passed ? "PASS" : "FAIL"}`,
        );
      } catch (err) {
        results.push({
          name: check.name || "unknown",
          passed: false,
          details: `Check threw an error: ${err.message}`,
        });
        console.error(`[integrity] ${check.name} error:`, err);
      }
    }

    // Send Telegram alert to all configured chat IDs
    const configDoc = await db.collection("config").doc("telegram_bot").get();
    const alertChatIds = configDoc.exists
      ? configDoc.data()?.alertChatIds || []
      : [];

    if (alertChatIds.length === 0) {
      console.warn(
        "[integrity] No alertChatIds in config/telegram_bot, skipping alert",
      );
      console.warn("[integrity] Results:\n" + formatMessage(results));
      return null;
    }

    const message = formatMessage(results);
    await Promise.all(
      alertChatIds.map((id) => sendTelegramAlert(String(id), message)),
    );

    return null;
  });
