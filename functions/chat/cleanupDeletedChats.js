import * as functions from "firebase-functions/v1";

import { db, Timestamp } from "../shared/firebase.js";

const RETENTION_DAYS = 31;

export async function deleteDocumentRecursively(docRef) {
  const subcollections = await docRef.listCollections();
  for (const subcollection of subcollections) {
    const snapshot = await subcollection.get();
    await Promise.all(snapshot.docs.map((doc) => deleteDocumentRecursively(doc.ref)));
  }
  await docRef.delete();
}

export async function cleanupDeletedChatDocuments(snapshot) {
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
      } catch (error) {
        errorCount += 1;
        console.error(`[cleanupDeletedChats] Failed to delete ${doc.ref.path}`, error);
      }
    }));
  }
  return { deletedCount, errorCount, totalFound: snapshot.size };
}

export const cleanupDeletedChats = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("0 0 1 * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const snapshot = await db.collectionGroup("chats")
      .where("deleted", "==", true)
      .where("deletedAt", "<=", cutoff)
      .get();
    const result = await cleanupDeletedChatDocuments(snapshot);
    console.log("[cleanupDeletedChats] Cleanup complete", result);
    return result;
  });
