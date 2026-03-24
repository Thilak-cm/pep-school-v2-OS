import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createWebhookHandler } from "./handler.js";

// --- Helpers to build mock objects ---

function makeMockDb(allowedUserIds = []) {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: allowedUserIds.length > 0,
          data: () => ({ allowedUserIds }),
        }),
      }),
    }),
  };
}

function makeMockBot() {
  const sent = [];
  return {
    sent,
    api: {
      sendMessage: async (chatId, text) => {
        sent.push({ chatId, text });
      },
    },
  };
}

function makeReq({ method = "POST", secretHeader = null, body = null } = {}) {
  return {
    method,
    headers: {
      "x-telegram-bot-api-secret-token": secretHeader,
    },
    body: body ?? {
      message: {
        from: { id: 12345 },
        chat: { id: 12345 },
        text: "Hello bot",
      },
    },
  };
}

function makeRes() {
  let statusCode = null;
  let sentBody = null;
  return {
    get statusCode() { return statusCode; },
    get sentBody() { return sentBody; },
    status(code) { statusCode = code; return this; },
    send(body) { sentBody = body; return this; },
    json(body) { sentBody = body; return this; },
    end() { return this; },
  };
}

// --- Tests ---

describe("telegramWebhook handler", () => {
  const WEBHOOK_SECRET = "test-secret-abc123";

  describe("secret header verification", () => {
    it("should return 200 and stop processing when secret header is missing", async () => {
      const handler = createWebhookHandler({
        db: makeMockDb(),
        bot: makeMockBot(),
        webhookSecret: WEBHOOK_SECRET,
      });
      const req = makeReq({ secretHeader: null });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.sentBody, { ok: true });
    });

    it("should return 200 and stop processing when secret header is invalid", async () => {
      const handler = createWebhookHandler({
        db: makeMockDb(),
        bot: makeMockBot(),
        webhookSecret: WEBHOOK_SECRET,
      });
      const req = makeReq({ secretHeader: "wrong-secret" });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.sentBody, { ok: true });
    });

    it("should proceed when secret header is valid", async () => {
      const bot = makeMockBot();
      const handler = createWebhookHandler({
        db: makeMockDb([12345]),
        bot,
        webhookSecret: WEBHOOK_SECRET,
      });
      const req = makeReq({ secretHeader: WEBHOOK_SECRET });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      // Should have echoed since user is whitelisted
      assert.equal(bot.sent.length, 1);
    });
  });

  describe("whitelist enforcement", () => {
    it("should silently ignore messages from non-whitelisted users", async () => {
      const bot = makeMockBot();
      const handler = createWebhookHandler({
        db: makeMockDb([99999]), // different user ID
        bot,
        webhookSecret: WEBHOOK_SECRET,
      });
      const req = makeReq({ secretHeader: WEBHOOK_SECRET });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(bot.sent.length, 0); // no reply sent
    });

    it("should process messages from whitelisted users", async () => {
      const bot = makeMockBot();
      const handler = createWebhookHandler({
        db: makeMockDb([12345]),
        bot,
        webhookSecret: WEBHOOK_SECRET,
      });
      const req = makeReq({ secretHeader: WEBHOOK_SECRET });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(bot.sent.length, 1);
    });

    it("should return 200 when whitelist config doc does not exist", async () => {
      const emptyDb = {
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false, data: () => null }),
          }),
        }),
      };
      const bot = makeMockBot();
      const handler = createWebhookHandler({
        db: emptyDb,
        bot,
        webhookSecret: WEBHOOK_SECRET,
      });
      const req = makeReq({ secretHeader: WEBHOOK_SECRET });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(bot.sent.length, 0);
    });
  });

  describe("echo reply", () => {
    it("should echo back the user message text", async () => {
      const bot = makeMockBot();
      const handler = createWebhookHandler({
        db: makeMockDb([12345]),
        bot,
        webhookSecret: WEBHOOK_SECRET,
      });
      const req = makeReq({
        secretHeader: WEBHOOK_SECRET,
        body: {
          message: {
            from: { id: 12345 },
            chat: { id: 12345 },
            text: "Testing echo",
          },
        },
      });
      const res = makeRes();

      await handler(req, res);

      assert.equal(bot.sent[0].chatId, 12345);
      assert.equal(bot.sent[0].text, "Echo: Testing echo");
    });
  });

  describe("always returns HTTP 200", () => {
    it("should return 200 even when handler throws an error", async () => {
      const errorDb = {
        collection: () => ({
          doc: () => ({
            get: async () => { throw new Error("Firestore unavailable"); },
          }),
        }),
      };
      const handler = createWebhookHandler({
        db: errorDb,
        bot: makeMockBot(),
        webhookSecret: WEBHOOK_SECRET,
      });
      const req = makeReq({ secretHeader: WEBHOOK_SECRET });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
    });

    it("should return 200 for non-message updates (e.g. edited_message)", async () => {
      const handler = createWebhookHandler({
        db: makeMockDb([12345]),
        bot: makeMockBot(),
        webhookSecret: WEBHOOK_SECRET,
      });
      const req = makeReq({
        secretHeader: WEBHOOK_SECRET,
        body: { edited_message: { from: { id: 12345 }, text: "edited" } },
      });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
    });
  });

  describe("HTTP method handling", () => {
    it("should return 200 for non-POST methods", async () => {
      const handler = createWebhookHandler({
        db: makeMockDb(),
        bot: makeMockBot(),
        webhookSecret: WEBHOOK_SECRET,
      });
      const req = makeReq({ method: "GET", secretHeader: WEBHOOK_SECRET });
      const res = makeRes();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
    });
  });
});
