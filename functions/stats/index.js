/**
 * Stats cache writers (PEP-285).
 *
 * The callable path consumes only observations after the persisted cursor.
 * The scheduled path is the weekly correctness boundary and rebuilds every
 * classroom cache one classroom at a time.
 */

import * as functions from "firebase-functions/v1";
import {db, Timestamp} from "../shared/firebase.js";
import {
  DEFAULT_DELTA_PAGE_SIZE,
  addObservationToDelta,
  applyDeltaToCache,
  compareCursors,
  createDeltaAccumulator,
  cursorFromObservation,
  finalizeDelta,
} from "./delta.js";
import {
  buildDeltaMeta,
  buildLeaseMeta,
  canPublishRun,
  isLeaseExpired,
} from "./control.js";
import {reconcileAllStats, withFirestoreRetry} from "./reconcile.js";

const REGION = "asia-south1";
const TIMEOUT_SECONDS = 540;
const WAIT_INTERVAL_MS = 2000;
const WAIT_LIMIT = 60;

function asMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds != null) return value.seconds * 1000;
  return Number(value) || 0;
}

function toFirestoreCursor(cursor) {
  if (!cursor) return null;
  return {createdAt: Timestamp.fromMillis(cursor.createdAtMs), documentPath: cursor.documentPath};
}

function fromFirestoreCursor(cursor) {
  if (!cursor?.createdAt) return null;
  return {createdAtMs: asMillis(cursor.createdAt), documentPath: cursor.documentPath || ""};
}

function httpsError(code, message) {
  return new functions.https.HttpsError(code, message);
}

async function authorize(context) {
  if (!context.auth) throw httpsError("unauthenticated", "Must be signed in");
  const snap = await withFirestoreRetry(() => db.collection("users").doc(context.auth.uid).get());
  if (!snap.exists) throw httpsError("permission-denied", "User not found");
  const role = snap.data()?.role;
  if (!["superadmin", "classroomadmin", "teacher"].includes(role)) {
    throw httpsError("permission-denied", "Unknown role");
  }
  return role;
}

async function acquireLease(runId, {allowBootstrap = false} = {}) {
  const ref = db.collection("statsCache").doc("_meta");
  return withFirestoreRetry(() => db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists && !allowBootstrap) throw httpsError("failed-precondition", "Stats are not initialized yet. Run the weekly reconciliation first.");
    const meta = snap.exists ? snap.data() : {classroomCount: 0, deltaGeneration: 0, deltaCursor: null};
    const nowMs = Date.now();
    if (!isLeaseExpired(meta, nowMs)) return {acquired: false, meta};
    const generation = (meta.deltaGeneration || 0) + 1;
    transaction.set(ref, buildLeaseMeta({base: meta, generation, runId, leaseUntilMs: nowMs + 60000}));
    return {acquired: true, generation, meta};
  }));
}

async function waitForLease(runId) {
  for (let attempt = 0; attempt < WAIT_LIMIT; attempt++) {
    const result = await acquireLease(runId);
    if (result.acquired) return result;
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  throw httpsError("deadline-exceeded", "Stats refresh is still running. Please try again shortly.");
}

function renewLease(runId, generation) {
  const ref = db.collection("statsCache").doc("_meta");
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists || !canPublishRun(snap.data(), generation) || snap.data().deltaRunId !== runId) return false;
    transaction.update(ref, {deltaLeaseUntilMs: Date.now() + 60000});
    return true;
  });
}

async function markDeltaFailed(runId, generation) {
  const ref = db.collection("statsCache").doc("_meta");
  try {
    await withFirestoreRetry(() => db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists || !canPublishRun(snap.data(), generation) || snap.data().deltaRunId !== runId) return;
      transaction.update(ref, {
        deltaRunStatus: "failed",
        deltaLeaseUntilMs: null,
        deltaUpdatedAt: Timestamp.now(),
      });
    }));
  } catch (cleanupError) {
    console.error(JSON.stringify({event: "stats_delta_failure_cleanup_failed", runId, message: cleanupError.message}));
  }
}

