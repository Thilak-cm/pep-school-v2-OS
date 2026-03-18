import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(__dirname, "../index.js"), "utf-8");
const rulesSource = readFileSync(resolve(__dirname, "../../firestore.rules"), "utf-8");

// ──────────────────────────────────────────────────────────
// PEP-54: updateUserWithEmailCheck removal
// ──────────────────────────────────────────────────────────
describe("PEP-54: updateUserWithEmailCheck removal", () => {
  it("should not export updateUserWithEmailCheck", () => {
    assert.ok(
      !indexSource.includes("export const updateUserWithEmailCheck"),
      "updateUserWithEmailCheck should be deleted — it had no role/scope checks and allowed privilege escalation"
    );
  });

  it("should have no references to updateUserWithEmailCheck", () => {
    assert.ok(
      !indexSource.includes("updateUserWithEmailCheck"),
      "No references to updateUserWithEmailCheck should remain in index.js"
    );
  });
});

// ──────────────────────────────────────────────────────────
// PEP-56: createAuthUserAndProfile classroom scope check
// ──────────────────────────────────────────────────────────
describe("PEP-56: createAuthUserAndProfile classroom scope check", () => {
  const fnStart = indexSource.indexOf("export const createAuthUserAndProfile");
  assert.ok(fnStart !== -1, "createAuthUserAndProfile must exist");

  const nextExport = indexSource.indexOf("\nexport const ", fnStart + 1);
  const fnBody = nextExport !== -1
    ? indexSource.slice(fnStart, nextExport)
    : indexSource.slice(fnStart);

  it("should check selectedClassrooms against caller manageableClassrooms", () => {
    assert.ok(
      fnBody.includes("manageableClassrooms"),
      "createAuthUserAndProfile must reference manageableClassrooms for scope validation"
    );
  });

  it("should throw permission-denied when classrooms are out of scope", () => {
    assert.ok(
      fnBody.includes("permission-denied") &&
      fnBody.includes("classrooms you don't manage"),
      "Should throw permission-denied with descriptive message for out-of-scope classrooms"
    );
  });

  it("should only apply scope check to classroomadmin callers", () => {
    assert.ok(
      fnBody.includes("isClassroomAdmin") &&
      fnBody.includes("uniqueSelectedClassrooms"),
      "Scope check must be gated on isClassroomAdmin and check uniqueSelectedClassrooms"
    );
  });

  it("should not block superadmins from assigning any classroom", () => {
    const scopeCheckPattern = /if\s*\(isClassroomAdmin\s*&&\s*uniqueSelectedClassrooms\.length\s*>\s*0\)/;
    assert.ok(
      scopeCheckPattern.test(fnBody),
      "Scope check must be guarded by isClassroomAdmin so superadmins are not affected"
    );
  });
});

// ──────────────────────────────────────────────────────────
// PEP-57: childChat/childChatStream classroom scope check
// ──────────────────────────────────────────────────────────
describe("PEP-57: childChat classroom scope check", () => {
  const fnStart = indexSource.indexOf("export const childChat ");
  assert.ok(fnStart !== -1, "childChat must exist");

  const nextExport = indexSource.indexOf("\nexport const ", fnStart + 1);
  const fnBody = nextExport !== -1
    ? indexSource.slice(fnStart, nextExport)
    : indexSource.slice(fnStart);

  it("should check classroomadmin manageableClassrooms", () => {
    assert.ok(
      fnBody.includes("manageableClassrooms") &&
      fnBody.includes("classroomadmin"),
      "childChat must check manageableClassrooms for classroomadmin callers"
    );
  });

  it("should check teacher membership via teacherIds", () => {
    assert.ok(
      fnBody.includes("teacherIds") &&
      fnBody.includes("teacher"),
      "childChat must check teacherIds for teacher callers"
    );
  });

  it("should throw permission-denied for out-of-scope access", () => {
    assert.ok(
      fnBody.includes("permission-denied") &&
      fnBody.includes("don't have access to this student's classroom"),
      "childChat must throw permission-denied with descriptive error for out-of-scope access"
    );
  });
});

