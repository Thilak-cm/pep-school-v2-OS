/** Paginated stats delta and weekly source-of-truth reconciliation (PEP-285). */
import {randomUUID} from "node:crypto";
import * as functions from "firebase-functions/v1";
import {db, Timestamp, FieldPath} from "../shared/firebase.js";
import {
  DEFAULT_DELTA_PAGE_SIZE,
  applyDeltaToCache,
  createDeltaAccumulator,
  cursorFromObservation,
  finalizeDelta,
  reconcileCrossClassroomCounts,
} from "./delta.js";
import {
  LEASE_DURATION_MS,
  LEASE_RENEW_INTERVAL_MS,
  buildDeltaMeta,
  buildLeaseMeta,
  canPublishRun,
  leaseAcquisitionDecision,
} from "./control.js";
import {
  aggregateObservationPage,
  reconcileAllStats,
  resolveCanonicalGroupCursors,
  withFirestoreRetry,
} from "./reconcile.js";

const REGION = "asia-south1";
export const DELTA_TIMEOUT_SECONDS = 120;
export const RECONCILE_TIMEOUT_SECONDS = 540;
export const MAX_ATOMIC_CLASSROOM_WRITES = 450;
export const MAX_ATOMIC_PAYLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_ATOMIC_DOCUMENT_BYTES = 900 * 1024;
export const RESPONSE_MARGIN_MS = 10 * 1000;
const WAIT_INTERVAL_MS = 1000;

const metaRef = (database = db) => database.collection("statsCache").doc("_meta");
const httpsError = (code, message) => new functions.https.HttpsError(code, message);

export function deadlineForRuntime(timeoutSeconds, nowMs = Date.now()) {
  return nowMs + timeoutSeconds * 1000 - RESPONSE_MARGIN_MS;
}

function cursorFromMeta(meta) {
  const cursor = meta?.deltaCursor;
  return cursor?.createdAt ? {createdAt: cursor.createdAt, documentPath: cursor.documentPath || ""} : null;
}

function cachedAtMs(meta) {
  const value = meta?.cachedAt;
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds != null) return value.seconds * 1000 + (value.nanoseconds || 0) / 1e6;
  return Number(value) || null;
}

function ownsRunningLease(meta, generation, runId) {
  return meta?.deltaRunStatus === "running" && canPublishRun(meta, generation, runId);
}

async function authorize(context) {
  if (!context.auth) throw httpsError("unauthenticated", "Must be signed in");
  const snap = await withFirestoreRetry(() => db.collection("users").doc(context.auth.uid).get());
  if (!snap.exists) throw httpsError("permission-denied", "User not found");
  const role = snap.data()?.role;
  if (!["superadmin", "classroomadmin", "teacher"].includes(role)) throw httpsError("permission-denied", "Unknown role");
  return role;
}

export async function acquireLease(runId, {
  allowBootstrap = false,
  nowMs = Date.now(),
  minimumCompletedGeneration = null,
  database = db,
} = {}) {
  return withFirestoreRetry(() => database.runTransaction(async (transaction) => {
    const ref = metaRef(database);
    const snap = await transaction.get(ref);
    const meta = snap.exists ? snap.data() : {classroomCount: 0, deltaGeneration: 0, deltaCursor: null};
    if (minimumCompletedGeneration != null && meta.deltaRunStatus === "completed" && meta.deltaGeneration >= minimumCompletedGeneration) {
      return {acquired: false, waited: true, meta};
    }
    const decision = leaseAcquisitionDecision(meta, {exists: snap.exists, allowBootstrap, nowMs});
    if (decision === "missing-checkpoint") throw httpsError("failed-precondition", "Stats are not initialized yet. Run reconciliation first.");
    if (decision === "wait") return {acquired: false, meta};
    const generation = (meta.deltaGeneration || 0) + 1;
    transaction.set(ref, buildLeaseMeta({base: meta, generation, runId, leaseUntilMs: nowMs + LEASE_DURATION_MS}));
    return {acquired: true, generation, meta};
  }));
}

async function readMeta() {
  const snap = await withFirestoreRetry(() => metaRef().get());
  return snap.exists ? snap.data() : null;
}