async function fetchDelta(runCursor) {
  const state = createDeltaAccumulator();
  let lastDoc = null;
  while (true) {
    // createdAt is the ingestion cursor: a note observed months ago but
    // created now must enter the next delta. observedAt remains the graph
    // attribution timestamp, so this intentionally differs from graph math.
    let query = db.collectionGroup("observations").orderBy("createdAt", "asc").limit(DEFAULT_DELTA_PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await withFirestoreRetry(() => query.get());
    for (const doc of snap.docs) {
      const data = doc.data();
      const sourceCursor = cursorFromObservation({...data, id: doc.id, path: doc.ref.path});
      if (!state.latestCursor || compareCursors(state.latestCursor, sourceCursor) < 0) state.latestCursor = sourceCursor;
      if (data.type === "media" && data.status !== "ready") continue;
      const observation = {...data, id: doc.id, path: doc.ref.path};
      if (compareCursors(cursorFromObservation(observation), runCursor) <= 0) continue;
      addObservationToDelta(state, observation);
    }
    if (snap.size < DEFAULT_DELTA_PAGE_SIZE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  return finalizeDelta(state);
}

async function publishDelta(delta, runId, generation) {
  const metaRef = db.collection("statsCache").doc("_meta");
  const classroomQuery = db.collection("statsCache").where("classroomId", "!=", null);
  return withFirestoreRetry(() => db.runTransaction(async (transaction) => {
    const metaSnap = await transaction.get(metaRef);
    if (!metaSnap.exists || !canPublishRun(metaSnap.data(), generation) || metaSnap.data().deltaRunId !== runId) return false;
    const classroomsSnap = await transaction.get(classroomQuery);
    const currentMeta = metaSnap.data();
    const allActions = delta.actions || [];
    const nextClassrooms = classroomsSnap.docs.map((doc) => {
      const cache = doc.data();
      const local = allActions.filter((action) => action.classroomId === cache.classroomId);
      if (local.length === 0 && allActions.length === 0) return {ref: doc.ref, data: cache};
      const localDelta = {actions: local, studentMentions: delta.mentionsByClassroom?.get(cache.classroomId) || []};
      return {ref: doc.ref, data: applyDeltaToCache(cache, localDelta, allActions, new Date())};
    });
    for (const classroom of nextClassrooms) transaction.set(classroom.ref, {...classroom.data, cachedAt: Timestamp.now()});
    transaction.set(metaRef, {
      ...buildDeltaMeta({base: currentMeta, cursor: toFirestoreCursor(delta.latestCursor || fromFirestoreCursor(currentMeta.deltaCursor)), generation, runId, nowMs: Date.now()}),
      cachedAt: Timestamp.now(),
      deltaLeaseUntil: null,
      deltaUpdatedAt: Timestamp.now(),
    });
    return true;
  }));
}

export const updateStatsDelta = functions
  .region(REGION)
  .runWith({timeoutSeconds: TIMEOUT_SECONDS, memory: "1GB"})
  .https.onCall(async (_data, context) => {
    const role = await authorize(context);
    const runId = `${context.auth.uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const lease = await waitForLease(runId);
    const cursor = fromFirestoreCursor(lease.meta.deltaCursor);
    if (!cursor) throw httpsError("failed-precondition", "Stats are not initialized yet. Run the weekly reconciliation first.");
    const renewal = setInterval(() => {
      renewLease(runId, lease.generation).catch((cause) => console.error(JSON.stringify({event: "stats_delta_lease_renewal_failed", runId, message: cause.message})));
    }, 30000);
    try {
      const delta = await fetchDelta(cursor);
      const published = await publishDelta(delta, runId, lease.generation);
      if (!published) return {fresh: true, fenced: true};
      console.log(JSON.stringify({event: "stats_delta", role, runId, actionCount: delta.actions.length}));
      return {fresh: false, cachedAt: Date.now(), actionCount: delta.actions.length};
    } catch (cause) {
      await markDeltaFailed(runId, lease.generation);
      console.error(JSON.stringify({event: "stats_delta_failed", runId, message: cause.message}));
      throw httpsError("internal", "Stats refresh failed. Showing last successful stats. Please try again.");
    } finally {
      clearInterval(renewal);
    }
  });

export const reconcileStats = functions
  .region(REGION)
  .runWith({timeoutSeconds: TIMEOUT_SECONDS, memory: "1GB"})
  .pubsub.schedule("0 4 * * 0")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const runId = `reconcile-${Date.now()}`;
    const ref = db.collection("statsCache").doc("_meta");
    const lease = await acquireLease(runId, {allowBootstrap: true});
    if (!lease.acquired) return null;
    try {
      const result = await reconcileAllStats();
      await withFirestoreRetry(() => db.runTransaction(async (transaction) => {
        const metaSnap = await transaction.get(ref);
        if (!metaSnap.exists || !canPublishRun(metaSnap.data(), lease.generation) || metaSnap.data().deltaRunId !== runId) return;
        for (const classroom of result.classrooms) transaction.set(db.collection("statsCache").doc(`classroom_${classroom.classroomId}`), classroom);
        transaction.set(ref, {
          ...metaSnap.data(),
          cachedAt: Timestamp.now(),
          classroomCount: result.classroomCount,
          deltaCursor: toFirestoreCursor(result.latestCursor),
          deltaRunStatus: "completed",
          deltaLeaseUntil: null,
          deltaLeaseUntilMs: null,
          deltaUpdatedAt: Timestamp.now(),
          lastFullReconciliationAt: Timestamp.now(),
        });
      }));
      console.log(JSON.stringify({event: "stats_reconcile", runId, classroomCount: result.classroomCount}));
    } catch (cause) {
      console.error(JSON.stringify({event: "stats_reconcile_failed", runId, message: cause.message}));
      throw cause;
    }
    return null;
  });
