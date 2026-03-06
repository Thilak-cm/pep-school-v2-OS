import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldSyncOnClassroomUpdate,
  shouldSyncOnUserUpdate,
  diffArrays,
  computeDesiredEmails,
  buildBulkSyncPlan,
} from "../utils/drivePermissions.js";

// ---------------------------------------------------------------------------
// shouldSyncOnClassroomUpdate
// ---------------------------------------------------------------------------
describe("shouldSyncOnClassroomUpdate", () => {
  it("returns true when teacherIds changed", () => {
    const before = { teacherIds: ["u1", "u2"], driveFolderId: "folder1" };
    const after = { teacherIds: ["u1", "u3"], driveFolderId: "folder1" };
    assert.equal(shouldSyncOnClassroomUpdate(before, after), true);
  });

  it("returns true when driveFolderId is set for the first time", () => {
    const before = { teacherIds: ["u1"] };
    const after = { teacherIds: ["u1"], driveFolderId: "folder1" };
    assert.equal(shouldSyncOnClassroomUpdate(before, after), true);
  });

  it("returns false when unrelated fields change", () => {
    const before = { teacherIds: ["u1"], driveFolderId: "folder1", studentCount: 5 };
    const after = { teacherIds: ["u1"], driveFolderId: "folder1", studentCount: 6 };
    assert.equal(shouldSyncOnClassroomUpdate(before, after), false);
  });

  it("returns false when driveFolderId is missing on both", () => {
    const before = { teacherIds: ["u1"] };
    const after = { teacherIds: ["u1", "u2"] };
    assert.equal(shouldSyncOnClassroomUpdate(before, after), false);
  });
});

// ---------------------------------------------------------------------------
// shouldSyncOnUserUpdate
// ---------------------------------------------------------------------------
describe("shouldSyncOnUserUpdate", () => {
  it("returns true when role changes", () => {
    const before = { role: "teacher", email: "a@test.com" };
    const after = { role: "classroomadmin", email: "a@test.com", manageableClassrooms: ["c1"] };
    assert.equal(shouldSyncOnUserUpdate(before, after), true);
  });

  it("returns true when manageableClassrooms changes", () => {
    const before = { role: "classroomadmin", email: "a@test.com", manageableClassrooms: ["c1"] };
    const after = { role: "classroomadmin", email: "a@test.com", manageableClassrooms: ["c1", "c2"] };
    assert.equal(shouldSyncOnUserUpdate(before, after), true);
  });

  it("returns false when unrelated fields change", () => {
    const before = { role: "teacher", email: "a@test.com", firstName: "Alice" };
    const after = { role: "teacher", email: "a@test.com", firstName: "Alicia" };
    assert.equal(shouldSyncOnUserUpdate(before, after), false);
  });
});

// ---------------------------------------------------------------------------
// diffArrays
// ---------------------------------------------------------------------------
describe("diffArrays", () => {
  it("detects added items", () => {
    const result = diffArrays(["a", "b"], ["a", "b", "c"]);
    assert.deepEqual(result.added, ["c"]);
    assert.deepEqual(result.removed, []);
  });

  it("detects removed items", () => {
    const result = diffArrays(["a", "b", "c"], ["a"]);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.removed, ["b", "c"]);
  });

  it("detects both added and removed", () => {
    const result = diffArrays(["a", "b"], ["b", "c"]);
    assert.deepEqual(result.added, ["c"]);
    assert.deepEqual(result.removed, ["a"]);
  });

  it("returns empty diff when arrays are identical", () => {
    const result = diffArrays(["a", "b"], ["a", "b"]);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.removed, []);
  });

  it("handles empty arrays", () => {
    assert.deepEqual(diffArrays([], ["a"]), { added: ["a"], removed: [] });
    assert.deepEqual(diffArrays(["a"], []), { added: [], removed: ["a"] });
    assert.deepEqual(diffArrays([], []), { added: [], removed: [] });
  });

  it("handles null/undefined as empty arrays", () => {
    assert.deepEqual(diffArrays(null, ["a"]), { added: ["a"], removed: [] });
    assert.deepEqual(diffArrays(["a"], undefined), { added: [], removed: ["a"] });
  });
});

