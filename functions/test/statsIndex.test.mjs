import assert from "node:assert/strict";
import {Buffer} from "node:buffer";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {URL} from "node:url";
import {
  DELTA_TIMEOUT_SECONDS,
  MAX_ATOMIC_DOCUMENT_BYTES,
  MAX_ATOMIC_CLASSROOM_WRITES,
  RESPONSE_MARGIN_MS,
  acquireLease,
  assertAtomicPublicationFits,
  deadlineForRuntime,
  fetchDelta,
  publishDelta,
  publishReconciliation,
  renewLease,
  waitForLease,
} from "../stats/index.js";
import {
  AGGREGATION_STATE_VERSION,
  addObservationToDelta,
  createDeltaAccumulator,
  finalizeDelta,
} from "../stats/delta.js";

const ts = (seconds, nanoseconds = 0) => ({seconds, nanoseconds});

function fakeDoc(index, createdAt) {
  const id = `o${String(index).padStart(4, "0")}`;
  return {
    id,
    ref: {path: `students/s${index}/observations/${id}`},
    data: () => ({classroomId: "c1", studentId: `s${index}`, createdBy: "t1", type: "text", createdAt, observedAt: new Date("2026-08-20T00:00:00Z")}),
  };
}

function fakeDatabase(initial, commitFailures = []) {
  const store = new Map(Object.entries(initial));
  let transactionAttempts = 0;
  const ref = (collection, id) => ({id, path: `${collection}/${id}`});
  const snapshot = (documentRef) => ({
    exists: store.has(documentRef.path),
    id: documentRef.id,
    ref: documentRef,
    data: () => store.get(documentRef.path),
  });
  const database = {
    store,
    get transactionAttempts() { return transactionAttempts; },
    collection(name) {
      const query = {
        doc(id) { return ref(name, id); },
        orderBy() { return query; },
        startAt() { return query; },
        endAt() { return query; },
        async get() {
          return {
            docs: [...store.keys()]
              .filter((path) => path.startsWith(`${name}/classroom_`))
              .sort()
              .map((path) => snapshot(ref(name, path.slice(name.length + 1)))),
          };
        },
      };
      return query;
    },
    async runTransaction(operation) {
      transactionAttempts++;
      const staged = [];
      const transaction = {
        get: async (target) => {
          // Support both document refs and query objects (collection queries)
          if (target.get) {
            return target.get();
          }
          return snapshot(target);
        },
        set: (documentRef, data) => staged.push({type: "set", documentRef, data}),
        update: (documentRef, data) => staged.push({type: "update", documentRef, data}),
        delete: (documentRef) => staged.push({type: "delete", documentRef}),
      };
      const result = await operation(transaction);
      const failure = commitFailures.shift();
      if (failure) throw failure;
      for (const write of staged) {
        if (write.type === "delete") store.delete(write.documentRef.path);
        else if (write.type === "update") store.set(write.documentRef.path, {...store.get(write.documentRef.path), ...write.data});
        else store.set(write.documentRef.path, write.data);
      }
      return result;
    },
  };
  return database;
}

const emptyCache = (classroomId) => ({
  classroomId,
  classroomName: classroomId,
  cachedAt: "old-cache",
  effortCounts: {voice: 0, text: 0, lesson: 0, media: 0, total: 0},
  effortActivity: {},
  effortActivityByType: {},
  teachers: [],
  students: [],
  aggregationState: {version: AGGREGATION_STATE_VERSION, teacherRecent: {}, studentRecent: {}},
});

const runningMeta = (generation = 3, runId = "run-3") => ({
  deltaCursor: {createdAt: ts(10), documentPath: "students/s/observations/old"},
  deltaGeneration: generation,
  deltaRunId: runId,
  deltaRunStatus: "running",
  deltaLeaseUntilMs: 999999,
  cachedAt: "old-cache",
});

const emptyDelta = (cursor = {createdAt: ts(20), documentPath: "students/s/observations/new"}) => ({
  now: new Date("2026-08-22T00:00:00Z"),
  classrooms: new Map(),
  latestCursor: cursor,
});

