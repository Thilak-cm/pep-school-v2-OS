import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";

import { db, Timestamp } from "../shared/firebase.js";
import {
  computeExecutionId,
  createExecution,
  seedWorkItems,
  updateWorkItem,
  buildWorkItemUpdate,
  markExecutionFailed,
  classifyError,
} from "../shared/ledger.js";
import { broadcastAlert } from "../shared/telegram.js";
import { formatCrashSignal } from "../shared/verifierTelegram.js";

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const RETENTION_DAYS = 31;
const JOB_KEY = "cleanupDeletedChats";

// Firestore doc IDs cannot contain slashes. Chat doc paths like
// "students/abc123/chats/xyz789" must be escaped before use as
// ledger workItem IDs to avoid creating nested subcollections.
const safeDocId = (path) => path.replace(/\//g, "__");

export async function deleteDocumentRecursively(docRef) {
  const subcollections = await docRef.listCollections();
  for (const subcollection of subcollections) {
    const snapshot = await subcollection.get();
    await Promise.all(snapshot.docs.map((doc) => deleteDocumentRecursively(doc.ref)));
  }
  await docRef.delete();
}

export async function cleanupDeletedChatDocuments(snapshot, executionId) {
  let deletedCount = 0;
  let errorCount = 0;
  const batchSize = 10;
  for (let index = 0; index < snapshot.docs.length; index += batchSize) {
    const batch = snapshot.docs.slice(index, index + batchSize);
    await Promise.all(batch.map(async (doc) => {
      try {
        // Recursive deletion includes both messages and the durable turns
        // subcollection introduced by #220.
        await deleteDocumentRecursively(doc.ref);
        deletedCount += 1;
        await updateWorkItem(JOB_KEY, executionId, safeDocId(doc.ref.path), buildWorkItemUpdate("success"));
      } catch (error) {
        errorCount += 1;
        console.error(`[cleanupDeletedChats] Failed to delete ${doc.ref.path}`, error);
        await updateWorkItem(JOB_KEY, executionId, safeDocId(doc.ref.path), buildWorkItemUpdate("failed", {
          failureCategory: classifyError(error),
          detail: error.message,
        }));
      }
    }));
  }
  return { deletedCount, errorCount, totalFound: snapshot.size };
}

export const cleanupDeletedChats = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "512MB", secrets: [TELEGRAM_BOT_TOKEN] })
  .pubsub.schedule("0 0 1 * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const executionId = computeExecutionId(JOB_KEY);
    try {
      const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const snapshot = await db.collectionGroup("chats")
        .where("deleted", "==", true)
        .where("deletedAt", "<=", cutoff)
        .get();

      // Ledger: create execution + seed workItems (chat doc paths as IDs)
      const targetPaths = snapshot.docs.map((d) => safeDocId(d.ref.path));
      await createExecution(JOB_KEY, executionId, targetPaths.length);
      await seedWorkItems(JOB_KEY, executionId, targetPaths);

      const result = await cleanupDeletedChatDocuments(snapshot, executionId);
      console.log("[cleanupDeletedChats] Cleanup complete", result);
      return result;
    } catch (err) {
      console.error("[cleanupDeletedChats] Fatal error:", err);
      await markExecutionFailed(JOB_KEY, executionId, err).catch(() => {});
      const msg = formatCrashSignal(JOB_KEY, executionId, classifyError(err), err.message);
      await broadcastAlert(TELEGRAM_BOT_TOKEN.value(), db, msg).catch(() => {});
      throw err;
    }
  });