describe("PEP-57: childChatStream classroom scope check", () => {
  const fnStart = indexSource.indexOf("export const childChatStream");
  assert.ok(fnStart !== -1, "childChatStream must exist");

  const nextExport = indexSource.indexOf("\nexport const ", fnStart + 1);
  const fnBody = nextExport !== -1
    ? indexSource.slice(fnStart, nextExport)
    : indexSource.slice(fnStart);

  it("should check classroomadmin manageableClassrooms", () => {
    assert.ok(
      fnBody.includes("manageableClassrooms") &&
      fnBody.includes("classroomadmin"),
      "childChatStream must check manageableClassrooms for classroomadmin callers"
    );
  });

  it("should check teacher membership via teacherIds", () => {
    assert.ok(
      fnBody.includes("teacherIds") &&
      fnBody.includes("teacher"),
      "childChatStream must check teacherIds for teacher callers"
    );
  });

  it("should send error for out-of-scope access", () => {
    assert.ok(
      fnBody.includes("don't have access to this student's classroom"),
      "childChatStream must send error for out-of-scope access"
    );
  });
});

// ──────────────────────────────────────────────────────────
// PEP-55: Firestore rules — teacher read scoping
// ──────────────────────────────────────────────────────────
describe("PEP-55: Firestore rules teacher scoping", () => {
  it("should define teacherBelongsToClassroom helper", () => {
    assert.ok(
      rulesSource.includes("function teacherBelongsToClassroom(classroomId)"),
      "Rules must define teacherBelongsToClassroom function"
    );
  });

  it("teacherBelongsToClassroom should check classroom teacherIds", () => {
    assert.ok(
      rulesSource.includes("teacherIds.hasAny([request.auth.uid])"),
      "teacherBelongsToClassroom must verify uid is in classroom's teacherIds"
    );
  });

  it("should scope students read rule to classroom membership", () => {
    // Students rule should NOT have bare isTeacher() for reads
    // It should use teacherBelongsToClassroom
    const studentsSection = rulesSource.slice(
      rulesSource.indexOf("match /students/{studentId}"),
      rulesSource.indexOf("// Collection group rule")
    );
    assert.ok(
      studentsSection.includes("teacherBelongsToClassroom"),
      "Students read rule must use teacherBelongsToClassroom for teacher scoping"
    );
  });

  it("should scope classrooms read rule to teacher membership", () => {
    const classroomSection = rulesSource.slice(
      rulesSource.indexOf("match /classrooms/{classroomId}"),
      rulesSource.indexOf("match /students/{studentId}")
    );
    assert.ok(
      classroomSection.includes("teacherBelongsToClassroom"),
      "Classrooms read rule must use teacherBelongsToClassroom for teacher scoping"
    );
  });

  it("should scope observations collection group query for teachers", () => {
    const obsGroupSection = rulesSource.slice(
      rulesSource.indexOf("match /{path=**}/observations/{observationId}")
    );
    assert.ok(
      obsGroupSection.includes("teacherCanQueryObservation") ||
      obsGroupSection.includes("teacherBelongsToClassroom"),
      "Observations collection group rule must scope teacher reads"
    );
  });

  it("should scope media collection group query for teachers", () => {
    const mediaGroupSection = rulesSource.slice(
      rulesSource.indexOf("match /{path=**}/media/{mediaId}"),
      rulesSource.indexOf("match /{path=**}/ai_summaries")
    );
    assert.ok(
      mediaGroupSection.includes("teacherBelongsToClassroom"),
      "Media collection group rule must scope teacher reads"
    );
  });

  it("should NOT have bare isTeacher() in student document read rules", () => {
    // Extract the students block (document-level, not collection group)
    const studentsBlock = rulesSource.slice(
      rulesSource.indexOf("match /students/{studentId}"),
      rulesSource.indexOf("// Collection group rule")
    );
    // Find all "allow read" lines in the students block
    const readLines = studentsBlock.split("\n").filter(l => l.includes("allow read:"));
    for (const line of readLines) {
      // A bare isTeacher() means no classroom scoping
      if (line.includes("isTeacher()") && !line.includes("teacherBelongsToClassroom") && !line.includes("teacherCanAccess")) {
        assert.fail(`Found unscoped isTeacher() in student read rule: ${line.trim()}`);
      }
    }
  });
});
