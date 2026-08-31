/**
 * Shared verifier engine (#229).
 *
 * runVerifier(jobKeys, token, db) is the single entry point called by
 * each thin verifier CF. It:
 *   1. Computes the expected executionId per jobKey
 *   2. Reads the execution doc (missed-start if absent)
 *   3. Reads all workItems, re-verifies ALL claimed successes
 *   4. Computes aggregates
 *   5. Writes terminal state
 *   6. Sends monitoring adapter event
 *   7. Sends Telegram green/red signal
 */

import {
  computeExecutionId,
  getExecution,
  getWorkItems,
  finalizeExecution,
  computeDominantCategory,
} from "../shared/ledger.js";
import { emit } from "../shared/monitoringAdapter.js";
import { broadcastAlert } from "../shared/telegram.js";
import {
  formatGreenSignal,
  formatRedSignal,
  formatMissedStartSignal,
} from "../shared/verifierTelegram.js";
import { CONTRACTS } from "./contracts.js";

/**
 * Run verification for one or more jobKeys.
 * Each jobKey is verified independently; a single verifier CF can
 * own multiple jobKeys (e.g. verifyWeeklyStudentAI owns baseballCards
 * and writingAnalysis).
 *
 * @param {string[]} jobKeys
 * @param {string} telegramToken - resolved TELEGRAM_BOT_TOKEN value
 * @param {import("firebase-admin/firestore").Firestore} db
 * @param {Date} [now] - for testability
 */
export async function runVerifier(jobKeys, telegramToken, db, now = new Date()) {
  for (const jobKey of jobKeys) {
    try {
      await verifyJob(jobKey, telegramToken, db, now);
    } catch (err) {
      console.error(`[verifier] Fatal error verifying ${jobKey}:`, err);
      // Best-effort: try to send a red signal even on verifier crash
      try {
        const executionId = computeExecutionId(jobKey, now);
        const msg = `<b>Verifier Error</b>\n${jobKey} - ${executionId}\nThe verifier itself crashed: ${err.message}`;
        await broadcastAlert(telegramToken, db, msg);
      } catch {
        // Nothing left to do
      }
    }
  }
}

/**
 * Verify a single job's execution for the current period.
 */
async function verifyJob(jobKey, telegramToken, db, now) {
  const executionId = computeExecutionId(jobKey, now);
  const execution = await getExecution(jobKey, executionId);

  // Missed start: no execution doc exists
  if (!execution) {
    console.error(`[verifier] ${jobKey}/${executionId}: no execution doc found`);
    const msg = formatMissedStartSignal(jobKey, executionId);
    await broadcastAlert(telegramToken, db, msg);
    await emit("failure", { jobKey, executionId, status: "missed_start" });
    return;
  }

  // Already finalized (idempotent verifier runs)
  if (execution.state === "success" || execution.state === "failed") {
    console.log(`[verifier] ${jobKey}/${executionId}: already finalized as ${execution.state}`);
    return;
  }

  // Still running at verify time — proceed anyway so still-pending workItems
  // surface as missing, producing a red signal that alerts the operator.
  if (execution.state === "running") {
    console.warn(`[verifier] ${jobKey} execution ${executionId} still running at verify time, proceeding with verification`);
  }

  const workItems = await getWorkItems(jobKey, executionId);
  const contract = CONTRACTS[jobKey];

  if (!contract) {
    console.error(`[verifier] No contract registered for jobKey: ${jobKey}`);
    return;
  }

  const executionStart = execution.startedAt?.toDate
    ? execution.startedAt.toDate()
    : new Date(execution.startedAt);

  // Re-verify all claimed successes against destination stores
  const results = { completed: 0, skipped: 0, failed: 0, missing: 0, unverified: 0 };
  const failedItems = [];

  for (const item of workItems) {
    if (item.state === "success") {
      // Re-verify: the audit layer
      const check = await contract.verify(item, executionId, executionStart);
      if (check.pass) {
        results.completed++;
      } else {
        results.unverified++;
        failedItems.push({ ...item, failureCategory: "unverified", detail: check.reason });
      }
    } else if (item.state === "skipped") {
      results.skipped++;
    } else if (item.state === "failed") {
      results.failed++;
      failedItems.push(item);
    } else if (item.state === "pending") {
      results.missing++;
      failedItems.push({ ...item, failureCategory: "never_started" });
    }
  }

  // Check for items that were expected but have no workItem doc at all
  // (seed was interrupted or worker never received the message)
  const expectedCount = execution.expectedCount || 0;
  const accountedFor = results.completed + results.skipped + results.failed + results.missing + results.unverified;
  if (accountedFor < expectedCount) {
    results.missing += (expectedCount - accountedFor);
  }

  const isSuccess = results.completed + results.skipped === expectedCount
    && results.failed === 0
    && results.missing === 0
    && results.unverified === 0;

  const terminalState = isSuccess ? "success" : "failed";
  const dominantCategory = isSuccess ? null : computeDominantCategory(failedItems);

  const durationMs = execution.startedAt
    ? now.getTime() - (execution.startedAt.toDate ? execution.startedAt.toDate() : new Date(execution.startedAt)).getTime()
    : null;

  // Write terminal state
  await finalizeExecution(jobKey, executionId, {
    state: terminalState,
    completedCount: results.completed,
    skippedCount: results.skipped,
    failedCount: results.failed,
    missingCount: results.missing,
    unverifiedCount: results.unverified,
    dominantFailureCategory: dominantCategory,
  });

  // Monitoring adapter event
  await emit(terminalState, {
    jobKey,
    executionId,
    correlationId: execution.correlationId,
    status: terminalState,
    durationMs,
    completedCount: results.completed,
    skippedCount: results.skipped,
    failedCount: results.failed,
    missingCount: results.missing,
  });

  // Telegram signal
  const summary = {
    jobKey,
    executionId,
    completedCount: results.completed,
    skippedCount: results.skipped,
    failedCount: results.failed,
    missingCount: results.missing,
    unverifiedCount: results.unverified,
    expectedCount,
    dominantFailureCategory: dominantCategory,
    durationMs,
  };

  const msg = isSuccess ? formatGreenSignal(summary) : formatRedSignal(summary);
  await broadcastAlert(telegramToken, db, msg);

  console.log(`[verifier] ${jobKey}/${executionId}: ${terminalState} — ` +
    `${results.completed} completed, ${results.skipped} skipped, ` +
    `${results.failed} failed, ${results.missing} missing, ${results.unverified} unverified`);
}
