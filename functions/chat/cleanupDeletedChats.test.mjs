import test from "node:test";
import assert from "node:assert/strict";

import { deleteDocumentRecursively } from "./cleanupDeletedChats.js";

function childRef(path, deleted) {
  return {
    path,
    listCollections: async () => [],
    delete: async () => deleted.push(path),
  };
}

test("recursive chat cleanup deletes messages, turns, then the chat", async () => {
  const deleted = [];
  const message = childRef("students/s1/chats/c1/messages/m1", deleted);
  const turn = childRef("students/s1/chats/c1/turns/t1", deleted);
  const chat = {
    path: "students/s1/chats/c1",
    listCollections: async () => [
      { get: async () => ({ docs: [{ ref: message }] }) },
      { get: async () => ({ docs: [{ ref: turn }] }) },
    ],
    delete: async () => deleted.push("students/s1/chats/c1"),
  };

  await deleteDocumentRecursively(chat);

  assert.deepEqual(deleted, [
    "students/s1/chats/c1/messages/m1",
    "students/s1/chats/c1/turns/t1",
    "students/s1/chats/c1",
  ]);
});
