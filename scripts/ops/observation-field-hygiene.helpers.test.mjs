import test from "node:test";
import assert from "node:assert/strict";
import {
  DEAD_FIELDS,
  classifyDocId,
  createCensus,
  recordDoc,
  fieldsToDelete,
} from "./observation-field-hygiene.helpers.mjs";

// --- DEAD_FIELDS ---

test("DEAD_FIELDS contains exactly the #294-approved fields", () => {
  // attendanceStatus: never-varying stub; branchId: partial denorm, no reader.
  // isRootObservation is added only if the census proves it exists in prod.
  assert.deepEqual([...DEAD_FIELDS].sort(), ["attendanceStatus", "branchId"]);
});

// --- classifyDocId ---

test("classifyDocId recognizes standard app-created IDs", () => {
  assert.equal(classifyDocId("obs_muofqs6o_8dnj_2025"), "obs_standard");
  assert.equal(classifyDocId("lesson_muofe8fz_7yxh_2025"), "lesson_standard");
  assert.equal(classifyDocId("media_mt7akpn3_kizl_2025"), "media_standard");
});

test("classifyDocId recognizes bulk-upload IDs", () => {
  assert.equal(classifyDocId("obs_bulk_lx1234_abc456"), "obs_bulk");
  assert.equal(classifyDocId("lesson_bulk_lx1234_abc456"), "lesson_bulk");
});

test("classifyDocId recognizes offline-queue sq_ fallback IDs (#227 census)", () => {
  // Real shape: {prefix}_sq_{rand8}_{ts36} per saveQueue.js line 520
  assert.equal(classifyDocId("obs_sq_abc12345_lx9r2t"), "obs_sq_fallback");
  assert.equal(classifyDocId("lesson_sq_abc12345_lx9r2t"), "lesson_sq_fallback");
  assert.equal(classifyDocId("media_sq_rtzkvi1b_mpxynami"), "media_sq_fallback");
});

test("classifyDocId recognizes assessment IDs", () => {
  assert.equal(classifyDocId("sa_src123_4_1"), "structured_assessment");
  assert.equal(classifyDocId("assessment_medical_AbC123xyz9"), "medical_assessment");
});

test("classifyDocId recognizes Firestore auto-generated IDs (legacy)", () => {
  assert.equal(classifyDocId("rXD48uE7eMGUYdRsXmTn"), "firestore_auto_id");
  assert.equal(classifyDocId("45mV5rN37mfaIifsMGJD"), "firestore_auto_id");
});

test("classifyDocId buckets everything else as other", () => {
  assert.equal(classifyDocId("randomjunk"), "other");
  assert.equal(classifyDocId("obs_onlytwoparts"), "other");
  assert.equal(classifyDocId(""), "other");
  // 19 chars - not a Firestore auto-ID
  assert.equal(classifyDocId("rXD48uE7eMGUYdRsXmT"), "other");
});

// --- census accumulation ---

test("census counts id shapes, types, and field frequency per type", () => {
  const census = createCensus();
  recordDoc(census, {
    id: "obs_muofqs6o_8dnj_2025",
    type: "voice",
    fieldNames: ["type", "text", "attendanceStatus"],
  });
  recordDoc(census, {
    id: "lesson_muofe8fz_7yxh_2025",
    type: "lesson",
    fieldNames: ["type", "lessonTitle", "attendanceStatus", "branchId"],
  });
  recordDoc(census, {
    id: "lesson_bulk_lx1234_abc456",
    type: "lesson",
    fieldNames: ["type", "lessonTitle", "branchId"],
  });

  assert.equal(census.total, 3);
  assert.equal(census.idShapes.obs_standard, 1);
  assert.equal(census.idShapes.lesson_standard, 1);
  assert.equal(census.idShapes.lesson_bulk, 1);
  assert.equal(census.typeCounts.voice, 1);
  assert.equal(census.typeCounts.lesson, 2);
  assert.equal(census.fieldCensus.lesson.lessonTitle, 2);
  assert.equal(census.fieldCensus.lesson.attendanceStatus, 1);
  assert.equal(census.fieldCensus.lesson.branchId, 2);
  assert.equal(census.fieldCensus.voice.attendanceStatus, 1);
});

test("census buckets docs with missing type under (missing)", () => {
  const census = createCensus();
  recordDoc(census, { id: "weird", type: undefined, fieldNames: ["text"] });
  assert.equal(census.typeCounts["(missing)"], 1);
  assert.equal(census.fieldCensus["(missing)"].text, 1);
});

// --- fieldsToDelete ---

test("fieldsToDelete returns only dead fields present on the doc", () => {
  assert.deepEqual(
    fieldsToDelete(
      { type: "lesson", attendanceStatus: "present", lessonTitle: "x" },
      DEAD_FIELDS,
    ),
    ["attendanceStatus"],
  );
  assert.deepEqual(
    fieldsToDelete({ attendanceStatus: "present", branchId: "hsr" }, DEAD_FIELDS),
    ["attendanceStatus", "branchId"],
  );
  assert.deepEqual(fieldsToDelete({ type: "voice", text: "hi" }, DEAD_FIELDS), []);
});
