/**
 * Scheduled verifier Cloud Functions (#229).
 *
 * Five thin wrappers around the shared verifier engine, each on its own
 * cron schedule timed after the jobs it verifies. All IST (Asia/Kolkata).
 *
 * The engine reads the execution ledger, re-verifies business outputs in
 * their destination stores, writes terminal state, and sends Telegram
 * green/red signals. Each verifier also emits to the monitoring adapter
 * (no-op provider until #268 adds Healthchecks.io).
 */

import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import { db } from "../shared/firebase.js";
import { runVerifier } from "./engine.js";
import { runDriveIntegrityCheck } from "./driveIntegrity.js";
import { getDriveClients } from "../utils/driveHelpers.js";
import { broadcastAlert } from "../shared/telegram.js";
import { isLastDayOfMonthIST } from "../utils/periodKeys.js";

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");

// ---------------------------------------------------------------------------
// Monthly verifiers
// ---------------------------------------------------------------------------

/**
 * Verify cleanupDeletedChats ran successfully on the 1st.
 * Fires day 1 at 00:30 IST, 30 minutes after the job starts.
 */
export const verifyCleanupDeletedChats = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 120, memory: "512MB", secrets: [TELEGRAM_BOT_TOKEN] })
  .pubsub.schedule("30 0 1 * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    await runVerifier(["cleanupDeletedChats"], TELEGRAM_BOT_TOKEN.value(), db);
    return null;
  });

/**
 * Verify soul regeneration completed after the dispatcher + workers.
 * Fires day 1 at 04:00 IST (+2h provisional offset from 02:00 start).
 */
export const verifySoulRegeneration = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [TELEGRAM_BOT_TOKEN] })
  .pubsub.schedule("0 4 1 * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    await runVerifier(["soulRegen"], TELEGRAM_BOT_TOKEN.value(), db);
    return null;
  });

/**
 * Verify monthly plan generation completed after dispatcher + workers.
 * Fires on days 28-31 at 03:00 IST (+3h provisional from midnight start),
 * with the same last-day guard as the dispatcher.
 */
export const verifyMonthlyPlans = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [TELEGRAM_BOT_TOKEN] })
  .pubsub.schedule("0 3 28-31 * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    if (!isLastDayOfMonthIST()) {
      console.log("[verifyMonthlyPlans] not last day, skipping");
      return null;
    }
    await runVerifier(["monthlyPlans"], TELEGRAM_BOT_TOKEN.value(), db);
    return null;
  });

// ---------------------------------------------------------------------------
// Weekly verifiers
// ---------------------------------------------------------------------------

/**
 * Verify baseball cards and writing analysis both completed.
 * Fires Sunday at 01:00 IST (baseball cards starts 00:00, writing at 00:30;
 * both are direct-loop CFs capped at 540s).
 */
export const verifyWeeklyStudentAI = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [TELEGRAM_BOT_TOKEN] })
  .pubsub.schedule("0 1 * * 0")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    await runVerifier(["baseballCards", "writingAnalysis"], TELEGRAM_BOT_TOKEN.value(), db);
    return null;
  });

/**
 * Verify both weekly digest CFs completed.
 * Fires Sunday at 19:15 IST (CF1 at 18:00, CF2 at 18:45; both 540s max).
 */
export const verifyWeeklyDigests = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 300, memory: "1GB", secrets: [TELEGRAM_BOT_TOKEN] })
  .pubsub.schedule("15 19 * * 0")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    await runVerifier(["digestClassroomAdmin", "digestSuperadmin"], TELEGRAM_BOT_TOKEN.value(), db);
    return null;
  });

/**
 * Weekly Drive integrity check - probes every cached Drive ID pointer
 * (shared drive root, classroom folders, current-month plan/checklist docs,
 * current-AY report docs) and signals dead/access-lost/moved pointers.
 *
 * Read-only + always signals (green heartbeat): detection within 7 days
 * preserves the 30-day untrash window that export-time self-healing cannot.
 * Monday 09:00 IST so a human is awake to act on a red.
 * Standalone (not a CONTRACTS entry): there is no producer job to verify.
 */
export const verifyDriveIntegrity = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "1GB", secrets: [TELEGRAM_BOT_TOKEN] })
  .pubsub.schedule("0 9 * * 1")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    try {
      const { drive } = await getDriveClients();
      const { message } = await runDriveIntegrityCheck(db, drive);
      await broadcastAlert(TELEGRAM_BOT_TOKEN.value(), db, message);
    } catch (err) {
      console.error("[verifyDriveIntegrity] crashed:", err);
      const crashMsg = `<b>Drive Integrity Check Crashed</b>\n${String(err.message || err).slice(0, 300)}`;
      await broadcastAlert(TELEGRAM_BOT_TOKEN.value(), db, crashMsg).catch(() => {});
      throw err;
    }
    return null;
  });