test("delta query starts after the persisted exact cursor and paginates by values", async () => {
  const calls = [];
  const firstPage = Array.from({length: 1000}, (_, index) => fakeDoc(index, ts(200 + index, index)));
  const pages = [firstPage, [fakeDoc(1000, ts(1200, 99))]];
  const database = {
    collectionGroup(name) {
      const call = {name, orders: [], startAfter: null, limit: null};
      calls.push(call);
      const query = {
        orderBy(field, direction) { call.orders.push([field, direction]); return query; },
        startAfter(...values) { call.startAfter = values; return query; },
        limit(value) { call.limit = value; return query; },
        async get() { return {docs: pages.shift(), get size() { return this.docs.length; }}; },
      };
      return query;
    },
  };
  const cursor = {createdAt: ts(100, 987654321), documentPath: "students/s0/observations/prior"};
  const released = [];
  const delta = await fetchDelta(cursor, {database, now: new Date("2026-08-22T00:00:00Z"), onPageReleased: (size) => released.push(size)});
  assert.deepEqual(calls[0].startAfter, [cursor.createdAt, cursor.documentPath]);
  assert.deepEqual(calls[1].startAfter, [firstPage[999].data().createdAt, firstPage[999].ref.path]);
  assert.deepEqual(released, [1000, 1]);
  assert.equal(delta.pageCount, 2);
  assert.equal(delta.classrooms.get("c1").actionCount, 1001);
});

test("runtime and atomic publication limits are explicit and fail before writes", () => {
  assert.equal(DELTA_TIMEOUT_SECONDS, 120);
  assert.equal(RESPONSE_MARGIN_MS, 10_000);
  assert.equal(deadlineForRuntime(DELTA_TIMEOUT_SECONDS, 5_000), 115_000);
  assert.doesNotThrow(() => assertAtomicPublicationFits(Array.from({length: MAX_ATOMIC_CLASSROOM_WRITES}, () => ({data: {classroomId: "c"}}))));
  assert.throws(() => assertAtomicPublicationFits(Array.from({length: MAX_ATOMIC_CLASSROOM_WRITES + 1}, () => ({data: {classroomId: "c"}}))), /at most/);
  assert.throws(() => assertAtomicPublicationFits([{data: {payload: "x".repeat(MAX_ATOMIC_DOCUMENT_BYTES + 1)}}]), /document exceeds/);
});

test("10k observations retain bounded daily aggregation state below the document limit", () => {
  const now = new Date("2026-08-22T12:00:00Z");
  const state = createDeltaAccumulator(now);
  for (let index = 0; index < 10_000; index++) {
    const type = index % 3 === 0 ? "media" : index % 3 === 1 ? "lesson" : "text";
    addObservationToDelta(state, {
      classroomId: "c1", studentId: "s1", createdBy: "t1", type,
      status: "ready", handwritten: index % 6 === 0,
      observedAt: new Date(now.getTime() - (index % 42) * 24 * 60 * 60 * 1000 - index),
    });
  }
  const stateAt10k = finalizeDelta(state).classrooms.get("c1");
  const compactAt10k = {
    version: AGGREGATION_STATE_VERSION,
    teacherRecent: stateAt10k.teacherRecent,
    studentRecent: stateAt10k.studentRecent,
  };
  const bytesAt10k = Buffer.byteLength(JSON.stringify(compactAt10k));

  addObservationToDelta(state, {
    classroomId: "c1", studentId: "s1", createdBy: "t1", type: "text",
    status: "ready", observedAt: now,
  });
  const stateAt10001 = finalizeDelta(state).classrooms.get("c1");
  const compactAt10001 = {
    version: AGGREGATION_STATE_VERSION,
    teacherRecent: stateAt10001.teacherRecent,
    studentRecent: stateAt10001.studentRecent,
  };
  const bytesAt10001 = Buffer.byteLength(JSON.stringify(compactAt10001));

  assert.equal(Object.keys(compactAt10001.teacherRecent.t1).length, 30);
  assert.equal(Object.keys(compactAt10001.studentRecent.s1).length, 42);
  assert.equal(bytesAt10001, bytesAt10k);
  assert.ok(bytesAt10001 < MAX_ATOMIC_DOCUMENT_BYTES);
  assert.doesNotThrow(() => assertAtomicPublicationFits([{data: {aggregationState: compactAt10001}}]));
});

test("waiting callers return the newest successful generation without acquiring", async () => {
  const running = {deltaGeneration: 7, deltaRunStatus: "running"};
  const completed = {deltaGeneration: 7, deltaRunStatus: "completed", cachedAt: ts(500)};
  let acquireCalls = 0;
  let nowMs = 0;
  const result = await waitForLease("opaque-waiter", {
    acquire: async () => { acquireCalls++; return {acquired: false, meta: running}; },
    read: async () => completed,
    sleep: async (ms) => { nowMs += ms; },
    now: () => nowMs,
    deadlineMs: 2_000,
  });
  assert.equal(result.waited, true);
  assert.equal(result.meta, completed);
  assert.equal(acquireCalls, 1);
});

