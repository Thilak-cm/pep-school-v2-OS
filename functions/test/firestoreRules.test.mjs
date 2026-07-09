/**
 * Structural tests for firestore.rules.
 *
 * These tests parse the rules file as text and assert that the access
 * contract invariants hold. They catch accidental regressions like
 * "teachers lost read access to observations" before rules deploy.
 *
 * NOT a substitute for the Firebase emulator rules test suite — these
 * are fast, structural, and run in CI on every PR.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rulesPath = resolve(__dirname, "..", "..", "firestore.rules");

let rules;

/**
 * Extract the body of a `match /path` block (handles nested braces).
 * Returns the content between the outermost { } of the first match.
 */
function extractMatchBlock(source, matchPattern) {
  const idx = source.indexOf(matchPattern);
  if (idx === -1) return null;

  const start = source.indexOf("{", idx + matchPattern.length);
  if (start === -1) return null;

  let depth = 1;
  let i = start + 1;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }

  return source.slice(start + 1, i - 1);
}

before(async () => {
  rules = await readFile(rulesPath, "utf8");
});

// ─── Helper functions ──────────────────────────────────────────────

describe("firestore.rules: helper functions exist", () => {
  it("defines isSignedIn()", () => {
    assert.match(rules, /function isSignedIn\(\)/);
  });

  it("defines isSuperAdmin()", () => {
    assert.match(rules, /function isSuperAdmin\(\)/);
  });

  it("defines isClassroomAdmin()", () => {
    assert.match(rules, /function isClassroomAdmin\(\)/);
  });

  it("defines isPrivilegedAdmin()", () => {
    assert.match(rules, /function isPrivilegedAdmin\(\)/);
  });

  it("defines isTeacher()", () => {
    assert.match(rules, /function isTeacher\(\)/);
  });

  it("defines isTeacherInClassroom()", () => {
    assert.match(rules, /function isTeacherInClassroom\(/);
  });

  it("defines managesClassroom()", () => {
    assert.match(rules, /function managesClassroom\(/);
  });

  it("defines hasManageableClassroom()", () => {
    assert.match(rules, /function hasManageableClassroom\(/);
  });
});

// ─── Teacher access contract ──────────────────────────────────────

describe("firestore.rules: teacher access contract", () => {
  it("teachers can read observations in their classrooms", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    assert.ok(block, "students match block must exist");
    const obsBlock = extractMatchBlock(block, "match /observations/{observationId}");
    assert.ok(obsBlock, "observations match block must exist");
    assert.match(
      obsBlock,
      /allow read:.*isTeacherInClassroom/,
      "observations must grant read access to teachers in the classroom",
    );
  });

  it("teachers can create observations in their classrooms", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    const obsBlock = extractMatchBlock(block, "match /observations/{observationId}");
    assert.ok(obsBlock);
    assert.match(
      obsBlock,
      /allow create:.*isTeacherInClassroom/,
      "observations must grant create access to teachers in the classroom",
    );
  });

  it("teachers can read media in their classrooms", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    const mediaBlock = extractMatchBlock(block, "match /media/{mediaId}");
    assert.ok(mediaBlock, "media match block must exist");
    assert.match(
      mediaBlock,
      /allow read:.*isTeacherInClassroom/,
      "media must grant read access to teachers in the classroom",
    );
  });

  it("teachers can create media in their classrooms", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    const mediaBlock = extractMatchBlock(block, "match /media/{mediaId}");
    assert.ok(mediaBlock);
    assert.match(
      mediaBlock,
      /allow create:.*isTeacherInClassroom/,
      "media must grant create access to teachers in the classroom",
    );
  });

  it("teachers can read chats in their classrooms", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    const chatBlock = extractMatchBlock(block, "match /chats/{chatId}");
    assert.ok(chatBlock, "chats match block must exist");
    assert.match(
      chatBlock,
      /allow read:.*isTeacherInClassroom/,
      "chats must grant read access to teachers in the classroom",
    );
  });

  it("teachers can read chat messages in their classrooms", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    const chatBlock = extractMatchBlock(block, "match /chats/{chatId}");
    assert.ok(chatBlock);
    const msgBlock = extractMatchBlock(chatBlock, "match /messages/{messageId}");
    assert.ok(msgBlock, "messages match block must exist");
    assert.match(
      msgBlock,
      /allow read:.*isTeacherInClassroom/,
      "messages must grant read access to teachers in the classroom",
    );
  });

  it("teachers can read AI summaries in their classrooms", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    const aiBlock = extractMatchBlock(block, "match /ai_summaries/{summaryId}");
    assert.ok(aiBlock, "ai_summaries match block must exist");
    assert.match(
      aiBlock,
      /allow read:.*isTeacherInClassroom/,
      "ai_summaries must grant read access to teachers in the classroom",
    );
  });

  it("teachers can read students in their classrooms (get)", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    assert.ok(block);
    // allow get spans multiple lines - use multiline dotall
    assert.match(
      block,
      /allow get:[\s\S]*?isTeacherInClassroom/,
      "students must grant get access to teachers in the classroom",
    );
  });

  it("teachers can list students", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    assert.ok(block);
    assert.match(
      block,
      /allow list:.*isTeacher\(\)/,
      "students must grant list access to teachers",
    );
  });

  it("teachers can read classrooms they are assigned to (get)", () => {
    const block = extractMatchBlock(rules, "match /classrooms/{classroomId}");
    assert.ok(block, "classrooms match block must exist");
    assert.match(
      block,
      /allow get:.*isTeacher\(\).*teacherIds/s,
      "classrooms must grant get access to teachers in teacherIds",
    );
  });

  it("teachers can list classrooms", () => {
    const block = extractMatchBlock(rules, "match /classrooms/{classroomId}");
    assert.ok(block);
    assert.match(
      block,
      /allow list:.*isTeacher\(\)/,
      "classrooms must grant list access to teachers",
    );
  });

  it("teacher observation edits are time-limited to 48 hours", () => {
    assert.match(
      rules,
      /duration\.value\(48,\s*'h'\)/,
      "author action window must be 48 hours",
    );
  });

  it("teacher observation edits cannot change type, createdBy, createdAt, studentId", () => {
    const block = extractMatchBlock(rules, "match /observations/{observationId}");
    assert.ok(block);
    // The authorCanEditObservation function must enforce immutability
    assert.match(block, /request\.resource\.data\.type == resource\.data\.type/,
      "observation type must be immutable on author edit");
    assert.match(block, /request\.resource\.data\.createdBy == resource\.data\.createdBy/,
      "observation createdBy must be immutable on author edit");
    assert.match(block, /request\.resource\.data\.createdAt == resource\.data\.createdAt/,
      "observation createdAt must be immutable on author edit");
    assert.match(block, /request\.resource\.data\.studentId == resource\.data\.studentId/,
      "observation studentId must be immutable on author edit");
  });
});

