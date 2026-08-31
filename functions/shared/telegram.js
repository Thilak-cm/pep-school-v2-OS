/**
 * Shared Telegram alert helper (#229).
 *
 * Accepts the resolved token string (not the defineSecret object) so any
 * CF can use this without cross-module secret injection issues. Each CF
 * declares its own defineSecret("TELEGRAM_BOT_TOKEN") and passes .value()
 * at call time.
 */

/**
 * Send a message via Coach Pepper Telegram bot.
 * @param {string} token - resolved TELEGRAM_BOT_TOKEN value
 * @param {string} chatId
 * @param {string} text - Telegram HTML-formatted message
 */
export async function sendTelegramAlert(token, chatId, text) {
  if (!token) {
    console.error("[telegram] Bot token not set, skipping alert");
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
    console.error(`[telegram] Send failed: ${res.status} ${body}`);
  }
}

/**
 * Read alertChatIds from config/telegram_bot.
 * @param {import("firebase-admin/firestore").Firestore} db
 * @returns {Promise<string[]>}
 */
export async function getAlertChatIds(db) {
  const configDoc = await db.collection("config").doc("telegram_bot").get();
  const ids = configDoc.exists ? configDoc.data()?.alertChatIds || [] : [];
  return ids.map(String);
}

/**
 * Broadcast a message to all configured alert chat IDs.
 * @param {string} token
 * @param {import("firebase-admin/firestore").Firestore} db
 * @param {string} text
 */
export async function broadcastAlert(token, db, text) {
  const chatIds = await getAlertChatIds(db);
  if (chatIds.length === 0) {
    console.warn("[telegram] No alertChatIds configured, skipping broadcast");
    return;
  }
  await Promise.all(chatIds.map((id) => sendTelegramAlert(token, id, text)));
}