test("waiter observes completion between read and reacquire without starting a generation", async () => {
  const running = runningMeta(4, "active-run");
  const completed = {
    ...running,
    deltaRunStatus: "completed",
    deltaLeaseUntilMs: null,
    cachedAt: ts(600),
  };
  const database = fakeDatabase({"statsCache/_meta": running});
  let nowMs = 0;
  const result = await waitForLease("race-waiter", {
    acquire: (runId, options) => acquireLease(runId, {...options, database}),
    read: async () => {
      database.store.set("statsCache/_meta", completed);
      return running;
    },
    sleep: async (ms) => { nowMs += ms; },
    now: () => nowMs,
    deadlineMs: 3_000,
  });
  assert.equal(result.waited, true);
  assert.deepEqual(result.meta, completed);
  assert.equal(database.store.get("statsCache/_meta").deltaGeneration, 4);
  assert.equal(database.transactionAttempts, 2);
});

test("reconciliation waiter acquires after contention with bootstrap enabled", async () => {
  let nowMs = 0;
  const calls = [];
  const results = [
    {acquired: false, meta: {deltaGeneration: 4, deltaRunStatus: "running"}},
    {acquired: true, generation: 5, meta: {deltaGeneration: 4}},
  ];
  const lease = await waitForLease("reconcile-run", {
    acquire: async (_runId, options) => { calls.push(options); return results.shift(); },
    sleep: async (ms) => { nowMs += ms; },
    now: () => nowMs,
    deadlineMs: 5_000,
    allowBootstrap: true,
    returnOnCompletion: false,
  });
  assert.equal(lease.acquired, true);
  assert.equal(lease.generation, 5);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((options) => options.allowBootstrap), true);
});

test("lease waiter caps its final sleep at the absolute response deadline", async () => {
  let nowMs = 100;
  const sleeps = [];
  await assert.rejects(waitForLease("bounded-waiter", {
    acquire: async () => ({acquired: false, meta: {deltaGeneration: 4, deltaRunStatus: "running"}}),
    sleep: async (ms) => { sleeps.push(ms); nowMs += ms; },
    now: () => nowMs,
    deadlineMs: 550,
    returnOnCompletion: false,
  }), (error) => error.code === "deadline-exceeded");
  assert.deepEqual(sleeps, [450]);
  assert.equal(nowMs, 550);
});

test("lease renewal racing completed metadata leaves the terminal lease null", async () => {
  const completed = {
    ...runningMeta(),
    deltaRunStatus: "completed",
    deltaLeaseUntilMs: null,
  };
  const database = fakeDatabase({"statsCache/_meta": completed});

  const renewed = await renewLease("run-3", 3, {database, nowMs: 1_000});

  assert.equal(renewed, false);
  assert.equal(database.store.get("statsCache/_meta").deltaLeaseUntilMs, null);
});

test("lease renewal racing failed metadata leaves the terminal lease null", async () => {
  const failed = {
    ...runningMeta(),
    deltaRunStatus: "failed",
    deltaLeaseUntilMs: null,
  };
  const database = fakeDatabase({"statsCache/_meta": failed});

  const renewed = await renewLease("run-3", 3, {database, nowMs: 1_000});

  assert.equal(renewed, false);
  assert.equal(database.store.get("statsCache/_meta").deltaLeaseUntilMs, null);
});

test("delta publication atomically commits classroom data and its exact cursor", async () => {
  const database = fakeDatabase({
    "statsCache/_meta": runningMeta(),
    "statsCache/classroom_c1": emptyCache("c1"),
  });
  const publishedAt = {seconds: 30, nanoseconds: 123};
  const delta = emptyDelta();
  const result = await publishDelta(delta, "run-3", 3, {database, publishedAt});
  assert.equal(result.published, true);
  assert.equal(database.store.get("statsCache/classroom_c1").cachedAt, publishedAt);
  assert.equal(database.store.get("statsCache/_meta").cachedAt, publishedAt);
  assert.deepEqual(database.store.get("statsCache/_meta").deltaCursor, delta.latestCursor);
  assert.equal(database.store.get("statsCache/_meta").deltaRunStatus, "completed");
});

test("persistent publication failure preserves classroom data and cursor", async () => {
  const failures = Array.from({length: 3}, () => ({code: "unavailable"}));
  const meta = runningMeta();
  const classroom = emptyCache("c1");
  const database = fakeDatabase({
    "statsCache/_meta": meta,
    "statsCache/classroom_c1": classroom,
  }, failures);
  await assert.rejects(publishDelta(emptyDelta(), "run-3", 3, {
    database,
    retrySleep: async () => {},
  }), (error) => error.code === "unavailable");
  assert.equal(database.transactionAttempts, 3);
  assert.equal(database.store.get("statsCache/_meta"), meta);
  assert.equal(database.store.get("statsCache/classroom_c1"), classroom);
});