export async function waitForLease(runId, {
  acquire = acquireLease,
  read = readMeta,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  deadlineMs = deadlineForRuntime(DELTA_TIMEOUT_SECONDS, now()),
  allowBootstrap = false,
  returnOnCompletion = true,
} = {}) {
  let observedGeneration = 0;
  while (now() < deadlineMs) {
    const result = await acquire(runId, {
      allowBootstrap,
      nowMs: now(),
      minimumCompletedGeneration: returnOnCompletion && observedGeneration > 0 ? observedGeneration : null,
    });
    if (result.acquired) return result;
    if (result.waited) return result;
    observedGeneration = Math.max(observedGeneration, result.meta?.deltaGeneration || 0);
    const remainingMs = deadlineMs - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(WAIT_INTERVAL_MS, remainingMs));
    if (!returnOnCompletion) continue;
    const meta = await read();
    if (meta?.deltaRunStatus === "completed" && meta.deltaGeneration >= observedGeneration) return {acquired: false, waited: true, meta};
  }
  throw httpsError("deadline-exceeded", "Stats refresh is still running. Please try again shortly.");
}

async function waitForSuccessfulGeneration(minimumGeneration, {
  now = Date.now,
  deadlineMs = deadlineForRuntime(DELTA_TIMEOUT_SECONDS, now()),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  while (now() < deadlineMs) {
    const meta = await readMeta();
    if (meta?.deltaRunStatus === "completed" && meta.deltaGeneration >= minimumGeneration) return meta;
    const remainingMs = deadlineMs - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(WAIT_INTERVAL_MS, remainingMs));
  }
  throw httpsError("deadline-exceeded", "A newer stats refresh is still running.");
}

export async function renewLease(runId, generation, {
  database = db,
  nowMs = Date.now(),
} = {}) {
  return withFirestoreRetry(() => database.runTransaction(async (transaction) => {
    const ref = metaRef(database);
    const snap = await transaction.get(ref);
    if (!snap.exists || !ownsRunningLease(snap.data(), generation, runId)) return false;
    transaction.update(ref, {deltaLeaseUntilMs: nowMs + LEASE_DURATION_MS});
    return true;
  }));
}

function startLeaseRenewal(runId, generation, eventName) {
  const timer = setInterval(() => {
    renewLease(runId, generation).catch((error) => console.error(JSON.stringify({event: eventName, runId, code: error.code || "unknown"})));
  }, LEASE_RENEW_INTERVAL_MS);
  return () => clearInterval(timer);
}

async function markRunFailed(runId, generation) {
  try {
    await withFirestoreRetry(() => db.runTransaction(async (transaction) => {
      const ref = metaRef();
      const snap = await transaction.get(ref);
      if (!snap.exists || !ownsRunningLease(snap.data(), generation, runId)) return;
      transaction.update(ref, {deltaRunStatus: "failed", deltaLeaseUntilMs: null, deltaUpdatedAt: Timestamp.now()});
    }));
  } catch (error) {
    console.error(JSON.stringify({event: "stats_lease_cleanup_failed", runId, code: error.code || "unknown"}));
  }
}

function normalizeDocument(doc) {
  return {...doc.data(), id: doc.id, path: doc.ref.path};
}

/** The query starts at the persisted values; no historical page is read. */
export async function fetchDelta(runCursor, {database = db, now = new Date(), onPageReleased = () => {}} = {}) {
  const state = createDeltaAccumulator(now);
  state.latestCursor = runCursor;
  let pageCursor = runCursor;
  while (true) {
    // createdAt intentionally controls ingestion. observedAt is retained in the
    // compact aggregate and controls graph/window attribution.
    const query = database.collectionGroup("observations")
      .orderBy("createdAt", "asc")
      .orderBy(FieldPath.documentId(), "asc")
      .startAfter(pageCursor.createdAt, pageCursor.documentPath)
      .limit(DEFAULT_DELTA_PAGE_SIZE);
    const snap = await withFirestoreRetry(() => query.get());
    const page = snap.docs.map(normalizeDocument);
    const canonical = await resolveCanonicalGroupCursors(page, database);
    const result = aggregateObservationPage(state, page, canonical, null, {skipPendingMedia: true});
    onPageReleased(page.length);
    if (result.blocked || page.length < DEFAULT_DELTA_PAGE_SIZE) break;
    pageCursor = cursorFromObservation(page[page.length - 1]);
  }
  return finalizeDelta(state);
}