// ─── Teacher self-update restrictions ─────────────────────────────

describe("firestore.rules: teacher self-update restrictions", () => {
  it("self-update cannot change role", () => {
    const block = extractMatchBlock(rules, "match /users/{uid}");
    assert.ok(block, "users match block must exist");
    assert.match(
      block,
      /request\.resource\.data\.role == resource\.data\.role/,
      "self-update must enforce role immutability",
    );
  });

  it("self-update uses affectedKeys().hasOnly() allowlist", () => {
    const block = extractMatchBlock(rules, "match /users/{uid}");
    assert.ok(block);
    assert.match(
      block,
      /affectedKeys\(\)\.hasOnly\(\[/,
      "self-update must restrict to an allowlisted set of fields",
    );
  });
});

// ─── Classroom admin scoping ──────────────────────────────────────

describe("firestore.rules: classroom admin scoping", () => {
  it("classroomadmin student create requires managesClassroom", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    assert.ok(block);
    // allow create spans multiple lines - classroomadmin branch uses managesClassroom
    assert.match(
      block,
      /allow create:[\s\S]*?isClassroomAdmin\(\) && managesClassroom/,
      "student create by classroomadmin must check managesClassroom",
    );
  });

  it("classroomadmin student update requires managesClassroom on both old and new classroom", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    assert.ok(block);
    // Must check both the request (new) and resource (old) classrooms
    assert.match(
      block,
      /allow update:.*managesClassroom\(requestClassroomForStudent\(\)\).*managesClassroom\(existingClassroomForStudent\(\)\)/s,
      "student update must check managesClassroom on both source and destination classrooms",
    );
  });

  it("classroomadmin creation enforces manageableClassrooms is non-empty", () => {
    assert.match(
      rules,
      /function requiresManageableClassrooms/,
      "requiresManageableClassrooms helper must exist",
    );
    assert.match(
      rules,
      /manageableClassrooms\.size\(\) > 0/,
      "must enforce manageableClassrooms is non-empty for classroomadmin",
    );
  });
});

// ─── CF-only collections (no client writes) ───────────────────────