test("transient publication failure retries the whole atomic transaction", async () => {
  const database = fakeDatabase({
    "statsCache/_meta": runningMeta(),
    "statsCache/classroom_c1": emptyCache("c1"),
  }, [{code: "aborted"}]);
  const result = await publishDelta(emptyDelta(), "run-3", 3, {
    database,
    retrySleep: async () => {},
  });
  assert.equal(result.published, true);
  assert.equal(database.transactionAttempts, 2);
  assert.equal(database.store.get("statsCache/_meta").deltaRunStatus, "completed");
});

test("fencing prevents stale delta publication from changing cache state", async () => {
  const meta = runningMeta(4, "newer-run");
  const classroom = emptyCache("c1");
  const database = fakeDatabase({
    "statsCache/_meta": meta,
    "statsCache/classroom_c1": classroom,
  });
  const result = await publishDelta(emptyDelta(), "run-3", 3, {database});
  assert.equal(result.published, false);
  assert.equal(database.store.get("statsCache/_meta"), meta);
  assert.equal(database.store.get("statsCache/classroom_c1"), classroom);
});

test("reconciliation publication replaces active caches and deletes stale ones atomically", async () => {
  const database = fakeDatabase({
    "statsCache/_meta": runningMeta(),
    "statsCache/classroom_c1": emptyCache("c1"),
    "statsCache/classroom_stale": emptyCache("stale"),
  });
  const publishedAt = {seconds: 40, nanoseconds: 456};
  const latestCursor = {createdAt: ts(35, 99), documentPath: "students/s/observations/latest"};
  const result = await publishReconciliation({
    classrooms: [{...emptyCache("c1"), classroomName: "Rebuilt"}],
    classroomCount: 1,
    latestCursor,
  }, "run-3", 3, {database, publishedAt});
  assert.equal(result.published, true);
  assert.equal(database.store.get("statsCache/classroom_c1").classroomName, "Rebuilt");
  assert.equal(database.store.has("statsCache/classroom_stale"), false);
  assert.deepEqual(database.store.get("statsCache/_meta").deltaCursor, latestCursor);
  assert.equal(database.store.get("statsCache/_meta").lastFullReconciliationAt, publishedAt);
});

test("reconciliation does not publish a partial result behind a pending media barrier", async () => {
  const active = emptyCache("c1");
  const database = fakeDatabase({
    "statsCache/_meta": runningMeta(),
    "statsCache/classroom_c1": active,
  });
  await assert.rejects(
    publishReconciliation({
      classrooms: [{...active, effortCounts: {...active.effortCounts, total: 0}}],
      classroomCount: 1,
      latestCursor: {createdAt: ts(35), documentPath: "students/s/observations/before"},
      blockedByPendingMedia: true,
    }, "run-3", 3, {database}),
    /blocked by pending media/
  );
  assert.equal(database.transactionAttempts, 0);
  assert.equal(database.store.get("statsCache/classroom_c1"), active);
});

test("reconciliation fencing preserves active and stale caches", async () => {
  const meta = runningMeta(4, "newer-run");
  const active = emptyCache("c1");
  const stale = emptyCache("stale");
  const database = fakeDatabase({
    "statsCache/_meta": meta,
    "statsCache/classroom_c1": active,
    "statsCache/classroom_stale": stale,
  });
  const result = await publishReconciliation({
    classrooms: [{...active, classroomName: "Should not publish"}],
    classroomCount: 1,
    latestCursor: {createdAt: ts(50), documentPath: "students/s/observations/newer"},
  }, "run-3", 3, {database});
  assert.equal(result.published, false);
  assert.equal(database.store.get("statsCache/_meta"), meta);
  assert.equal(database.store.get("statsCache/classroom_c1"), active);
  assert.equal(database.store.get("statsCache/classroom_stale"), stale);
});

test("stats collection-group queries have source-controlled single-field indexes", async () => {
  const indexes = JSON.parse(await readFile(new URL("../../firestore.indexes.json", import.meta.url), "utf8"));
  const hasAscendingCollectionGroupOverride = (fieldPath) => indexes.fieldOverrides.some((override) =>
    override.collectionGroup === "observations" && override.fieldPath === fieldPath &&
    override.indexes.some((index) => index.order === "ASCENDING" && index.queryScope === "COLLECTION_GROUP"));
  assert.equal(hasAscendingCollectionGroupOverride("groupId"), true);
  assert.equal(hasAscendingCollectionGroupOverride("createdAt"), true);
});