// ---------------------------------------------------------------------------
// computeDesiredEmails
// ---------------------------------------------------------------------------
describe("computeDesiredEmails", () => {
  const classroomDoc = {
    id: "c1",
    teacherIds: ["t1", "t2"],
    driveFolderId: "folder1",
  };

  const allUsers = [
    { id: "t1", email: "teacher1@pep.com", role: "teacher" },
    { id: "t2", email: "teacher2@pep.com", role: "teacher" },
    { id: "a1", email: "admin1@pep.com", role: "classroomadmin", manageableClassrooms: ["c1", "c2"] },
    { id: "a2", email: "admin2@pep.com", role: "classroomadmin", manageableClassrooms: ["c3"] },
    { id: "s1", email: "super1@pep.com", role: "superadmin" },
  ];

  it("includes emails of teachers assigned to the classroom", () => {
    const emails = computeDesiredEmails(classroomDoc, allUsers);
    assert.ok(emails.has("teacher1@pep.com"));
    assert.ok(emails.has("teacher2@pep.com"));
  });

  it("includes emails of classroom admins who manage this classroom", () => {
    const emails = computeDesiredEmails(classroomDoc, allUsers);
    assert.ok(emails.has("admin1@pep.com"));
    assert.ok(!emails.has("admin2@pep.com")); // doesn't manage c1
  });

  it("includes emails of all superadmins", () => {
    const emails = computeDesiredEmails(classroomDoc, allUsers);
    assert.ok(emails.has("super1@pep.com"));
  });

  it("deduplicates when a user appears in multiple roles", () => {
    const users = [
      { id: "u1", email: "multi@pep.com", role: "superadmin" },
    ];
    const doc = { id: "c1", teacherIds: ["u1"], driveFolderId: "folder1" };
    const emails = computeDesiredEmails(doc, users);
    // Should contain email exactly once (Set handles dedup)
    assert.equal(emails.size, 1);
    assert.ok(emails.has("multi@pep.com"));
  });

  it("skips users without email", () => {
    const users = [
      { id: "t1", role: "teacher" }, // no email
      { id: "s1", email: "super@pep.com", role: "superadmin" },
    ];
    const doc = { id: "c1", teacherIds: ["t1"], driveFolderId: "folder1" };
    const emails = computeDesiredEmails(doc, users);
    assert.equal(emails.size, 1);
    assert.ok(emails.has("super@pep.com"));
  });

  it("returns empty set when classroom has no teachers and no admins manage it", () => {
    const doc = { id: "c99", teacherIds: [], driveFolderId: "folder1" };
    const users = [
      { id: "a2", email: "admin2@pep.com", role: "classroomadmin", manageableClassrooms: ["c3"] },
    ];
    const emails = computeDesiredEmails(doc, users);
    assert.equal(emails.size, 0);
  });
});

// ---------------------------------------------------------------------------
// buildBulkSyncPlan
// ---------------------------------------------------------------------------
describe("buildBulkSyncPlan", () => {
  it("generates entries only for classrooms with driveFolderId", () => {
    const classrooms = [
      { id: "c1", teacherIds: ["t1"], driveFolderId: "folder1" },
      { id: "c2", teacherIds: ["t2"] }, // no driveFolderId
      { id: "c3", teacherIds: [], driveFolderId: "folder3" },
    ];
    const allUsers = [
      { id: "t1", email: "t1@pep.com", role: "teacher" },
      { id: "t2", email: "t2@pep.com", role: "teacher" },
      { id: "s1", email: "super@pep.com", role: "superadmin" },
    ];

    const plan = buildBulkSyncPlan(classrooms, allUsers);

    assert.equal(plan.length, 2); // c1 and c3 only
    assert.equal(plan[0].classroomId, "c1");
    assert.equal(plan[0].driveFolderId, "folder1");
    assert.ok(plan[0].desiredEmails.has("t1@pep.com"));
    assert.ok(plan[0].desiredEmails.has("super@pep.com"));

    assert.equal(plan[1].classroomId, "c3");
    assert.equal(plan[1].driveFolderId, "folder3");
    assert.ok(plan[1].desiredEmails.has("super@pep.com"));
    assert.ok(!plan[1].desiredEmails.has("t2@pep.com")); // t2 not assigned to c3
  });

  it("returns empty plan when no classrooms have driveFolderId", () => {
    const classrooms = [
      { id: "c1", teacherIds: ["t1"] },
    ];
    const allUsers = [
      { id: "t1", email: "t1@pep.com", role: "teacher" },
    ];
    const plan = buildBulkSyncPlan(classrooms, allUsers);
    assert.equal(plan.length, 0);
  });
});
