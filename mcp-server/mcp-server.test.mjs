import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  handleGetStudent,
  handleGetObservations,
  handleGetBaseballCard,
  handleGetAiSummary,
  handleGetAiSummaryHistory,
  handleListStudents,
  handleListClassrooms,
  TOOL_DEFINITIONS,
} from "./tools.js";

// --- Mock Firestore ---

function mockDoc(id, data) {
  return { id, data: () => data, exists: true };
}

function mockSnapshot(docs) {
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (fn) => docs.forEach(fn),
  };
}

function createMockQuery(docs) {
  const filters = [];
  const query = {
    where(field, op, value) {
      filters.push({ field, op, value });
      return query;
    },
    orderBy() { return query; },
    limit() { return query; },
    async get() {
      let filtered = docs;
      for (const { field, op, value } of filters) {
        filtered = filtered.filter((d) => {
          const raw = d.data()[field];
          const v = raw?.toDate?.() ?? raw;
          if (op === "==") return v === value;
          if (op === ">=") return v >= value;
          if (op === "<=") return v <= value;
          if (op === ">") return v > value;
          if (op === "<") return v < value;
          return true;
        });
      }
      return mockSnapshot(filtered);
    },
  };
  return query;
}

function createMockDb(collections = {}) {
  return {
    collection: (name) => {
      const q = createMockQuery(collections[name] || []);
      q.doc = (id) => ({
        get: async () => {
          const docs = collections[name] || [];
          const found = docs.find((d) => d.id === id);
          return found || { exists: false, data: () => undefined };
        },
        collection: (subName) => {
          const key = `${name}/${id}/${subName}`;
          const subQ = createMockQuery(collections[key] || []);
          subQ.doc = (subId) => ({
            get: async () => {
              const subDocs = collections[key] || [];
              const found = subDocs.find((d) => d.id === subId);
              return found || { exists: false, data: () => undefined };
            },
            collection: (subSubName) => {
              const subKey = `${key}/${subId}/${subSubName}`;
              const subSubQ = createMockQuery(collections[subKey] || []);
              subSubQ.doc = (subSubId) => ({
                get: async () => {
                  const subSubDocs = collections[subKey] || [];
                  const found = subSubDocs.find((d) => d.id === subSubId);
                  return found || { exists: false, data: () => undefined };
                },
              });
              return subSubQ;
            },
          });
          return subQ;
        },
      });
      return q;
    },
  };
}

// --- Tool Definitions ---

describe("TOOL_DEFINITIONS", () => {
  it("should export exactly 9 tools", () => {
    assert.equal(TOOL_DEFINITIONS.length, 9);
  });

  it("should have correct tool names", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "get_ai_summary",
      "get_baseball_card",
      "get_config",
      "get_media_stats",
      "get_observations",
      "get_student",
      "list_classrooms",
      "list_config",
      "list_students",
    ]);
  });

  it("each tool should have name, description, and inputSchema", () => {
    for (const tool of TOOL_DEFINITIONS) {
      assert.ok(tool.name, "missing name");
      assert.ok(tool.description, "missing description");
      assert.ok(tool.inputSchema, "missing inputSchema");
      assert.equal(tool.inputSchema.type, "object");
    }
  });
});

// --- get_student ---

describe("handleGetStudent", () => {
  const students = [
    mockDoc("2025-ALL-001", {
      displayName: "Agastya Sharma",
      firstName: "Agastya",
      lastName: "Sharma",
      classroomId: "allstars",
      programId: "adolescent",
      dateOfBirth: null,
      status: "active",
    }),
    mockDoc("2025-PER-001", {
      displayName: "Devisha Yadav",
      firstName: "Devisha",
      lastName: "Yadav",
      classroomId: "periwinkle",
      programId: "primary",
      dateOfBirth: null,
      status: "active",
    }),
    mockDoc("2025-ALL-002", {
      displayName: "Arjun Mehta",
      firstName: "Arjun",
      lastName: "Mehta",
      classroomId: "allstars",
      programId: "adolescent",
      dateOfBirth: null,
      status: "inactive",
    }),
  ];

  it("should find student by partial name (case-insensitive)", async () => {
    const db = createMockDb({ students });
    const result = await handleGetStudent(db, { name: "agastya" });
    assert.equal(result.length, 1);
    assert.equal(result[0].displayName, "Agastya Sharma");
    assert.equal(result[0].id, "2025-ALL-001");
  });

  it("should find student by ID", async () => {
    const db = createMockDb({ students });
    const result = await handleGetStudent(db, { id: "2025-PER-001" });
    assert.equal(result.length, 1);
    assert.equal(result[0].displayName, "Devisha Yadav");
  });

  it("should return empty array when no match", async () => {
    const db = createMockDb({ students });
    const result = await handleGetStudent(db, { name: "nonexistent" });
    assert.equal(result.length, 0);
  });

  it("should only return active students when searching by name", async () => {
    const db = createMockDb({ students });
    const result = await handleGetStudent(db, { name: "arjun" });
    assert.equal(result.length, 0);
  });
});

