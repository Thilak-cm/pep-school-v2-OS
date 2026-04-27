import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Verify the barrel file re-exports every Cloud Function from domain modules.
// This catches wiring errors after modularization (PEP-169).

const EXPECTED_EXPORTS = [
  // Auth
  "createAuthUserAndProfile",
  "updateUserProfileIfExists",
  "updateUserWithEmailCheck",
  "migratePendingUser",
  // Media
  "suggestPdfTitle",
  "extractPdfEssence",
  "analyzePhotoVLM",
  "detectHandwritingVLM",
  "mediaFinalize",
  "mediaCleanup",
  // AI
  "aiTextCleanup",
  "aiWhisperTranscribe",
  "aiWhisperTranslate",
  "aiCoachReview",
  "previewBaseballCard",
  "regenerateBaseballCardForStudent",
  "generateBaseballCards",
  "batchAnalyzeWriting",
  // Chat
  "childChat",
  "childChatStream",
  "cleanupDeletedChats",
  // Reports
  "generateStudentReport",
  "previewStudentReport",
  "exportReportToDrive",
  "checkReportReadiness",
  "deleteStudentReport",
  // Classroom
  "onClassroomUpdate",
  "onUserUpdate",
  "onUserDelete",
  "bulkSyncDrivePermissions",
  // Student Soul
  "generateStudentProfile",
  "backfillStudentProfiles",
  // Test Bench
  "testBenchRun",
];

describe("barrel file (functions/index.js)", () => {
  let barrel;

  test("barrel module loads without errors", async () => {
    barrel = await import("../index.js");
    assert.ok(barrel, "barrel module should load");
  });

  test("exports every expected Cloud Function", async () => {
    if (!barrel) barrel = await import("../index.js");
    const missing = EXPECTED_EXPORTS.filter((name) => !(name in barrel));
    assert.equal(missing.length, 0, `Missing exports: ${missing.join(", ")}`);
  });

  test("every export is a Cloud Function (has __trigger or run)", async () => {
    if (!barrel) barrel = await import("../index.js");
    for (const name of EXPECTED_EXPORTS) {
      const fn = barrel[name];
      // Firebase Cloud Functions v1 expose a __trigger property or are callable with run()
      const isFunction = typeof fn === "function" || (fn && typeof fn.run === "function") || (fn && fn.__trigger);
      assert.ok(isFunction, `${name} should be a Cloud Function, got ${typeof fn}`);
    }
  });

  test("barrel has no unexpected exports (no business logic leaking)", async () => {
    if (!barrel) barrel = await import("../index.js");
    const actualExports = Object.keys(barrel).filter((k) => !k.startsWith("__"));
    const unexpected = actualExports.filter((name) => !EXPECTED_EXPORTS.includes(name));
    assert.equal(unexpected.length, 0, `Unexpected exports in barrel: ${unexpected.join(", ")}`);
  });
});
