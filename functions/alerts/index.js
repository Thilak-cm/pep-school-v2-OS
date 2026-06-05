// Alert bus Cloud Function helpers (PEP-296)
// createAlert: shared helper for any CF to write alert docs
// cleanupExpiredAlerts: scheduled CF to delete expired alerts

import * as functions from "firebase-functions/v1";
import { db, Timestamp } from "../shared/firebase.js";

/**
 * Create or upsert an alert document in the alerts collection.
 *
 * @param {string} docId - Deterministic document ID (e.g., "cf:interviewCap:teacherUid:2026-W23")
 * @param {object} alertData - Alert fields (type, dip, priority, payload, targeting, etc.)
 * @returns {Promise<void>}
 */
export async function createAlert(docId, alertData) {
  if (!docId || !alertData?.type) {
    throw new Error("createAlert requires docId and alertData.type");
  }

  const alertId = docId;
  const doc = {
    type: alertData.type,
    dip: alertData.dip ?? false,
    priority: alertData.priority ?? 50,
    source: alertData.source || "unknown",
    payload: alertData.payload || {},
    targetRoles: alertData.targetRoles || [],
    targetClassrooms: alertData.targetClassrooms || [],
    targetTeachers: alertData.targetTeachers || [],
    dismissedBy: {},
    expiresAt: alertData.expiresAt || null,
    createdAt: alertData.createdAt || Timestamp.now(),
    createdBy: alertData.createdBy || "system",
  };

  await db.collection("alerts").doc(alertId).set(doc, { merge: true });
}

/**
 * Scheduled CF: delete expired alert docs where expiresAt < now.
 * Runs weekly on Monday 01:00 IST.
 */
export const cleanupExpiredAlerts = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .pubsub.schedule("0 1 * * 1")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const now = Timestamp.now();
    const snapshot = await db
      .collection("alerts")
      .where("expiresAt", "<=", now)
      .get();

    if (snapshot.empty) {
      functions.logger.info("cleanupExpiredAlerts: no expired alerts found");
      return null;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    functions.logger.info(
      `cleanupExpiredAlerts: deleted ${snapshot.size} expired alerts`
    );
    return null;
  });
