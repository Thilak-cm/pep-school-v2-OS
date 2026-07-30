import test from "node:test";
import assert from "node:assert/strict";

import { buildScopedSystemPrompt, loadChatMessages } from "./chatContext.js";

test("buildScopedSystemPrompt steers teacher-friendly boundary language", () => {
  const prompt = buildScopedSystemPrompt({
    basePrompt: "Base prompt.",
    student: { name: "Aadya" },
    studentId: "student-a",
    soul: "Aadya loves bead chains.",
  });

  assert.match(prompt, /^Communication style:/);
  assert.match(prompt, /simple, warm, non-technical English/);
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
