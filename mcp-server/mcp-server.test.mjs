import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  handleGetStudent,
  handleGetObservations,
  handleGetBaseballCard,
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
  it("should export exactly 5 tools", () => {
    assert.equal(TOOL_DEFINITIONS.length, 5);
  });

  it("should have correct tool names", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "get_baseball_card",
      "get_observations",
      "get_student",
      "list_classrooms",
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
      isActive: true,
    }),
    mockDoc("2025-PER-001", {
      displayName: "Devisha Yadav",
      firstName: "Devisha",
      lastName: "Yadav",
      classroomId: "periwinkle",
      programId: "primary",
      dateOfBirth: null,
      status: "active",
      isActive: true,
    }),
    mockDoc("2025-ALL-002", {
      displayName: "Arjun Mehta",
      firstName: "Arjun",
      lastName: "Mehta",
      classroomId: "allstars",
      programId: "adolescent",
      dateOfBirth: null,
      status: "inactive",
      isActive: false,
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

// --- list_students ---

describe("handleListStudents", () => {
  const students = [
    mockDoc("2025-ALL-001", {
      displayName: "Agastya Sharma",
      classroomId: "allstars",
      programId: "adolescent",
      isActive: true,
      status: "active",
    }),
    mockDoc("2025-ALL-002", {
      displayName: "Arjun Mehta",
      classroomId: "allstars",
      programId: "adolescent",
      isActive: false,
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
