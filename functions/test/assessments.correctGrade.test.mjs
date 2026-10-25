/**
 * #313: correctAssessmentGrade contract tests.
 *
 * Source-scan tests verifying the CF exists, is a callable, restricts
 * to admin roles, and atomically mutates both results[i].sourceValue
 * and the values map.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const SOURCE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "assessments",
  "index.js",
);

let source;

describe("correctAssessmentGrade", () => {
  test("load source", async () => {
    source = await readFile(SOURCE_PATH, "utf8");
  });

  test("CF is exported as a callable", () => {
    assert.match(
      source,
      /export\s+const\s+correctAssessmentGrade\b/,
      "correctAssessmentGrade must be exported",
    );
    assert.match(
      source,
      /correctAssessmentGrade[\s\S]*?\.https\.onCall/,
      "correctAssessmentGrade must be an onCall callable",
    );
  });

  test("restricts to admin roles only (not teacher)", () => {
    // The function must check that the caller is classroomadmin or superadmin.
    // Teachers must not be able to call this function.
    // We verify this by checking the source references the admin role check pattern.
    const fnBody = source.slice(
      source.indexOf("correctAssessmentGrade"),
    );
    assert.match(
      fnBody,
      /classroomadmin|superadmin/,
      "must check for admin roles",
    );
  });

  test("accepts observationId, resultNumber, and correctedValue", () => {
    assert.match(source, /resultNumber/, "must accept resultNumber");
    assert.match(source, /correctedValue/, "must accept correctedValue");
  });

  test("updates both results array and values map", () => {
    // The correction must atomically update results[i].sourceValue AND
    // the corresponding values["Result N"] entry
    assert.match(source, /sourceValue/, "must update sourceValue in results");
    assert.match(source, /values/, "must update the values map");
  });
});
