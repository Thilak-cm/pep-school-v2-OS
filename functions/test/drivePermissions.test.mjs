import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldSyncOnClassroomUpdate,
  shouldSyncOnUserUpdate,
  diffArrays,
  computeDesiredEmails,
  buildBulkSyncPlan,
  grantDrivePermission,
  revokeDrivePermission,
  reconcileClassroomPermissions,
  syncTeacherChanges,
  syncUserChanges,
  revokeAllForUser,
} from "../utils/drivePermissions.js";

// ---------------------------------------------------------------------------
// Mock factories for Drive API wrapper tests
// ---------------------------------------------------------------------------

/**
 * Create a mock Google Drive client.
 * @param {object[]} permissionsList - Permissions returned by list()
 * @param {Error|null} createError - Error to throw on create()
 * @returns {object} Mock drive client with call tracking
 */
function mockDrive(permissionsList = [], createError = null) {
  const calls = { create: [], list: [], delete: [] };
  return {
    _calls: calls,
    permissions: {
      create: async (params) => {
        calls.create.push(params);
        if (createError) throw createError;
        return { data: { id: "perm_new" } };
      },
      list: async (params) => {
        calls.list.push(params);
        return { data: { permissions: permissionsList } };
      },
      delete: async (params) => {
        calls.delete.push(params);
      },
    },
  };
}

/**
 * Create a mock Firestore database.
 * @param {object} collections - { collectionName: { docId: docData } }
 * @returns {object} Mock db with collection/doc/get pattern
 */
function mockDb(collections = {}) {
  return {
    collection: (name) => ({
      doc: (id) => ({
        get: async () => {
          const data = collections[name]?.[id];
          return {
            exists: !!data,
            id,
            data: () => data || null,
          };
        },
      }),
      where: (field, op, value) => ({
        get: async () => ({
          docs: Object.entries(collections[name] || {})
            .filter(([, data]) => {
              if (op === "==" && data[field] === value) return true;
              if (op === "!=" && data[field] !== value) return true;
              return false;
            })
            .map(([id, data]) => ({
              id,
              data: () => data,
            })),
        }),
        where: (field2, op2, value2) => ({
          get: async () => ({
            docs: Object.entries(collections[name] || {})
              .filter(([, data]) => {
                let pass = true;
                if (op === "==" && data[field] !== value) pass = false;
                if (op === "!=" && data[field] === value) pass = false;
                if (op2 === "==" && data[field2] !== value2) pass = false;
                if (op2 === "!=" && data[field2] === value2) pass = false;
                return pass;
              })
              .map(([id, data]) => ({
                id,
                data: () => data,
              })),
          }),
        }),
      }),
      get: async () => ({
        docs: Object.entries(collections[name] || {}).map(
          ([id, data]) => ({
            id,
            data: () => data,
          }),
        ),
      }),
    }),
  };
}

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

  it("returns true when driveFolderId is replaced with a different value", () => {
    const before = { teacherIds: ["u1"], driveFolderId: "folder1" };
    const after = { teacherIds: ["u1"], driveFolderId: "folder2" };
    assert.equal(shouldSyncOnClassroomUpdate(before, after), true);
  });

  it("returns false when driveFolderId is removed", () => {
    const before = { teacherIds: ["u1"], driveFolderId: "folder1" };
    const after = { teacherIds: ["u1"] };
    assert.equal(shouldSyncOnClassroomUpdate(before, after), false);
  });

  it("returns true when programId changes while folder exists", () => {
    const before = { teacherIds: ["u1"], driveFolderId: "folder1", programId: "primary" };
    const after = { teacherIds: ["u1"], driveFolderId: "folder1", programId: "elementary" };
    assert.equal(shouldSyncOnClassroomUpdate(before, after), true);
  });

  it("returns false when programId changes but no folder", () => {
    const before = { teacherIds: ["u1"], programId: "primary" };
    const after = { teacherIds: ["u1"], programId: "elementary" };
    assert.equal(shouldSyncOnClassroomUpdate(before, after), false);
  });
});