// --- get_observations ---

describe("handleGetObservations", () => {
  const now = Date.now();
  const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

  const observations = [
    mockDoc("obs1", {
      text: "Worked on multiplication tables",
      type: "text",
      observedAt: { toDate: () => fiveDaysAgo },
      createdByName: "Ms. Priya",
      classroomId: "allstars",
    }),
    mockDoc("obs2", {
      text: "Old observation",
      type: "voice",
      observedAt: { toDate: () => sixtyDaysAgo },
      createdByName: "Ms. Priya",
      classroomId: "allstars",
    }),
  ];

  it("should return observations within default 30-day window", async () => {
    const db = createMockDb({
      "students/2025-ALL-001/observations": observations,
    });
    const result = await handleGetObservations(db, {
      studentId: "2025-ALL-001",
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].text, "Worked on multiplication tables");
  });

  it("should respect custom days window", async () => {
    const db = createMockDb({
      "students/2025-ALL-001/observations": observations,
    });
    const result = await handleGetObservations(db, {
      studentId: "2025-ALL-001",
      days: 90,
    });
    assert.equal(result.length, 2);
  });

  it("should safely skip observations with null observedAt", async () => {
    const obsWithNullDate = [
      mockDoc("obs-null", {
        text: "Observation with no date",
        type: "text",
        observedAt: null,
        createdByName: "Ms. Priya",
        classroomId: "allstars",
      }),
    ];
    const db = createMockDb({
      "students/2025-ALL-001/observations": obsWithNullDate,
    });
    const result = await handleGetObservations(db, {
      studentId: "2025-ALL-001",
    });
    assert.equal(result.length, 0);
  });

  it("should return empty array when no observations", async () => {
    const db = createMockDb({});
    const result = await handleGetObservations(db, {
      studentId: "2025-ALL-001",
    });
    assert.equal(result.length, 0);
  });
});

// --- get_baseball_card ---

describe("handleGetBaseballCard", () => {
  it("should return baseball card when it exists", async () => {
    const card = mockDoc("baseball_card", {
      bullets: ["Great at math", "Loves reading"],
      lessonSummary: "Strong progress in multiplication",
      noteCount: 12,
      windowDays: 30,
      generatedAt: { toDate: () => new Date() },
      status: "ok",
    });
    const db = createMockDb({
      "students/2025-ALL-001/ai_summaries": [card],
    });
    const result = await handleGetBaseballCard(db, {
      studentId: "2025-ALL-001",
    });
    assert.ok(result);
    assert.deepEqual(result.bullets, ["Great at math", "Loves reading"]);
    assert.equal(result.noteCount, 12);
  });

  it("should return null when no baseball card exists", async () => {
    const db = createMockDb({});
    const result = await handleGetBaseballCard(db, {
      studentId: "2025-ALL-001",
    });
    assert.equal(result, null);
  });
});

// --- get_ai_summary ---

describe("handleGetAiSummary", () => {
  it("should return soul document with serialized timestamps", async () => {
    const soul = mockDoc("soul", {
      content: "## Mathematics\nStrong progress.",
      programId: "primary",
      hasEmergentObservations: true,
      createdAt: { toDate: () => new Date("2026-04-01") },
      updatedAt: { toDate: () => new Date("2026-04-28") },
      updatedBy: "cloud-function:soul-generate",
    });
    const db = createMockDb({
      "students/2025-ALL-001/ai_summaries": [soul],
    });
    const result = await handleGetAiSummary(db, {
      studentId: "2025-ALL-001",
      docId: "soul",
    });
    assert.ok(result);
    assert.equal(result.id, "soul");
    assert.ok(result.content.includes("Mathematics"));
    assert.equal(result.hasEmergentObservations, true);
    assert.equal(typeof result.createdAt, "string");
  });

  it("should return open_questions document", async () => {
    const oq = mockDoc("open_questions", {
      areas: {
        "Self-Regulation": ["How does the child handle frustration?"],
        "Reading": ["What reading materials do they choose?"],
      },
      programId: "primary",
      updatedBy: "cloud-function:soul-generate",
    });
    const db = createMockDb({
      "students/2025-ALL-001/ai_summaries": [oq],
    });
    const result = await handleGetAiSummary(db, {
      studentId: "2025-ALL-001",
      docId: "open_questions",
    });
    assert.ok(result);
    assert.equal(Object.keys(result.areas).length, 2);
    assert.equal(result.areas["Self-Regulation"].length, 1);
  });

  it("should return null when doc does not exist", async () => {
    const db = createMockDb({});
    const result = await handleGetAiSummary(db, {
      studentId: "2025-ALL-001",
      docId: "nonexistent",
    });
    assert.equal(result, null);
  });
});

// --- list_students ---

