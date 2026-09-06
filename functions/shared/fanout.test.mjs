/**
 * #279: Shared dispatcher/worker fan-out helper tests.
 *
 * Pure unit tests - ledger and Pub/Sub dependencies are injected fakes,
 * mirroring the repo's node:test style (see monthlyPlan/pubsubFanout.test.mjs).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseFanoutMessage, dispatchFanout, makeFanoutWorker } from "./fanout.js";

// ---------------------------------------------------------------------------
// parseFanoutMessage
// ---------------------------------------------------------------------------
describe("parseFanoutMessage", () => {
  it("parses a valid message with base fields", () => {
    const message = { json: { studentId: "2025-GUL-001", executionId: "2026-W37" } };
    const result = parseFanoutMessage(message);
    assert.equal(result.studentId, "2025-GUL-001");
    assert.equal(result.executionId, "2026-W37");
  });

  it("parses extra keys when requested", () => {
    const message = { json: { studentId: "S1", executionId: "2026-10", targetMonth: "2026-10" } };
    const result = parseFanoutMessage(message, ["targetMonth"]);
    assert.equal(result.targetMonth, "2026-10");
  });

  it("throws on missing studentId", () => {
    const message = { json: { executionId: "2026-W37" } };
    assert.throws(() => parseFanoutMessage(message), /studentId is required/);
  });

  it("throws on missing executionId", () => {
    const message = { json: { studentId: "S1" } };
    assert.throws(() => parseFanoutMessage(message), /executionId is required/);
  });

  it("throws on missing extra key", () => {
    const message = { json: { studentId: "S1", executionId: "2026-10" } };
    assert.throws(() => parseFanoutMessage(message, ["targetMonth"]), /targetMonth is required/);
  });

  it("throws on empty/null json", () => {
    assert.throws(() => parseFanoutMessage({ json: null }), /invalid/i);
    assert.throws(() => parseFanoutMessage({ json: undefined }), /invalid/i);
  });
});

// ---------------------------------------------------------------------------
// dispatchFanout
// ---------------------------------------------------------------------------
function makeDispatchDeps() {
  const calls = { createExecution: [], seedWorkItems: [] };
  return {
    calls,
    deps: {
      createExecution: async (...args) => calls.createExecution.push(args),
      seedWorkItems: async (...args) => calls.seedWorkItems.push(args),
    },
  };
}

describe("dispatchFanout", () => {
  it("creates execution then seeds workItems and publishes one message per target", async () => {
    const { calls, deps } = makeDispatchDeps();
    const publishedPayloads = [];
    const topic = {
      publishMessage: async ({ data }) => publishedPayloads.push(JSON.parse(data.toString())),
    };

    const result = await dispatchFanout({
      jobKey: "writingAnalysis",
      topic,
      executionId: "2026-W37",
      targetIds: ["S1", "S2"],
      buildPayload: (id) => ({ studentId: id, executionId: "2026-W37" }),
    }, deps);

    assert.deepEqual(calls.createExecution, [["writingAnalysis", "2026-W37", 2]]);
    assert.deepEqual(calls.seedWorkItems, [["writingAnalysis", "2026-W37", ["S1", "S2"]]]);
    assert.equal(result.published, 2);
    assert.equal(result.publishFailed, 0);
    assert.deepEqual(
      publishedPayloads.map((p) => p.studentId).sort(),
      ["S1", "S2"],
    );
    assert.ok(publishedPayloads.every((p) => p.executionId === "2026-W37"));
  });

  it("uses explicit expectedCount over targetIds length when provided", async () => {
    const { calls, deps } = makeDispatchDeps();
    const topic = { publishMessage: async () => {} };

    await dispatchFanout({
      jobKey: "monthlyPlans",
      topic,
      executionId: "2026-10",
      targetIds: ["S1"],
      expectedCount: 1,
      buildPayload: (id) => ({ studentId: id, executionId: "2026-10" }),
    }, deps);

    assert.deepEqual(calls.createExecution, [["monthlyPlans", "2026-10", 1]]);
  });

  it("counts publish failures without throwing", async () => {
    const { deps } = makeDispatchDeps();
    let n = 0;
    const topic = {
      publishMessage: async () => {
        n++;
        if (n === 1) throw new Error("boom");
      },
    };

    const result = await dispatchFanout({
      jobKey: "baseballCards",
      topic,
      executionId: "2026-W37",
      targetIds: ["S1", "S2"],
      buildPayload: (id) => ({ studentId: id, executionId: "2026-W37" }),
    }, deps);

    assert.equal(result.published, 1);
    assert.equal(result.publishFailed, 1);
  });
});

// ---------------------------------------------------------------------------
// makeFanoutWorker
// ---------------------------------------------------------------------------
function makeWorkerDeps() {
  const workItems = [];
  return {
    workItems,
    deps: {
      updateWorkItem: async (jobKey, executionId, targetId, update) => {
        workItems.push({ jobKey, executionId, targetId, update });
      },
    },
  };
}

const BASE_MSG = { json: { studentId: "S1", executionId: "2026-W37" } };

describe("makeFanoutWorker", () => {
  it("ACKs malformed messages without writing a workItem", async () => {
    const { workItems, deps } = makeWorkerDeps();
    const worker = makeFanoutWorker({
      jobKey: "writingAnalysis",
      process: async () => ({ state: "success" }),
    }, deps);

    const result = await worker({ json: null });
    assert.equal(result, null);
    assert.equal(workItems.length, 0);
  });

  it("marks skipped/already_generated when the idempotency guard hits", async () => {
    const { workItems, deps } = makeWorkerDeps();
    let processed = false;
    const worker = makeFanoutWorker({
      jobKey: "writingAnalysis",
      isAlreadyDone: async () => true,
      process: async () => { processed = true; return { state: "success" }; },
    }, deps);

    const result = await worker(BASE_MSG);
    assert.equal(result, null);
    assert.equal(processed, false);
    assert.equal(workItems.length, 1);
    assert.equal(workItems[0].update.state, "skipped");
    assert.equal(workItems[0].update.detail, "already_generated");
  });

  it("writes success workItem with evidence", async () => {
    const { workItems, deps } = makeWorkerDeps();
    const worker = makeFanoutWorker({
      jobKey: "baseballCards",
      process: async () => ({ state: "success", evidence: { status: "ok", noteCount: 4 } }),
    }, deps);

    await worker(BASE_MSG);
    assert.equal(workItems.length, 1);
    assert.deepEqual(workItems[0], {
      jobKey: "baseballCards",
      executionId: "2026-W37",
      targetId: "S1",
      update: workItems[0].update,
    });
    assert.equal(workItems[0].update.state, "success");
    assert.deepEqual(workItems[0].update.evidence, { status: "ok", noteCount: 4 });
  });

  it("writes skipped workItem with detail", async () => {
    const { workItems, deps } = makeWorkerDeps();
    const worker = makeFanoutWorker({
      jobKey: "writingAnalysis",
      process: async () => ({ state: "skipped", detail: "insufficient_samples" }),
    }, deps);

    await worker(BASE_MSG);
    assert.equal(workItems[0].update.state, "skipped");
    assert.equal(workItems[0].update.detail, "insufficient_samples");
  });

  it("writes failed workItem and ACKs when process returns a failed state", async () => {
    const { workItems, deps } = makeWorkerDeps();
    const worker = makeFanoutWorker({
      jobKey: "monthlyPlans",
      process: async () => ({ state: "failed", failureCategory: "export_failed", detail: "drive down" }),
    }, deps);

    const result = await worker(BASE_MSG);
    assert.equal(result, null);
    assert.equal(workItems[0].update.state, "failed");
    assert.equal(workItems[0].update.failureCategory, "export_failed");
  });

  it("ACKs permanent thrown errors with a failed workItem", async () => {
    const { workItems, deps } = makeWorkerDeps();
    const err = new Error("student missing");
    err.code = "not-found";
    const worker = makeFanoutWorker({
      jobKey: "writingAnalysis",
      process: async () => { throw err; },
    }, deps);

    const result = await worker(BASE_MSG);
    assert.equal(result, null);
    assert.equal(workItems[0].update.state, "failed");
    assert.equal(typeof workItems[0].update.failureCategory, "string");
  });

  it("rethrows transient errors without writing a terminal workItem", async () => {
    const { workItems, deps } = makeWorkerDeps();
    const worker = makeFanoutWorker({
      jobKey: "writingAnalysis",
      process: async () => { throw new Error("ECONNRESET"); },
    }, deps);

    await assert.rejects(() => worker(BASE_MSG), /ECONNRESET/);
    assert.equal(workItems.length, 0);
  });

  it("passes parsed context (including extras) to guard and process", async () => {
    const { deps } = makeWorkerDeps();
    const seen = [];
    const worker = makeFanoutWorker({
      jobKey: "soulRegen",
      extraKeys: ["targetMonth"],
      isAlreadyDone: async (ctx) => { seen.push({ fn: "guard", ...ctx }); return false; },
      process: async (ctx) => { seen.push({ fn: "process", ...ctx }); return { state: "success" }; },
    }, deps);

    await worker({ json: { studentId: "S9", executionId: "2026-10", targetMonth: "2026-10" } });
    assert.equal(seen.length, 2);
    assert.equal(seen[0].fn, "guard");
    assert.equal(seen[1].fn, "process");
    for (const call of seen) {
      assert.equal(call.studentId, "S9");
      assert.equal(call.executionId, "2026-10");
      assert.equal(call.targetMonth, "2026-10");
    }
  });

  it("survives workItem write failures on the success path (ACKs anyway)", async () => {
    const worker = makeFanoutWorker({
      jobKey: "writingAnalysis",
      process: async () => ({ state: "success" }),
    }, {
      updateWorkItem: async () => { throw new Error("ledger down"); },
    });

    const result = await worker(BASE_MSG);
    assert.equal(result, null);
  });
});