// ---------------------------------------------------------------------------
// shouldSyncOnUserUpdate
// ---------------------------------------------------------------------------
describe("shouldSyncOnUserUpdate", () => {
  it("returns true when role changes", () => {
    const before = { role: "teacher", email: "a@test.com" };
    const after = { role: "classroomadmin", email: "a@test.com", manageableClassrooms: ["primary"] };
    assert.equal(shouldSyncOnUserUpdate(before, after), true);
  });

  it("returns true when manageableClassrooms changes", () => {
    const before = { role: "classroomadmin", email: "a@test.com", manageableClassrooms: ["primary"] };
    const after = { role: "classroomadmin", email: "a@test.com", manageableClassrooms: ["primary", "elementary"] };
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
    programId: "primary",
    teacherIds: ["t1", "t2"],
    driveFolderId: "folder1",
  };

  const allUsers = [
    { id: "t1", email: "teacher1@pep.com", role: "teacher" },
    { id: "t2", email: "teacher2@pep.com", role: "teacher" },
    { id: "a1", email: "admin1@pep.com", role: "classroomadmin", manageableClassrooms: ["c1", "c3"] },
    { id: "a2", email: "admin2@pep.com", role: "classroomadmin", manageableClassrooms: ["c99"] },
    { id: "s1", email: "super1@pep.com", role: "superadmin" },
  ];

  it("includes emails of teachers assigned to the classroom", () => {
    const emails = computeDesiredEmails(classroomDoc, allUsers);
    assert.ok(emails.has("teacher1@pep.com"));
    assert.ok(emails.has("teacher2@pep.com"));
  });

  it("includes emails of classroom admins who manage this classroom", () => {
    const emails = computeDesiredEmails(classroomDoc, allUsers);
    assert.ok(emails.has("admin1@pep.com")); // manages "c1" (the classroom ID)
    assert.ok(!emails.has("admin2@pep.com")); // manages "c99", not "c1"
  });

  it("includes emails of all superadmins", () => {
    const emails = computeDesiredEmails(classroomDoc, allUsers);
    assert.ok(emails.has("super1@pep.com"));
  });

  it("deduplicates when a user appears in multiple roles", () => {
    const users = [
      { id: "u1", email: "multi@pep.com", role: "superadmin" },
    ];
    const doc = { id: "c1", programId: "primary", teacherIds: ["u1"], driveFolderId: "folder1" };
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
    const doc = { id: "c1", programId: "primary", teacherIds: ["t1"], driveFolderId: "folder1" };
    const emails = computeDesiredEmails(doc, users);
    assert.equal(emails.size, 1);
    assert.ok(emails.has("super@pep.com"));
  });

  it("returns empty set when classroom has no teachers and no admins manage it", () => {
    const doc = { id: "c99", programId: "toddler", teacherIds: [], driveFolderId: "folder1" };
    const users = [
      { id: "a2", email: "admin2@pep.com", role: "classroomadmin", manageableClassrooms: ["adolescent"] },
    ];
    const emails = computeDesiredEmails(doc, users);
    assert.equal(emails.size, 0);
  });

  it("only includes classroomadmins who manage this specific classroom (by classroomId)", () => {
    const classroomDoc = { id: "c1", programId: "primary", teacherIds: [], driveFolderId: "folder1" };
    const users = [
      { id: "a1", email: "admin_c1@pep.com", role: "classroomadmin", manageableClassrooms: ["c1"] },
      { id: "a2", email: "admin_c2@pep.com", role: "classroomadmin", manageableClassrooms: ["c2"] },
    ];
    const emails = computeDesiredEmails(classroomDoc, users);
    assert.ok(emails.has("admin_c1@pep.com"));
    assert.ok(!emails.has("admin_c2@pep.com"));
  });
});

// ---------------------------------------------------------------------------
// buildBulkSyncPlan
// ---------------------------------------------------------------------------
describe("buildBulkSyncPlan", () => {
  it("generates entries only for classrooms with driveFolderId", () => {
    const classrooms = [
      { id: "c1", programId: "primary", teacherIds: ["t1"], driveFolderId: "folder1" },
      { id: "c2", programId: "primary", teacherIds: ["t2"] }, // no driveFolderId
      { id: "c3", programId: "elementary", teacherIds: [], driveFolderId: "folder3" },
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
      { id: "c1", programId: "primary", teacherIds: ["t1"] },
    ];
    const allUsers = [
      { id: "t1", email: "t1@pep.com", role: "teacher" },
    ];
    const plan = buildBulkSyncPlan(classrooms, allUsers);
    assert.equal(plan.length, 0);
  });
});

// ===========================================================================
// Drive API wrapper integration tests (mock-based)
// ===========================================================================

// ---------------------------------------------------------------------------
// grantDrivePermission
// ---------------------------------------------------------------------------
describe("grantDrivePermission", () => {
  it("calls permissions.create with correct params", async () => {
    const drive = mockDrive();
    await grantDrivePermission(drive, "folder_abc", "user@pep.com");

    assert.equal(drive._calls.create.length, 1);
    const call = drive._calls.create[0];
    assert.equal(call.fileId, "folder_abc");
    assert.equal(call.requestBody.type, "user");
    assert.equal(call.requestBody.role, "writer");
    assert.equal(call.requestBody.emailAddress, "user@pep.com");
    assert.equal(call.sendNotificationEmail, false);
    assert.equal(call.supportsAllDrives, true);
  });

  it("silently catches 409 (permission already exists)", async () => {
    const err = new Error("Conflict");
    err.code = 409;
    const drive = mockDrive([], err);

    // Should not throw
    await grantDrivePermission(drive, "folder_abc", "user@pep.com");
  });

  it("rethrows non-409 errors", async () => {
    const err = new Error("Server error");
    err.code = 500;
    const drive = mockDrive([], err);

    await assert.rejects(
      () => grantDrivePermission(drive, "folder_abc", "user@pep.com"),
      (thrown) => thrown.code === 500,
    );
  });
});

// ---------------------------------------------------------------------------
// revokeDrivePermission
// ---------------------------------------------------------------------------
describe("revokeDrivePermission", () => {
  it("lists permissions, finds match by email, and deletes", async () => {
    const perms = [
      { id: "p1", emailAddress: "other@pep.com" },
      { id: "p2", emailAddress: "Target@pep.com" },
    ];
    const drive = mockDrive(perms);

    await revokeDrivePermission(drive, "folder_x", "target@pep.com");

    assert.equal(drive._calls.list.length, 1);
    assert.equal(drive._calls.delete.length, 1);
    assert.equal(drive._calls.delete[0].permissionId, "p2");
    assert.equal(drive._calls.delete[0].fileId, "folder_x");
  });

  it("does nothing when no matching permission is found", async () => {
    const perms = [
      { id: "p1", emailAddress: "other@pep.com" },
    ];
    const drive = mockDrive(perms);

    await revokeDrivePermission(drive, "folder_x", "missing@pep.com");

    assert.equal(drive._calls.list.length, 1);
    assert.equal(drive._calls.delete.length, 0);
  });

  it("handles case-insensitive email matching", async () => {
    const perms = [
      { id: "p1", emailAddress: "USER@PEP.COM" },
    ];
    const drive = mockDrive(perms);

    await revokeDrivePermission(drive, "folder_x", "user@pep.com");

    assert.equal(drive._calls.delete.length, 1);
    assert.equal(drive._calls.delete[0].permissionId, "p1");
  });

  it("handles empty permissions list", async () => {
    const drive = mockDrive([]);

    await revokeDrivePermission(drive, "folder_x", "user@pep.com");

    assert.equal(drive._calls.delete.length, 0);
  });
});

// ---------------------------------------------------------------------------
// reconcileClassroomPermissions
// ---------------------------------------------------------------------------
describe("reconcileClassroomPermissions", () => {
  it("grants missing permissions and revokes excess ones", async () => {
    const existingPerms = [
      { id: "p1", emailAddress: "teacher1@pep.com", role: "writer" },
      { id: "p_extra", emailAddress: "removed@pep.com", role: "writer" },
      { id: "p_owner", emailAddress: "sa@google.com", role: "owner" },
    ];
    const drive = mockDrive(existingPerms);

    const db = mockDb({
      classrooms: {
        c1: {
          programId: "primary",
          teacherIds: ["t1", "t2"],
          driveFolderId: "folder1",
        },
      },
      users: {
        t1: { email: "teacher1@pep.com", role: "teacher" },
        t2: { email: "teacher2@pep.com", role: "teacher" },
        s1: { email: "super@pep.com", role: "superadmin" },
      },
    });

    const result = await reconcileClassroomPermissions(drive, db, "c1");

    // teacher2@pep.com and super@pep.com should be granted (not in existing)
    assert.ok(result.granted.includes("teacher2@pep.com"));
    assert.ok(result.granted.includes("super@pep.com"));

    // removed@pep.com should be revoked (not in desired set)
    assert.ok(result.revoked.includes("removed@pep.com"));

    // owner permission should NOT be revoked
    const deletedIds = drive._calls.delete.map((c) => c.permissionId);
    assert.ok(!deletedIds.includes("p_owner"));
  });

  it("returns empty result when classroom does not exist", async () => {
    const drive = mockDrive();
    const db = mockDb({ classrooms: {} });

    const result = await reconcileClassroomPermissions(drive, db, "missing");
    assert.deepEqual(result, { granted: [], revoked: [] });
  });

  it("returns empty result when classroom has no driveFolderId", async () => {
    const drive = mockDrive();
    const db = mockDb({
      classrooms: { c1: { programId: "primary", teacherIds: ["t1"] } },
    });

    const result = await reconcileClassroomPermissions(drive, db, "c1");
    assert.deepEqual(result, { granted: [], revoked: [] });
  });

  it("skips organizer permissions during revocation", async () => {
    const existingPerms = [
      { id: "p_org", emailAddress: "org@pep.com", role: "organizer" },
    ];
    const drive = mockDrive(existingPerms);

    const db = mockDb({
      classrooms: { c1: { programId: "primary", teacherIds: [], driveFolderId: "folder1" } },
      users: {},
    });

    const result = await reconcileClassroomPermissions(drive, db, "c1");

    // organizer should not be revoked
    assert.equal(drive._calls.delete.length, 0);
    assert.deepEqual(result.revoked, []);
  });
});

// ---------------------------------------------------------------------------
// syncTeacherChanges
// ---------------------------------------------------------------------------
describe("syncTeacherChanges", () => {
  it("grants permissions for added teachers", async () => {
    const drive = mockDrive();
    const db = mockDb({
      users: {
        t_new: { email: "new_teacher@pep.com", role: "teacher" },
      },
    });

    const result = await syncTeacherChanges(
      drive, db, "folder1", ["t_new"], [],
    );

    assert.equal(result.granted.length, 1);
    assert.equal(result.granted[0], "new_teacher@pep.com");
    assert.equal(drive._calls.create.length, 1);
  });

  it("revokes permissions for removed teachers", async () => {
    const perms = [
      { id: "p1", emailAddress: "old_teacher@pep.com" },
    ];
    const drive = mockDrive(perms);
    const db = mockDb({
      users: {
        t_old: { email: "old_teacher@pep.com", role: "teacher" },
      },
    });

    const result = await syncTeacherChanges(
      drive, db, "folder1", [], ["t_old"],
    );

    assert.equal(result.revoked.length, 1);
    assert.equal(result.revoked[0], "old_teacher@pep.com");
  });

  it("skips users that do not exist in Firestore", async () => {
    const drive = mockDrive();
    const db = mockDb({ users: {} });

    const result = await syncTeacherChanges(
      drive, db, "folder1", ["ghost"], [],
    );

    assert.equal(result.granted.length, 0);
    assert.equal(drive._calls.create.length, 0);
  });

  it("skips users without an email address", async () => {
    const drive = mockDrive();
    const db = mockDb({
      users: { t1: { role: "teacher" } }, // no email
    });

    const result = await syncTeacherChanges(
      drive, db, "folder1", ["t1"], [],
    );

    assert.equal(result.granted.length, 0);
    assert.equal(drive._calls.create.length, 0);
  });

  it("accumulates errors without stopping", async () => {
    const err = new Error("Drive API error");
    err.code = 500;
    const drive = mockDrive([], err);
    const db = mockDb({
      users: {
        t1: { email: "t1@pep.com", role: "teacher" },
        t2: { email: "t2@pep.com", role: "teacher" },
      },
    });

    const result = await syncTeacherChanges(
      drive, db, "folder1", ["t1", "t2"], [],
    );

    assert.equal(result.errors.length, 2);
    assert.equal(result.granted.length, 0);
  });

  it("skips revocation for superadmins removed from teacherIds", async () => {
    const perms = [{ id: "p1", emailAddress: "super@pep.com" }];
    const drive = mockDrive(perms);
    const db = mockDb({
      users: {
        sa1: { email: "super@pep.com", role: "superadmin" },
      },
    });

    const result = await syncTeacherChanges(
      drive, db, "folder1", [], ["sa1"], "primary",
    );

    assert.equal(result.revoked.length, 0);
    assert.equal(drive._calls.list.length, 0); // no revoke attempt
  });

  it("skips revocation for classroomadmins who manage this classroom", async () => {
    const perms = [{ id: "p1", emailAddress: "admin@pep.com" }];
    const drive = mockDrive(perms);
    const db = mockDb({
      users: {
        ca1: { email: "admin@pep.com", role: "classroomadmin", manageableClassrooms: ["allstars", "periwinkle"] },
      },
    });

    const result = await syncTeacherChanges(
      drive, db, "folder1", [], ["ca1"], "allstars",
    );

    assert.equal(result.revoked.length, 0);
    assert.equal(drive._calls.list.length, 0);
  });

  it("revokes classroomadmin who does NOT manage this classroom", async () => {
    const perms = [{ id: "p1", emailAddress: "admin@pep.com" }];
    const drive = mockDrive(perms);
    const db = mockDb({
      users: {
        ca1: { email: "admin@pep.com", role: "classroomadmin", manageableClassrooms: ["periwinkle"] },
      },
    });

    const result = await syncTeacherChanges(
      drive, db, "folder1", [], ["ca1"], "allstars",
    );

    assert.equal(result.revoked.length, 1);
    assert.equal(result.revoked[0], "admin@pep.com");
  });
});

// ---------------------------------------------------------------------------
// syncUserChanges
// ---------------------------------------------------------------------------
describe("syncUserChanges", () => {
  it("grants access when classroomadmin gains new classrooms", async () => {
    const drive = mockDrive();
    const db = mockDb({
      classrooms: {
        allstars: { programId: "primary", driveFolderId: "folder2", teacherIds: [] },
        periwinkle: { programId: "primary", driveFolderId: "folder3", teacherIds: [] },
      },
    });

    const before = {
      role: "classroomadmin",
      email: "admin@pep.com",
      manageableClassrooms: ["plumeria"],
    };
    const after = {
      role: "classroomadmin",
      email: "admin@pep.com",
      manageableClassrooms: ["plumeria", "allstars", "periwinkle"],
    };

    const result = await syncUserChanges(drive, db, before, after, "admin1");

    // Both allstars and periwinkle should get granted
    assert.equal(result.granted.length, 2);
    assert.ok(result.granted[0].includes("allstars"));
    assert.ok(result.granted[1].includes("periwinkle"));
  });

  it("revokes access when classroomadmin loses a classroom", async () => {
    const perms = [{ id: "p1", emailAddress: "admin@pep.com" }];
    const drive = mockDrive(perms);
    const db = mockDb({
      classrooms: {
        allstars: { programId: "primary", driveFolderId: "folder1", teacherIds: [] },
      },
    });

    const before = {
      role: "classroomadmin",
      email: "admin@pep.com",
      manageableClassrooms: ["allstars", "periwinkle"],
    };
    const after = {
      role: "classroomadmin",
      email: "admin@pep.com",
      manageableClassrooms: ["periwinkle"],
    };

    const result = await syncUserChanges(drive, db, before, after, "admin1");

    assert.equal(result.revoked.length, 1);
    assert.ok(result.revoked[0].includes("allstars"));
  });

  it("returns empty result when user has no email", async () => {
    const drive = mockDrive();
    const db = mockDb({});

    const before = { role: "teacher" };
    const after = { role: "classroomadmin", manageableClassrooms: ["allstars"] };

    const result = await syncUserChanges(drive, db, before, after, "user1");

    assert.deepEqual(result, { granted: [], revoked: [], errors: [] });
  });

  it("grants all folders when user is promoted to superadmin", async () => {
    const drive = mockDrive();
    const db = mockDb({
      classrooms: {
        c1: { programId: "primary", driveFolderId: "folder1", teacherIds: [] },
        c2: { programId: "elementary", driveFolderId: "folder2", teacherIds: [] },
      },
    });

    const before = { role: "teacher", email: "user@pep.com" };
    const after = { role: "superadmin", email: "user@pep.com" };

    const result = await syncUserChanges(drive, db, before, after, "user1");

    assert.equal(result.granted.length, 2);
    assert.equal(drive._calls.create.length, 2);
  });

  it("keeps access when superadmin demoted to teacher who is in teacherIds", async () => {
    const perms = [{ id: "p1", emailAddress: "user@pep.com" }];
    const drive = mockDrive(perms);
    const db = mockDb({
      classrooms: {
        c1: { programId: "primary", driveFolderId: "folder1", teacherIds: ["user1"] },
        c2: { programId: "elementary", driveFolderId: "folder2", teacherIds: [] },
      },
    });

    const before = { role: "superadmin", email: "user@pep.com" };
    const after = { role: "teacher", email: "user@pep.com" };

    const result = await syncUserChanges(drive, db, before, after, "user1");

    // c1: user is in teacherIds → keep access (no revoke)
    // c2: user is NOT in teacherIds → revoke
    assert.equal(result.revoked.length, 1);
    assert.ok(result.revoked[0].includes("c2"));
    // Only 1 delete call (for c2), not 2
    assert.equal(drive._calls.delete.length, 1);
  });
});

// ---------------------------------------------------------------------------
// revokeAllForUser
// ---------------------------------------------------------------------------
describe("revokeAllForUser", () => {
  it("revokes permissions across all classroom folders", async () => {
    const perms = [
      { id: "p1", emailAddress: "deleted@pep.com" },
    ];
    const drive = mockDrive(perms);
    const db = mockDb({
      classrooms: {
        c1: { driveFolderId: "folder1" },
        c2: { driveFolderId: "folder2" },
      },
    });

    const result = await revokeAllForUser(drive, db, {
      email: "deleted@pep.com",
      role: "superadmin",
    });

    assert.equal(result.revoked.length, 2);
    assert.ok(result.revoked.includes("c1"));
    assert.ok(result.revoked.includes("c2"));
    // Should have listed + deleted for each classroom
    assert.equal(drive._calls.list.length, 2);
    assert.equal(drive._calls.delete.length, 2);
  });

  it("returns empty result when user has no email", async () => {
    const drive = mockDrive();
    const db = mockDb({});

    const result = await revokeAllForUser(drive, db, { role: "superadmin" });

    assert.deepEqual(result, { revoked: [], errors: [] });
    assert.equal(drive._calls.list.length, 0);
  });

  it("accumulates errors without stopping", async () => {
    // Create a drive mock that throws on list
    const calls = { create: [], list: [], delete: [] };
    const drive = {
      _calls: calls,
      permissions: {
        create: async (params) => { calls.create.push(params); },
        list: async (params) => {
          calls.list.push(params);
          throw new Error("Drive list error");
        },
        delete: async (params) => { calls.delete.push(params); },
      },
    };

    const db = mockDb({
      classrooms: {
        c1: { driveFolderId: "folder1" },
        c2: { driveFolderId: "folder2" },
      },
    });

    const result = await revokeAllForUser(drive, db, {
      email: "deleted@pep.com",
      role: "superadmin",
    });

    assert.equal(result.errors.length, 2);
    assert.equal(result.revoked.length, 0);
  });

  it("skips classrooms without a driveFolderId value", async () => {
    const drive = mockDrive();
    // c2 has null driveFolderId — filtered by mockDb where() and code guard
    const db = mockDb({
      classrooms: {
        c1: { driveFolderId: "folder1" },
        c2: { driveFolderId: null },
      },
    });

    const result = await revokeAllForUser(drive, db, {
      email: "deleted@pep.com",
      role: "superadmin",
    });

    // c2 has null driveFolderId, so the code's `if (!folderId) continue`
    // means only c1 is processed
    assert.equal(result.revoked.length, 1);
    assert.ok(result.revoked.includes("c1"));
  });
});
