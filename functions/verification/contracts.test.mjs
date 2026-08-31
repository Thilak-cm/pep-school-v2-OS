/**
 * Tests for verification contract predicates (#229).
 *
 * Run with: node --test functions/verification/contracts.test.mjs
 *
 * Tests only the pure predicate functions (no Firestore).
 * The CONTRACTS registry is tested via integration/manual testing.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Import pure predicates directly (they have no Firebase dependency)
import {
  verifyBaseballCard,
  verifyWritingAnalysis,
  verifySoul,
  verifyMonthlyPlan,
  verifyDigest,
  verifyDeletion,
} from "./contracts.js";

const EXEC_START = new Date("2026-08-31T18:30:00Z"); // IST Sun midnight

describe("verifyBaseballCard", () => {
  test("passes for valid current-period doc with status ok", () => {
    const data = {
      weekKey: "2026-W35",
      generatedAt: new Date("2026-09-01T00:00:00Z"),
      status: "ok",
      summary: "Student shows progress...",
    };
    assert.deepEqual(verifyBaseballCard(data, "2026-W35", EXEC_START), { pass: true });
  });

  test("passes for no_notes status (valid outcome)", () => {
    const data = {
      weekKey: "2026-W35",
      generatedAt: new Date("2026-09-01T00:00:00Z"),
      status: "no_notes",
    };
    assert.deepEqual(verifyBaseballCard(data, "2026-W35", EXEC_START), { pass: true });
  });

  test("fails when doc is null (missing)", () => {
    const result = verifyBaseballCard(null, "2026-W35", EXEC_START);
    assert.equal(result.pass, false);
    assert.equal(result.reason, "doc_missing");
  });

  test("fails when weekKey is stale", () => {
    const data = {
      weekKey: "2026-W34",
      generatedAt: new Date("2026-08-25T00:00:00Z"),
      status: "ok",
      summary: "old",
    };
    const result = verifyBaseballCard(data, "2026-W35", EXEC_START);
    assert.equal(result.pass, false);
    assert.ok(result.reason.includes("stale_period"));
  });

  test("fails when generatedAt is before execution start", () => {
    const data = {
      weekKey: "2026-W35",
      generatedAt: new Date("2026-08-30T00:00:00Z"), // before EXEC_START
      status: "ok",
      summary: "text",
    };
    const result = verifyBaseballCard(data, "2026-W35", EXEC_START);
    assert.equal(result.pass, false);
    assert.equal(result.reason, "generatedAt_before_execution");
  });

  test("fails when ok but empty summary", () => {
    const data = {
      weekKey: "2026-W35",
      generatedAt: new Date("2026-09-01T00:00:00Z"),
      status: "ok",
      summary: "",
    };
    const result = verifyBaseballCard(data, "2026-W35", EXEC_START);
    assert.equal(result.pass, false);
    assert.equal(result.reason, "ok_but_empty_summary");
  });

  test("handles Firestore Timestamp with toDate()", () => {
    const data = {
      weekKey: "2026-W35",
      generatedAt: { toDate: () => new Date("2026-09-01T00:00:00Z") },
      status: "ok",
      summary: "text",
    };
    assert.deepEqual(verifyBaseballCard(data, "2026-W35", EXEC_START), { pass: true });
  });
});

describe("verifyWritingAnalysis", () => {
  test("passes for completed status with matching periodKey", () => {
    assert.deepEqual(
      verifyWritingAnalysis({ status: "completed", periodKey: "2026-W35" }, "2026-W35"),
      { pass: true },
    );
  });

  test("passes for completed status without periodKey (pre-migration docs)", () => {
    assert.deepEqual(
      verifyWritingAnalysis({ status: "completed" }, "2026-W35"),
      { pass: true },
    );
  });

  test("fails when doc is null", () => {
    assert.equal(verifyWritingAnalysis(null, "2026-W35").pass, false);
  });

  test("fails when status is not completed", () => {
    const result = verifyWritingAnalysis({ status: "skipped" }, "2026-W35");
    assert.equal(result.pass, false);
    assert.ok(result.reason.includes("unexpected_status"));
  });

  test("fails when periodKey is stale", () => {
    const result = verifyWritingAnalysis({ status: "completed", periodKey: "2026-W34" }, "2026-W35");
    assert.equal(result.pass, false);
    assert.ok(result.reason.includes("stale_period"));
  });
});

describe("verifySoul", () => {
  const validDocs = {
    soul: { generatedForMonth: "2026-09", content: "narrative", status: "ok" },
    openQuestions: { generatedForMonth: "2026-09", areas: [] },
    guidelines: { programId: "primary" },
  };

  test("passes with all three docs present and current", () => {
    assert.deepEqual(verifySoul(validDocs, "2026-09"), { pass: true });
  });

  test("passes with no_notes soul (valid outcome)", () => {
    const docs = {
      ...validDocs,
      soul: { generatedForMonth: "2026-09", status: "no_notes" },
    };
    assert.deepEqual(verifySoul(docs, "2026-09"), { pass: true });
  });

  test("fails when soul is missing", () => {
    assert.equal(verifySoul({ ...validDocs, soul: null }, "2026-09").pass, false);
  });

  test("fails when soul has wrong month", () => {
    const docs = {
      ...validDocs,
      soul: { generatedForMonth: "2026-08", content: "old" },
    };
    const result = verifySoul(docs, "2026-09");
    assert.equal(result.pass, false);
    assert.ok(result.reason.includes("stale_soul"));
  });

  test("fails when open_questions is missing", () => {
    assert.equal(verifySoul({ ...validDocs, openQuestions: null }, "2026-09").pass, false);
  });

  test("fails when open_questions has wrong month", () => {
    const docs = {
      ...validDocs,
      openQuestions: { generatedForMonth: "2026-08" },
    };
    assert.equal(verifySoul(docs, "2026-09").pass, false);
  });

  test("fails when guidelines is missing", () => {
    assert.equal(verifySoul({ ...validDocs, guidelines: null }, "2026-09").pass, false);
  });
});

describe("verifyMonthlyPlan", () => {
  const validPlan = {
    month: "2026-09",
    status: "generated",
    driveDocId: "abc123",
    driveChecklistId: "def456",
  };

  test("passes with valid plan and Drive IDs", () => {
    assert.deepEqual(verifyMonthlyPlan({ plan: validPlan }, "2026-09"), { pass: true });
  });

  test("fails when plan is null", () => {
    assert.equal(verifyMonthlyPlan({ plan: null }, "2026-09").pass, false);
  });

  test("fails when month is stale", () => {
    const result = verifyMonthlyPlan({ plan: { ...validPlan, month: "2026-08" } }, "2026-09");
    assert.equal(result.pass, false);
    assert.ok(result.reason.includes("stale_plan"));
  });

  test("fails when status is not generated", () => {
    const result = verifyMonthlyPlan({ plan: { ...validPlan, status: "draft" } }, "2026-09");
    assert.equal(result.pass, false);
  });

  test("fails when driveDocId is missing", () => {
    const plan = { ...validPlan, driveDocId: null };
    assert.equal(verifyMonthlyPlan({ plan }, "2026-09").pass, false);
  });

  test("fails when driveChecklistId is missing", () => {
    const plan = { ...validPlan, driveChecklistId: undefined };
    assert.equal(verifyMonthlyPlan({ plan }, "2026-09").pass, false);
  });
});

describe("verifyDigest", () => {
  test("passes for valid digest with matching weekKey", () => {
    assert.deepEqual(
      verifyDigest({ weekKey: "2026-W35", htmlContent: "<p>digest</p>" }, "2026-W35"),
      { pass: true },
    );
  });

  test("fails when null", () => {
    assert.equal(verifyDigest(null, "2026-W35").pass, false);
  });

  test("fails when weekKey is stale", () => {
    const result = verifyDigest({ weekKey: "2026-W34", htmlContent: "old" }, "2026-W35");
    assert.equal(result.pass, false);
  });

  test("fails when htmlContent is empty", () => {
    assert.equal(verifyDigest({ weekKey: "2026-W35", htmlContent: "" }, "2026-W35").pass, false);
  });
});

describe("verifyDeletion", () => {
  test("passes when doc does not exist", () => {
    assert.deepEqual(verifyDeletion(false), { pass: true });
  });

  test("fails when doc still exists", () => {
    const result = verifyDeletion(true);
    assert.equal(result.pass, false);
    assert.equal(result.reason, "doc_still_exists");
  });
});
