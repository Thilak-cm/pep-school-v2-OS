import test from "node:test";
import assert from "node:assert/strict";
import { buildChatConfigMigration } from "./migrate-chat-config-from-brain.mjs";

test("migration maps Primary Brain config to Primary and Toddler", async () => {
  const writes = await buildChatConfigMigration();
  assert.deepEqual(writes.map(({ path }) => path), [
    "config/chat_primary",
    "config/chat_toddler",
    "config/chat_elementary",
    "config/chat_adolescent",
  ]);
  assert.equal(writes[0].fields.systemPrompt, writes[1].fields.systemPrompt);
  assert.equal(writes[0].fields.observationWindowDays, 30);
  assert.equal(writes[0].fields.chatMessageLimit, 30);
  assert.equal("observationLimit" in writes[0].fields, false);
});
