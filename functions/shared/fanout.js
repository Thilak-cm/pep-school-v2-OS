/**
 * Shared dispatcher/worker fan-out helpers (#279).
 *
 * Canonical implementation of the Pub/Sub fan-out pattern first built for
 * monthly plans and soul regen (#167, #270), now shared by four jobs:
 * soulRegen, monthlyPlans, writingAnalysis, baseballCards.
 *
 * Pattern: a cron dispatcher seeds the execution ledger and publishes one
 * message per student; a topic-triggered worker processes one student per
 * invocation. Per-student isolation means one slow/failing student cannot
 * consume a shared invocation budget, and partial progress survives any
 * single invocation dying. The verifier (#229) - not the dispatcher or
 * workers - finalizes executions by reading the ledger afterwards.
 *
 * Message payload is canonical and flat: { studentId, executionId, ...extras }.
 * executionId is embedded by the dispatcher so workers never recompute it -
 * recomputing risks period drift when a worker runs past an IST midnight
 * boundary (#264 lesson).
 *
 * Why deps injection: the ledger functions hit Firestore, so unit tests
 * inject fakes (see fanout.test.mjs). Production callers use the defaults.
 */

import {
  createExecution,
  seedWorkItems,
  updateWorkItem,
  buildWorkItemUpdate,
  classifyError,
} from "./ledger.js";

/**
 * Error codes treated as permanent by workers: the message is ACKed with a
 * failed workItem instead of being retried. Everything else is considered
 * transient and rethrown so Pub/Sub redelivers (idempotency guards make
 * redelivery safe). Mirrors the routing proven in monthlyPlanWorker/soulWorker.
 */
const PERMANENT_CODES = ["not-found", "failed-precondition"];

/**
 * Parse and validate a fan-out worker message.
 *
 * @param {object} message Pub/Sub message (expects `.json`).
 * @param {string[]} [extraKeys] Additional required payload keys (e.g. "targetMonth").
 * @return {object} `{ studentId, executionId, ...extras }`
 * @throws {Error} on malformed payloads - callers ACK these (permanent).
 */
export function parseFanoutMessage(message, extraKeys = []) {
  const json = message?.json;
  if (!json || typeof json !== "object") {
    throw new Error("invalid fan-out message: missing json payload");
  }
  const parsed = {};
  for (const key of ["studentId", "executionId", ...extraKeys]) {
    const value = json[key];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`invalid fan-out message: ${key} is required`);
    }
    parsed[key] = value;
  }
  return parsed;
}

/**
 * Dispatcher side: create the ledger execution, then seed workItems and
 * publish one message per target in parallel. Parallel is safe because
 * updateWorkItem uses merge writes - a worker racing ahead of its seed
 * write cannot conflict.
 *
 * Publish failures are counted, not thrown: a single bad publish should not
 * abort the rest of the batch. The verifier reports unpublished students as
 * missing (their workItems stay pending).
 *
 * @param {object} opts
 * @param {string} opts.jobKey Ledger job key.
 * @param {object} opts.topic Pub/Sub Topic (has publishMessage).
 * @param {string} opts.executionId Period key computed by the dispatcher.
 * @param {string[]} opts.targetIds Student IDs to fan out.
 * @param {number} [opts.expectedCount] Ledger expectedCount override
 *   (monthlyPlans filters at dispatch time, so its count is toPublish.length;
 *   defaults to targetIds.length for jobs that skip worker-side).
 * @param {function(string): object} opts.buildPayload Payload builder per target.
 * @param {object} [deps] Test injection: { createExecution, seedWorkItems }.
 * @return {Promise<{published: number, publishFailed: number}>}
 */
