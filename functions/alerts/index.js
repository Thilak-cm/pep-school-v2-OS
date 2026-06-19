// Alert bus Cloud Function helpers (PEP-296)
// createAlert: shared helper for any CF to write alert docs
// cleanupExpiredAlerts: scheduled CF to delete expired alerts
//
// Architecture note (2026-06-06):
// The alerts/notifications page is becoming a multi-source aggregator. It currently
// pulls from: (1) this top-level `alerts/` collection, and (2) `weekly_snapshot` docs
// for red-flag signals. With the interview scheduler (PEP-298), it will also pull from
// per-classroom interview schedule docs. As more features land, expect more sources.
// The dedicated `alerts/` collection remains the right home for agent-originated alerts
// that have no other collection — but avoid duplicating data here when a purpose-built
// doc already exists elsewhere. Let the alerts page aggregate, not this collection.

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

  const alertDoc = {
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

  // Transaction ensures idempotent upsert: new docs get dismissedBy: {},
  // re-upserts update all fields but preserve existing user dismissals.
  const ref = db.collection("alerts").doc(docId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) {
      t.set(ref, alertDoc);
    } else {
      // Exclude dismissedBy so existing dismissals are preserved
      // eslint-disable-next-line no-unused-vars
      const { dismissedBy: _dismissed, ...fieldsToMerge } = alertDoc;
      t.set(ref, fieldsToMerge, { merge: true });
    }
  });
}

/**
 * Firestore trigger: auto-complete a broadcast when all targeted teachers
 * have responded (dismissedBy count >= reach). Writes expiresAt: now().
 * Applies to both 'ack' and 'poll' broadcasts (PEP-323c).
 *
 * Idempotency guards:
 * - No-op if dismissedBy count unchanged from before
 * - No-op if expiresAt is already set to a past or near-now time
 * - No-op if doc type is not 'broadcast'
 */
export const onBroadcastAckComplete = functions
  .region("asia-south1")
  .firestore.document("alerts/{alertId}")
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only applies to broadcasts
    if (after.type !== "broadcast") return null;

    // Skip if reach is 0 or missing (no targeted audience)
    const reach = after.reach || 0;
    if (reach <= 0) return null;

    // Skip if ack count unchanged (avoids re-trigger from our own write)
    const beforeCount = Object.keys(before.dismissedBy || {}).length;
    const afterCount = Object.keys(after.dismissedBy || {}).length;
    if (afterCount <= beforeCount) return null;

    // Skip if already expired (our own write or manual expiry)
    if (after.expiresAt && after.expiresAt.toMillis() <= Date.now() + 5000) {
      return null;
    }

    // Check if all have responded
    if (afterCount >= reach) {
      const alertId = change.after.id;
      const title = after.payload?.title || "Broadcast";
      functions.logger.info(
        `onBroadcastAckComplete: alert ${alertId} — ${afterCount}/${reach} acked, auto-completing`
      );
      await change.after.ref.update({ expiresAt: Timestamp.now() });

      // Create a system notification for superadmins (PEP-323c)
      const kindLabel = after.broadcastKind === "poll" ? "responded to" : "read";
      await createAlert(`broadcast-complete:${alertId}`, {
        type: "system",
        dip: false,
        priority: 3,
        source: "cf:broadcastComplete",
        payload: {
          message: `All ${reach} teachers ${kindLabel} "${title}"`,
          detail: "Tap to view details",
          broadcastId: alertId,
        },
        targetRoles: ["superadmin"],
        expiresAt: null,
        createdBy: "system",
      });
    }

    return null;
  });

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
    // Alerts with expiresAt: null are retained indefinitely —
    // they must be deleted manually or via admin action.
    const snapshot = await db
      .collection("alerts")
      .where("expiresAt", "<=", now)
      .get();

    if (snapshot.empty) {
      functions.logger.info("cleanupExpiredAlerts: no expired alerts found");
      return null;
    }

    const BATCH_LIMIT = 500;
    for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      snapshot.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    functions.logger.info(
      `cleanupExpiredAlerts: deleted ${snapshot.size} expired alerts`
    );
    return null;
  });
