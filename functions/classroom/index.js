import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import {
  shouldSyncOnClassroomUpdate,
  shouldSyncOnUserUpdate,
  diffArrays,
  syncTeacherChanges,
  syncUserChanges,
  revokeAllForUser,
  reconcileClassroomPermissions,
  buildBulkSyncPlan,
} from "../utils/drivePermissions.js";
import { getDriveClients } from "../utils/driveHelpers.js";

/**
 * Firestore trigger: sync Drive permissions when classroom teacherIds
 * or driveFolderId change.
 */
export const onClassroomUpdate = functions
  .region("asia-south1")
  .firestore.document("classrooms/{classroomId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const classroomId = context.params.classroomId;

    if (!shouldSyncOnClassroomUpdate(before, after)) return null;

    console.log(`[drive-perms] Classroom ${classroomId} changed, syncing Drive permissions`);

    let drive;
    try {
      ({ drive } = await getDriveClients());
    } catch (err) {
      console.error("[drive-perms] Failed to get Drive client:", err.message);
      return null;
    }

    const driveFolderId = after.driveFolderId;

    // If driveFolderId or programId changed, do full reconciliation
    if (
      (before.driveFolderId !== after.driveFolderId && after.driveFolderId) ||
      before.programId !== after.programId
    ) {
      try {
        const result = await reconcileClassroomPermissions(drive, db, classroomId);
        console.log(`[drive-perms] Full reconciliation for ${classroomId}: granted=${result.granted.length}, revoked=${result.revoked.length}`);
      } catch (err) {
        console.error(`[drive-perms] Full reconciliation failed for ${classroomId}:`, err.message);
      }
      return null;
    }

    // Diff teacherIds and sync changes
    const { added, removed } = diffArrays(before.teacherIds, after.teacherIds);
    if (added.length === 0 && removed.length === 0) return null;

    try {
      const result = await syncTeacherChanges(drive, db, driveFolderId, added, removed, classroomId);
      console.log(`[drive-perms] Teacher sync for ${classroomId}: granted=${result.granted.length}, revoked=${result.revoked.length}, errors=${result.errors.length}`);
    } catch (err) {
      console.error(`[drive-perms] Teacher sync failed for ${classroomId}:`, err.message);
    }

    return null;
  });

/**
 * Firestore trigger: sync Drive permissions when user role
 * or manageableClassrooms change.
 */
export const onUserUpdate = functions
  .region("asia-south1")
  .firestore.document("users/{uid}")
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    const uid = change.before.id;

    if (!shouldSyncOnUserUpdate(before, after)) return null;

    console.log(`[drive-perms] User ${uid} changed (role: ${before.role}→${after.role}), syncing Drive permissions`);

    let drive;
    try {
      ({ drive } = await getDriveClients());
    } catch (err) {
      console.error("[drive-perms] Failed to get Drive client:", err.message);
      return null;
    }

    try {
      const result = await syncUserChanges(drive, db, before, after, uid);
      console.log(`[drive-perms] User sync for ${uid}: granted=${result.granted.length}, revoked=${result.revoked.length}, errors=${result.errors.length}`);
    } catch (err) {
      console.error(`[drive-perms] User sync failed for ${uid}:`, err.message);
    }

    return null;
  });

/**
 * Firestore trigger: revoke all Drive permissions when a user is deleted.
 * Primarily needed for admin/superadmin deletions — teacher permissions
 * are already cleaned up via the classroom trigger when they're removed
 * from teacherIds before deletion.
 */
export const onUserDelete = functions
  .region("asia-south1")
  .firestore.document("users/{uid}")
  .onDelete(async (snap) => {
    const deletedData = snap.data();
    const uid = snap.id;

    // Only need to revoke for admins/superadmins who have direct access
    if (deletedData.role !== "classroomadmin" && deletedData.role !== "superadmin") {
      return null;
    }

    console.log(`[drive-perms] User ${uid} (${deletedData.role}) deleted, revoking Drive permissions`);

    let drive;
    try {
      ({ drive } = await getDriveClients());
    } catch (err) {
      console.error("[drive-perms] Failed to get Drive client:", err.message);
      return null;
    }

    try {
      const result = await revokeAllForUser(drive, db, deletedData);
      console.log(`[drive-perms] Revoked ${result.revoked.length} permissions for deleted user ${uid}`);
    } catch (err) {
      console.error(`[drive-perms] Revoke-all failed for ${uid}:`, err.message);
    }

    return null;
  });

/**
 * Callable: bulk sync Drive permissions for all classrooms.
 * Superadmin-only. Used for initial backfill or periodic reconciliation.
 */
export const bulkSyncDrivePermissions = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be signed in");
    }

    // Check superadmin
    const callerSnap = await db.collection("users").doc(context.auth.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "superadmin") {
      throw new functions.https.HttpsError("permission-denied", "Superadmin only");
    }

    console.log("[drive-perms] Starting bulk sync of Drive permissions");

    const { drive } = await getDriveClients();

    // Load all classrooms and users
    const [classroomsSnap, usersSnap] = await Promise.all([
      db.collection("classrooms").get(),
      db.collection("users").get(),
    ]);

    const classrooms = classroomsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const plan = buildBulkSyncPlan(classrooms, allUsers);
    console.log(`[drive-perms] Bulk sync plan: ${plan.length} classrooms with Drive folders`);

    const results = { synced: 0, granted: 0, revoked: 0, errors: [] };

    for (const entry of plan) {
      try {
        const result = await reconcileClassroomPermissions(drive, db, entry.classroomId);
        results.granted += result.granted.length;
        results.revoked += result.revoked.length;
        results.synced++;
      } catch (err) {
        console.warn(`[drive-perms] Bulk sync failed for ${entry.classroomId}:`, err.message);
        results.errors.push({ classroomId: entry.classroomId, error: err.message });
      }
    }

    console.log(`[drive-perms] Bulk sync complete: ${results.synced} classrooms, ${results.granted} granted, ${results.revoked} revoked, ${results.errors.length} errors`);

    return {
      status: "ok",
      classroomsSynced: results.synced,
      permissionsGranted: results.granted,
      permissionsRevoked: results.revoked,
      errors: results.errors,
    };
  });