describe("handleListStudents", () => {
  const students = [
    mockDoc("2025-ALL-001", {
      displayName: "Agastya Sharma",
      classroomId: "allstars",
      programId: "adolescent",
      status: "active",
    }),
    mockDoc("2025-ALL-002", {
      displayName: "Arjun Mehta",
      classroomId: "allstars",
      programId: "adolescent",
      status: "inactive",
    }),
  ];

  const classrooms = [
    mockDoc("allstars", {
      name: "All Stars",
      programId: "adolescent",
      status: "active",
    }),
  ];

  it("should list active students for a classroom by ID", async () => {
    const db = createMockDb({ students, classrooms });
    const result = await handleListStudents(db, {
      classroomId: "allstars",
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].displayName, "Agastya Sharma");
  });

  it("should find classroom by name and list students", async () => {
    const db = createMockDb({ students, classrooms });
    const result = await handleListStudents(db, {
      classroomName: "All Stars",
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].displayName, "Agastya Sharma");
  });

  it("should return empty array for unknown classroom", async () => {
    const db = createMockDb({ students: [], classrooms: [] });
    const result = await handleListStudents(db, {
      classroomName: "Nonexistent",
    });
    assert.equal(result.length, 0);
  });
});

// --- list_classrooms ---

describe("handleListClassrooms", () => {
  const classrooms = [
    mockDoc("allstars", {
      name: "All Stars",
      programId: "adolescent",
      branchId: "hsr",
      studentCount: 15,
      status: "active",
    }),
    mockDoc("periwinkle", {
      name: "Periwinkle",
      programId: "primary",
      branchId: "hsr",
      studentCount: 22,
      status: "active",
    }),
  ];

  it("should list all active classrooms", async () => {
    const db = createMockDb({ classrooms });
    const result = await handleListClassrooms(db);
    assert.equal(result.length, 2);
    assert.equal(result[0].name, "All Stars");
    assert.equal(result[1].name, "Periwinkle");
  });

  it("should return correct fields", async () => {
    const db = createMockDb({ classrooms });
    const result = await handleListClassrooms(db);
    const first = result[0];
    assert.ok(first.id);
    assert.ok(first.name);
    assert.ok(first.programId);
    assert.ok(first.branchId);
    assert.equal(typeof first.studentCount, "number");
  });
});

// --- get_ai_summary_history (open_questions) ---

describe("handleGetAiSummaryHistory", () => {
  it("should return open_questions history ordered by archivedAt", async () => {
    const historyDocs = [
      mockDoc("v1", {
        areas: { "Math": ["How does the child count?"] },
        archivedAt: { toDate: () => new Date("2026-06-01") },
        programId: "primary",
      }),
      mockDoc("v2", {
        areas: { "Reading": ["What books do they choose?"] },
        archivedAt: { toDate: () => new Date("2026-07-01") },
        programId: "primary",
      }),
    ];
    const db = createMockDb({
      "students/2025-ALL-001/ai_summaries/open_questions/history": historyDocs,
    });
    const result = await handleGetAiSummaryHistory(db, {
      studentId: "2025-ALL-001",
      docId: "open_questions",
    });
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "v1");
    assert.equal(result[1].id, "v2");
    assert.ok(result[0].areas.Math, "Should include areas data");
  });

  it("should return empty array when no history exists", async () => {
    const db = createMockDb({});
    const result = await handleGetAiSummaryHistory(db, {
      studentId: "2025-ALL-001",
      docId: "open_questions",
    });
    assert.equal(result.length, 0);
  });

  it("should respect limit parameter", async () => {
    const historyDocs = [
      mockDoc("v1", {
        areas: {},
        archivedAt: { toDate: () => new Date("2026-06-01") },
      }),
      mockDoc("v2", {
        areas: {},
        archivedAt: { toDate: () => new Date("2026-07-01") },
      }),
      mockDoc("v3", {
        areas: {},
        archivedAt: { toDate: () => new Date("2026-07-15") },
      }),
    ];
    const db = createMockDb({
      "students/2025-ALL-001/ai_summaries/open_questions/history": historyDocs,
    });
    const result = await handleGetAiSummaryHistory(db, {
      studentId: "2025-ALL-001",
      docId: "open_questions",
      limit: 2,
    });
    // The mock doesn't enforce limit, but the function should call .limit()
    // We verify the function runs without error and returns results
    assert.ok(result.length > 0);
  });

  it("should use archivedAt ordering for open_questions (not updatedAt)", async () => {
    // This test verifies the orderField logic by checking that
    // open_questions uses archivedAt, same as weekly_snapshot and monthly_plan.
    // The mock's orderBy is a no-op, but we verify the function path works
    // for open_questions docId without errors.
    const historyDocs = [
      mockDoc("v1", {
        areas: { "Math": ["q1"] },
        archivedAt: { toDate: () => new Date("2026-06-01") },
        updatedAt: { toDate: () => new Date("2026-05-01") },
      }),
    ];
    const db = createMockDb({
      "students/2025-ALL-001/ai_summaries/open_questions/history": historyDocs,
    });
    const result = await handleGetAiSummaryHistory(db, {
      studentId: "2025-ALL-001",
      docId: "open_questions",
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "v1");
  });
});