describe("firestore.rules: CF-only collections", () => {
  it("statsCache has allow write: if false", () => {
    const block = extractMatchBlock(rules, "match /statsCache/{docId}");
    assert.ok(block, "statsCache match block must exist");
    assert.match(
      block,
      /allow write:\s*if false/,
      "statsCache must block all client-side writes",
    );
  });

  it("digests have allow write: if false", () => {
    const classroomBlock = extractMatchBlock(rules, "match /classrooms/{classroomId}");
    assert.ok(classroomBlock);
    const digestBlock = extractMatchBlock(classroomBlock, "match /digests/{digestId}");
    assert.ok(digestBlock, "digests match block must exist");
    assert.match(
      digestBlock,
      /allow write:\s*if false/,
      "digests must block all client-side writes",
    );
  });

  it("interviews have allow create, update, delete: if false", () => {
    const block = extractMatchBlock(rules, "match /students/{studentId}");
    assert.ok(block);
    const interviewBlock = extractMatchBlock(block, "match /interviews/{interviewId}");
    assert.ok(interviewBlock, "interviews match block must exist");
    assert.match(
      interviewBlock,
      /allow create, update, delete:\s*if false/,
      "interviews must block all client-side writes",
    );
  });
});

// ─── Config collection ────────────────────────────────────────────

describe("firestore.rules: config collection", () => {
  it("config writes are gated to superadmin only", () => {
    const block = extractMatchBlock(rules, "match /config/{docId}");
    assert.ok(block, "config match block must exist");
    assert.match(
      block,
      /allow create, update, delete:\s*if isSuperAdmin\(\)/,
      "config writes must be restricted to superadmin",
    );
    // Must NOT allow classroomadmin or teacher writes
    assert.doesNotMatch(
      block,
      /allow (create|update|delete):.*isClassroomAdmin\(\)/,
      "config writes must NOT be allowed for classroomadmin",
    );
  });

  it("config reads are allowed for all signed-in users", () => {
    const block = extractMatchBlock(rules, "match /config/{docId}");
    assert.ok(block);
    assert.match(
      block,
      /allow read:\s*if isSignedIn\(\)/,
      "config must be readable by all signed-in users",
    );
  });
});

// ─── Placement invariants ─────────────────────────────────────────

describe("firestore.rules: placement invariants", () => {
  it("placement create requires classroomId and startDate", () => {
    const studentsBlock = extractMatchBlock(rules, "match /students/{studentId}");
    const placementBlock = extractMatchBlock(studentsBlock, "match /placements/{placementId}");
    assert.ok(placementBlock, "placements match block must exist");
    assert.match(
      placementBlock,
      /hasAll\(\['classroomId','startDate'\]\)/,
      "placement create must require classroomId and startDate",
    );
  });

  it("placement update cannot change startDate or classroomId", () => {
    const studentsBlock = extractMatchBlock(rules, "match /students/{studentId}");
    const placementBlock = extractMatchBlock(studentsBlock, "match /placements/{placementId}");
    assert.ok(placementBlock);
    assert.match(
      placementBlock,
      /request\.resource\.data\.startDate == resource\.data\.startDate/,
      "placement startDate must be immutable on update",
    );
    assert.match(
      placementBlock,
      /request\.resource\.data\.classroomId == resource\.data\.classroomId/,
      "placement classroomId must be immutable on update",
    );
  });
});

// ─── Default deny ─────────────────────────────────────────────────

describe("firestore.rules: default deny", () => {
  it("has a default deny catch-all as the last rule", () => {
    assert.match(
      rules,
      /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;?\s*\}/,
      "must have a default deny catch-all rule: match /{document=**} { allow read, write: if false }",
    );
  });
});

// ─── Collection group queries ─────────────────────────────────────

describe("firestore.rules: collection group access", () => {
  it("observations collection group grants teacher read via classroomId", () => {
    const block = extractMatchBlock(rules, "match /{path=**}/observations/{observationId}");
    assert.ok(block, "observations collection group rule must exist");
    assert.match(
      block,
      /allow read:[\s\S]*?isTeacher\(\)/,
      "observations collection group must grant read to teachers",
    );
  });

  it("media collection group grants teacher read via classroomId", () => {
    const block = extractMatchBlock(rules, "match /{path=**}/media/{mediaId}");
    assert.ok(block, "media collection group rule must exist");
    assert.match(
      block,
      /allow read:[\s\S]*?isTeacher\(\)/,
      "media collection group must grant read to teachers",
    );
  });

  it("ai_summaries collection group grants teacher read", () => {
    const block = extractMatchBlock(rules, "match /{path=**}/ai_summaries/{summaryId}");
    assert.ok(block, "ai_summaries collection group rule must exist");
    assert.match(
      block,
      /allow read:[\s\S]*?isTeacher\(\)/,
      "ai_summaries collection group must grant read to teachers",
    );
  });
});
