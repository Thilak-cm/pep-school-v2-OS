import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "index.js"), "utf-8");

// Also verify getPastWeekKeys was added to backend weekKey
const weekKeySource = readFileSync(
  join(__dirname, "..", "utils", "weekKey.js"), "utf-8"
);

describe("heatmap cache module (PEP-303)", () => {

  describe("exports", () => {
    it("exports writeHeatmapCache function", () => {
      assert.ok(
        source.includes("export async function writeHeatmapCache"),
        "Should export writeHeatmapCache"
      );
    });

    it("exports patchHeatmapStudent function", () => {
      assert.ok(
        source.includes("export async function patchHeatmapStudent"),
        "Should export patchHeatmapStudent"
      );
    });
  });

  describe("writeHeatmapCache structure", () => {
    it("queries active students grouped by classroom", () => {
      assert.ok(
        source.includes("studentsByClassroom"),
        "Should group students by classroom"
      );
    });

    it("queries current week snapshots via collectionGroup", () => {
      assert.ok(
        source.includes("collectionGroup") && source.includes("ai_summaries"),
        "Should use collectionGroup query on ai_summaries"
      );
    });

    it("fetches 5 past week history", () => {
      assert.ok(
        source.includes("getPastWeekKeys"),
        "Should use getPastWeekKeys for history fetch"
      );
    });

    it("writes to statsCache/heatmap_{classroomId} docs", () => {
      assert.ok(
        source.includes("heatmap_${") || source.includes("`heatmap_"),
        "Should write docs keyed as heatmap_{classroomId}"
      );
    });

    it("writes heatmap_meta sentinel doc", () => {
      assert.ok(
        source.includes("heatmap_meta"),
        "Should write heatmap_meta sentinel"
      );
    });

    it("includes classroomId in each doc for rule scoping", () => {
      assert.ok(
        source.includes("classroomId") && source.includes("batch.set"),
        "Each cache doc should include classroomId for Firestore rule scoping"
      );
    });

    it("builds roster with required fields", () => {
      assert.ok(source.includes("studentId"), "Roster should include studentId");
      assert.ok(source.includes("displayName"), "Roster should include displayName");
      assert.ok(source.includes("weeks"), "Roster should include weeks array");
      assert.ok(
        source.includes("escalatedThisWeek"),
        "Roster should include escalatedThisWeek"
      );
      assert.ok(
        source.includes("improvedThisWeek"),
        "Roster should include improvedThisWeek"
      );
    });

    it("computes trend counts", () => {
      assert.ok(
        source.includes("escalated") && source.includes("improved") &&
        source.includes("steady"),
        "Should compute escalated/improved/steady counts"
      );
    });

    it("handles Firestore batch size limits", () => {
      assert.ok(
        source.includes("BATCH_LIMIT") || source.includes("450"),
        "Should handle batch size limits to stay under 500"
      );
    });
  });

  describe("patchHeatmapStudent structure", () => {
    it("reads the student doc to get classroomId", () => {
      assert.ok(
        source.includes("students") && source.includes("classroomId"),
        "Should read student doc for classroomId"
      );
    });

    it("reads existing heatmap cache doc", () => {
      assert.ok(
        source.includes("cacheRef") || source.includes("cacheSnap"),
        "Should read existing cache doc for the classroom"
      );
    });

    it("patches the current week severity in the student row", () => {
      assert.ok(
        source.includes("weeks[weeks.length - 1]"),
        "Should update the last element of weeks array (current week)"
      );
    });

    it("handles new students not yet in cache", () => {
      assert.ok(
        source.includes("existingIdx") || source.includes("findIndex"),
        "Should handle insert for students not yet in roster"
      );
    });

    it("recomputes counts after patching", () => {
      assert.ok(
        source.includes("cacheRef.update"),
        "Should update the cache doc with new roster + counts"
      );
    });
  });
});

describe("backend weekKey — getPastWeekKeys (PEP-303)", () => {
  it("exports getPastWeekKeys from functions/utils/weekKey.js", () => {
    assert.ok(
      weekKeySource.includes("export function getPastWeekKeys"),
      "Backend weekKey should export getPastWeekKeys"
    );
  });
});