async function readClassroomCaches(database = db, transaction = null) {
  const query = database.collection("statsCache")
    .orderBy(FieldPath.documentId())
    .startAt("classroom_")
    .endAt("classroom_\uf8ff");
  const snap = transaction
    ? await transaction.get(query)
    : await withFirestoreRetry(() => query.get());
  return snap.docs.map((doc) => ({ref: doc.ref, data: doc.data()}));
}

export function assertAtomicPublicationFits(classrooms) {
  if (classrooms.length > MAX_ATOMIC_CLASSROOM_WRITES) {
    throw new Error(`Atomic stats publication supports at most ${MAX_ATOMIC_CLASSROOM_WRITES} classrooms; found ${classrooms.length}`);
  }
  for (const item of classrooms) {
    const payload = Object.hasOwn(item, "data") ? item.data : item;
    const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    if (bytes > MAX_ATOMIC_DOCUMENT_BYTES) throw new Error(`Atomic stats document exceeds ${MAX_ATOMIC_DOCUMENT_BYTES} bytes`);
  }
  const bytes = Buffer.byteLength(JSON.stringify(classrooms.map((item) => Object.hasOwn(item, "data") ? item.data : item)), "utf8");
  if (bytes > MAX_ATOMIC_PAYLOAD_BYTES) throw new Error(`Atomic stats publication payload exceeds ${MAX_ATOMIC_PAYLOAD_BYTES} bytes`);
}

export async function publishDelta(delta, runId, generation, {
  database = db,
  publishedAt = Timestamp.now(),
  retrySleep,
} = {}) {
  const now = delta.now;
  return withFirestoreRetry(() => database.runTransaction(async (transaction) => {
    const ref = metaRef(database);
    const metaSnap = await transaction.get(ref);
    if (!metaSnap.exists || !ownsRunningLease(metaSnap.data(), generation, runId)) return {published: false};
    // Read classroom caches inside the transaction so a concurrent reconcile
    // commit cannot be silently overwritten by deltas applied on stale data.
    const current = await readClassroomCaches(database, transaction);
    const merged = reconcileCrossClassroomCounts(current.map(({data}) => applyDeltaToCache(data, delta.classrooms.get(data.classroomId), now)), now);
    const writes = current.flatMap((item, index) => {
      const before = {...item.data};
      const after = {...merged[index]};
      delete before.cachedAt;
      delete after.cachedAt;
      return JSON.stringify(before) === JSON.stringify(after)
        ? []
        : [{ref: item.ref, data: {...merged[index], cachedAt: publishedAt}}];
    });
    assertAtomicPublicationFits(writes);
    for (const classroom of writes) transaction.set(classroom.ref, classroom.data);
    transaction.set(ref, {
      ...buildDeltaMeta({base: metaSnap.data(), cursor: delta.latestCursor, generation, runId}),
      cachedAt: publishedAt, deltaUpdatedAt: publishedAt, lastSuccessfulGeneration: generation,
    });
    return {published: true, cachedAt: publishedAt};
  }), undefined, retrySleep);
}

export async function publishReconciliation(result, runId, generation, {
  database = db,
  publishedAt = Timestamp.now(),
  retrySleep,
} = {}) {
  if (result.blockedByPendingMedia) {
    console.error(JSON.stringify({
      event: "stats_reconcile_blocked_by_pending_media",
      runId,
      pendingMediaCount: result.pendingMediaCount || 1,
      earliestPendingCursor: result.pendingCursor || null,
    }));
    throw new Error("Stats reconciliation blocked by pending media; existing caches were preserved");
  }
  const writes = result.classrooms.map((data) => ({
    ref: database.collection("statsCache").doc(`classroom_${data.classroomId}`),
    data,
  }));
  const activeIds = new Set(writes.map((item) => item.ref.id));
  const stale = (await readClassroomCaches(database)).filter((item) => !activeIds.has(item.ref.id));
  assertAtomicPublicationFits([...writes, ...stale.map((item) => ({ref: item.ref, data: null}))]);
  return withFirestoreRetry(() => database.runTransaction(async (transaction) => {
    const ref = metaRef(database);
    const metaSnap = await transaction.get(ref);
    if (!metaSnap.exists || !ownsRunningLease(metaSnap.data(), generation, runId)) return {published: false};
    for (const classroom of writes) transaction.set(classroom.ref, {...classroom.data, cachedAt: publishedAt});
    for (const classroom of stale) transaction.delete(classroom.ref);
    transaction.set(ref, {
      ...metaSnap.data(),
      cachedAt: publishedAt,
      classroomCount: result.classroomCount,
      deltaCursor: result.latestCursor,
      deltaRunStatus: "completed",
      deltaLeaseUntilMs: null,
      deltaUpdatedAt: publishedAt,
      lastFullReconciliationAt: publishedAt,
      lastSuccessfulGeneration: generation,
    });
    return {published: true, cachedAt: publishedAt};
  }), undefined, retrySleep);
}

