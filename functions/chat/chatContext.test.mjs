import test from "node:test";
import assert from "node:assert/strict";

import {
  buildScopedSystemPrompt,
  loadChatMessages,
  loadObservationContext,
} from "./chatContext.js";

test("buildScopedSystemPrompt steers teacher-friendly boundary language", () => {
  const prompt = buildScopedSystemPrompt({
    basePrompt: "Base prompt.",
    student: { name: "Aadya" },
    studentId: "student-a",
    soul: "Aadya loves bead chains.",
  });

  assert.match(prompt, /^Communication style:/);
  assert.match(prompt, /simple, warm, non-technical English/);
  assert.match(prompt, /Ordered lists must use `1\.` markers, never `1\)`/);
  assert.match(prompt, /Indent nested bullets under their numbered item/);
  assert.match(prompt, /only about Aadya/);
  assert.match(prompt, /Please open that child's chat/);
  assert.doesNotMatch(prompt, /permanently scoped/);
  assert.doesNotMatch(prompt, /tools are fixed/);
  assert.match(prompt, /Aadya loves bead chains/);
});

test("loadChatMessages returns chronological recent transcript without pending turn duplicates", async () => {
  const db = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            collection: () => ({
              orderBy: () => ({
                limit: () => ({
                  get: async () => ({
                    docs: [
                      { id: "m2", data: () => ({ role: "assistant", content: "Second", createdAt: 2 }) },
                      { id: "m1", data: () => ({ role: "user", content: "First", createdAt: 1 }) },
                      { id: "pending-user", data: () => ({ role: "user", content: "Pending", createdAt: 3 }) },
                    ],
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  };

  const messages = await loadChatMessages({
    db,
    studentId: "s1",
    chatId: "c1",
    excludeMessageIds: new Set(["pending-user"]),
    limit: 10,
  });

  assert.deepEqual(messages, [
    { role: "user", content: "First" },
    { role: "assistant", content: "Second" },
  ]);
});

test("loadChatMessages merges legacy timestamp-only messages", async () => {
  const messagesRef = {
    orderBy: (field) => ({
      limit: () => ({
        get: async () => ({
          docs: field === "createdAt"
            ? [{ id: "new", data: () => ({ role: "assistant", content: "New", createdAt: 2 }) }]
            : [{ id: "legacy", data: () => ({ role: "user", content: "Legacy", timestamp: 1 }) }],
        }),
      }),
    }),
  };
  const db = {
    collection: () => ({
      doc: () => ({
        collection: () => ({ doc: () => ({ collection: () => messagesRef }) }),
      }),
    }),
  };

  const messages = await loadChatMessages({ db, studentId: "s1", chatId: "c1", limit: 10 });

  assert.deepEqual(messages, [
    { role: "user", content: "Legacy" },
    { role: "assistant", content: "New" },
  ]);
});

test("loadObservationContext applies the configured numeric limit", async () => {
  let appliedLimit = null;
  const query = {
    orderBy: () => query,
    limit: (value) => {
      appliedLimit = value;
      return query;
    },
    get: async () => ({ docs: [] }),
  };
  const db = { collection: () => ({ doc: () => ({ collection: () => query }) }) };

  await loadObservationContext({ db, studentId: "s1", limit: 30 });

  assert.equal(appliedLimit, 30);
});