export async function dispatchFanout({
  jobKey,
  topic,
  executionId,
  targetIds,
  expectedCount,
  buildPayload,
}, deps = {}) {
  const createExecutionFn = deps.createExecution || createExecution;
  const seedWorkItemsFn = deps.seedWorkItems || seedWorkItems;

  await createExecutionFn(jobKey, executionId, expectedCount ?? targetIds.length);

  let published = 0;
  let publishFailed = 0;
  await Promise.all([
    seedWorkItemsFn(jobKey, executionId, targetIds),
    Promise.all(targetIds.map(async (targetId) => {
      try {
        const payload = JSON.stringify(buildPayload(targetId));
        await topic.publishMessage({ data: Buffer.from(payload) });
        published++;
      } catch (err) {
        publishFailed++;
        console.error(`[${jobKey}] publish failed for ${targetId}:`, err.message);
      }
    })),
  ]);

  return { published, publishFailed };
}

/**
 * Worker side: build an onPublish handler with the shared lifecycle.
 *
 * 1. Parse failure -> ACK (no workItem): malformed messages must not retry forever.
 * 2. Idempotency guard hit -> workItem "skipped"/already_generated, ACK.
 *    Guard errors (e.g. Firestore read blip) propagate as transient.
 * 3. process(ctx) returns { state, detail?, evidence?, failureCategory? }:
 *    - "success"/"skipped"/"failed" written to the workItem, then ACK.
 *      A returned "failed" ACKs deliberately (e.g. monthlyPlans Drive export:
 *      the plan is saved, retrying the whole message would regenerate it).
 * 4. process throws:
 *    - permanent codes (not-found, failed-precondition) -> failed workItem, ACK.
 *    - anything else -> rethrow; Pub/Sub redelivers and the guard skips
 *      already-completed students.
 *
 * workItem writes are best-effort (.catch swallowed): a ledger write failure
 * must not force a retry of an LLM call that already succeeded.
 *
 * @param {object} config
 * @param {string} config.jobKey Ledger job key.
 * @param {string[]} [config.extraKeys] Extra required payload keys.
 * @param {function(object): Promise<boolean>} [config.isAlreadyDone] Idempotency guard.
 * @param {function(object): Promise<object>} config.process Per-student work.
 * @param {object} [deps] Test injection: { updateWorkItem }.
 * @return {function(object): Promise<null>} Pub/Sub onPublish handler.
 */
export function makeFanoutWorker({ jobKey, extraKeys = [], isAlreadyDone, process }, deps = {}) {
  const updateWorkItemFn = deps.updateWorkItem || updateWorkItem;

  return async (message) => {
    let ctx;
    try {
      ctx = parseFanoutMessage(message, extraKeys);
    } catch (parseErr) {
      console.error(`[${jobKey}-worker] bad message, ACKing to stop retries:`, parseErr.message);
      return null;
    }
    const { studentId, executionId } = ctx;

    const writeWorkItem = (update) =>
      updateWorkItemFn(jobKey, executionId, studentId, update).catch(() => {});

    if (isAlreadyDone && await isAlreadyDone(ctx)) {
      console.log(`[${jobKey}-worker] ${studentId} already done for ${executionId}, skipping`);
      await writeWorkItem(buildWorkItemUpdate("skipped", { detail: "already_generated" }));
      return null;
    }

    let result;
    try {
      result = await process(ctx);
    } catch (err) {
      if (err.code && PERMANENT_CODES.includes(err.code)) {
        console.error(`[${jobKey}-worker] permanent error for ${studentId}, ACKing:`, err.message);
        await writeWorkItem(buildWorkItemUpdate("failed", {
          failureCategory: classifyError(err),
          detail: err.message,
        }));
        return null;
      }
      console.error(`[${jobKey}-worker] transient error for ${studentId}, retrying:`, err.message);
      throw err;
    }

    const { state, detail, evidence, failureCategory } = result || {};
    if (state === "success") {
      await writeWorkItem(buildWorkItemUpdate("success", evidence ? { evidence } : {}));
    } else if (state === "skipped") {
      await writeWorkItem(buildWorkItemUpdate("skipped", detail ? { detail } : {}));
    } else if (state === "failed") {
      await writeWorkItem(buildWorkItemUpdate("failed", {
        failureCategory: failureCategory || "unknown",
        ...(detail ? { detail } : {}),
      }));
    } else {
      console.error(`[${jobKey}-worker] process returned unknown state for ${studentId}:`, state);
    }
    return null;
  };
}
