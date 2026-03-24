/**
 * Telegram webhook handler for Pep OS bot.
 *
 * Verifies the webhook secret header, checks the sender against a
 * Firestore whitelist, and echoes authorized messages back.
 */

/**
 * Factory that returns an Express-compatible request handler.
 *
 * @param {object}  opts
 * @param {object}  opts.db             Firestore instance
 * @param {object}  opts.bot            grammy Bot instance (only .api.sendMessage used)
 * @param {string}  opts.webhookSecret  Expected value of X-Telegram-Bot-Api-Secret-Token
 * @returns {(req, res) => Promise<void>}
 */
export function createWebhookHandler({ db, bot, webhookSecret }) {
  return async (req, res) => {
    try {
      // Always return 200 to Telegram
      const ok = () => res.status(200).send({ ok: true });

      // Only accept POST
      if (req.method !== "POST") {
        return ok();
      }

      // Verify webhook secret header
      const headerSecret = req.headers["x-telegram-bot-api-secret-token"];
      if (!headerSecret || headerSecret !== webhookSecret) {
        return ok();
      }

      // Extract message (ignore non-message updates)
      const message = req.body?.message;
      if (!message || !message.from || !message.text) {
        return ok();
      }

      // Check whitelist — read fresh from Firestore each time
      const configSnap = await db
        .collection("config")
        .doc("telegram_bot")
        .get();

      if (!configSnap.exists) {
        console.warn("[telegram] config/telegram_bot doc not found");
        return ok();
      }

      const allowedUserIds = configSnap.data()?.allowedUserIds ?? [];
      if (!allowedUserIds.includes(message.from.id)) {
        // Silently ignore unauthorized senders
        return ok();
      }

      // Echo the message back
      await bot.api.sendMessage(message.chat.id, `Echo: ${message.text}`);

      return ok();
    } catch (err) {
      console.error("[telegram] Webhook handler error:", err);
      // Always return 200 to Telegram even on errors
      return res.status(200).send({ ok: true });
    }
  };
}