export const updateStatsDelta = functions.region(REGION)
  .runWith({timeoutSeconds: DELTA_TIMEOUT_SECONDS, memory: "512MB"})
  .https.onCall(async (_data, context) => {
    const deadlineMs = deadlineForRuntime(DELTA_TIMEOUT_SECONDS);
    const role = await authorize(context);
    const runId = randomUUID();
    const lease = await waitForLease(runId, {deadlineMs});
    if (lease.waited) return {fresh: true, cachedAt: cachedAtMs(lease.meta), generation: lease.meta.deltaGeneration};
    const stopRenewal = startLeaseRenewal(runId, lease.generation, "stats_delta_lease_renewal_failed");
    try {
      const delta = await fetchDelta(cursorFromMeta(lease.meta));
      const publication = await publishDelta(delta, runId, lease.generation);
      if (!publication.published) {
        const newest = await waitForSuccessfulGeneration(lease.generation + 1, {deadlineMs});
        return {fresh: true, fenced: true, cachedAt: cachedAtMs(newest), generation: newest.deltaGeneration};
      }
      const actionCount = [...delta.classrooms.values()].reduce((sum, item) => sum + item.actionCount, 0);
      const logPayload = {event: "stats_delta", role, runId, actionCount, pageCount: delta.pageCount};
      if (delta.skippedPendingMedia) logPayload.skippedPendingMedia = delta.skippedPendingMedia;
      console.log(JSON.stringify(logPayload));
      return {fresh: false, cachedAt: publication.cachedAt.toMillis(), actionCount, generation: lease.generation};
    } catch (error) {
      await markRunFailed(runId, lease.generation);
      console.error(JSON.stringify({event: "stats_delta_failed", runId, code: error.code || "unknown"}));
      if (error instanceof functions.https.HttpsError) throw error;
      throw httpsError("internal", "Stats refresh failed. Showing last successful stats. Please try again.");
    } finally {
      stopRenewal();
    }
  });

export const reconcileStats = functions.region(REGION)
  // Reconciliation scans every classroom weekly; pagination keeps 512MB safe,
  // while the longer timeout is required for the deliberately complete scan.
  .runWith({timeoutSeconds: RECONCILE_TIMEOUT_SECONDS, memory: "512MB"})
  .pubsub.schedule("0 4 * * 0")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const deadlineMs = deadlineForRuntime(RECONCILE_TIMEOUT_SECONDS);
    const runId = randomUUID();
    const lease = await waitForLease(runId, {
      allowBootstrap: true,
      deadlineMs,
      returnOnCompletion: false,
    });
    if (!lease.acquired) throw new Error("reconcileStats expects to always acquire the lease");
    const stopRenewal = startLeaseRenewal(runId, lease.generation, "stats_reconcile_lease_renewal_failed");
    try {
      const result = await reconcileAllStats();
      const publication = await publishReconciliation(result, runId, lease.generation);
      if (!publication.published) throw new Error("Stats reconciliation was fenced before publication");
      console.log(JSON.stringify({event: "stats_reconcile", runId, classroomCount: result.classroomCount, blockedByPendingMedia: result.blockedByPendingMedia}));
    } catch (error) {
      await markRunFailed(runId, lease.generation);
      console.error(JSON.stringify({event: "stats_reconcile_failed", runId, code: error.code || "unknown"}));
      throw error;
    } finally {
      stopRenewal();
    }
    return null;
  });
