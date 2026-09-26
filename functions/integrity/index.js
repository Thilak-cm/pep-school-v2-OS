/**
 * Scheduled data integrity checks (#161).
 *
 * Runs daily at 6:00 AM IST. Executes all registered checks and sends a
 * detailed Telegram alert to Coach Pepper only when a check fails.
 * All-pass runs are logged but stay silent (heartbeat removed — consistent
 * "all good" messages were noise; Cloud Logging covers the audit trail).
 */

import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { db } from "../shared/firebase.js";
import { ALL_CHECKS } from "./checks.js";
import { sendTelegramAlert as sendTelegramAlertShared } from "../shared/telegram.js";

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");

/**
 * Send a message via Coach Pepper Telegram bot.
 * Thin wrapper that resolves the secret and delegates to shared helper.
 */
async function sendTelegramAlert(chatId, text) {
  await sendTelegramAlertShared(TELEGRAM_BOT_TOKEN.value(), chatId, text);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Format failing results into a Telegram alert message.
 * Only called when at least one check failed.
 * @param {Array<{name: string, passed: boolean, details: string}>} results
 * @returns {string}
 */
function formatMessage(results) {
  const failures = results.filter((r) => !r.passed);
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

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

    // Alert only on failures — all-pass runs stay silent (no heartbeat)
    const failures = results.filter((r) => !r.passed);
    if (failures.length === 0) {
      console.log(`[integrity] All ${results.length} checks passed, no alert sent`);
      return null;
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
