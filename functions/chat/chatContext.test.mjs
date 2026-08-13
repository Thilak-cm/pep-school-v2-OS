import test from "node:test";
import assert from "node:assert/strict";

import {
  buildScopedSystemPrompt,
  loadChatMessages,
  loadObservationContext,
} from "./chatContext.js";

test("buildScopedSystemPrompt renders the configured template", () => {
  const prompt = buildScopedSystemPrompt({
    basePrompt: "Role {{studentName}}\nProfile {{studentProfile}}\nSoul {{developmentSummary}}\nObs {{recentObservations}}\nWindow {{observationWindowDays}}",
    student: { name: "Aadya" },
    studentId: "student-a",
    soul: "Aadya loves bead chains.",
  });

  assert.match(prompt, /Role Aadya/);
  assert.match(prompt, /Profile Name: Aadya/);
  assert.match(prompt, /Soul Aadya loves bead chains/);
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

  await loadObservationContext({ db, studentId: "s1", limit: 30, windowDays: null });

  assert.equal(appliedLimit, 30);
});

test("context loaders report query stages and aggregate sizes without content", async () => {
  const stages = [];
  const dimensions = [];
  const telemetry = {
    startStage: (name) => {
      stages.push(name);
      return (metadata = {}) => dimensions.push(metadata);
    },
    setDimensions: (metadata) => dimensions.push(metadata),
  };
  const query = {
    orderBy: () => query,
    limit: () => query,
    get: async () => ({
      docs: [{
        id: "o1",
        data: () => ({ type: "text", text: "Private observation", observedAt: 1 }),
      }],
    }),
  };
  const db = { collection: () => ({ doc: () => ({ collection: () => query }) }) };

  const result = await loadObservationContext({ db, studentId: "s1", limit: 20, windowDays: null, telemetry });

  assert.match(result, /Private observation/);
  assert.ok(stages.includes("observation_query"));
  assert.ok(stages.includes("observation_serialization"));
  assert.equal(dimensions.some((value) => value.observationsFetched === 1), true);
  assert.equal(JSON.stringify(dimensions).includes("Private observation"), false);
});

test("observation context includes every fetched observation without character truncation", async () => {
  const dimensions = [];
  const telemetry = {
    startStage: () => () => {},
    setDimensions: (metadata) => dimensions.push(metadata),
  };
  const query = {
    orderBy: () => query,
    limit: () => query,
    get: async () => ({
      docs: ["a", "b"].map((id) => ({
        id,
        data: () => ({ type: "text", text: id.repeat(7000), observedAt: 1 }),
      })),
    }),
  };
  const db = { collection: () => ({ doc: () => ({ collection: () => query }) }) };

  const result = await loadObservationContext({ db, studentId: "s1", limit: 20, windowDays: null, telemetry });

  assert.equal(dimensions.some((value) => value.observationsFetched === 2
    && value.observationsIncluded === 2
    && value.observationsDiscarded === 0
    && value.observationTruncationReason === "none"), true);
  assert.deepEqual(JSON.parse(result).map(({ text }) => text.length), [7000, 7000]);
});

test("loadChatMessages preserves complete message content", async () => {
  const longContent = "x".repeat(5000);
  const messagesRef = {
    orderBy: () => ({
      limit: () => ({
        get: async () => ({
          docs: [{ id: "long", data: () => ({ role: "user", content: longContent, createdAt: 1 }) }],
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

  assert.equal(messages[0].content.length, 5000);
});
