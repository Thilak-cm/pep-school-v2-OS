import * as functions from "firebase-functions/v1";
import {db, storage, Timestamp} from "../shared/firebase.js";
import {buildStructuredAssessmentId, normalizeFilename} from "./parser.js";

const MAX_RECORDS = 450;

async function canUpload(user, uid, classroomIds) {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  if (user.role === "teacher") {
    // Teacher classroom scope is authoritative on classroom.teacherIds, not
    // on the user profile. This mirrors Firestore's isTeacherInClassroom().
    const classroomSnap = await db.collection("classrooms").where("teacherIds", "array-contains", uid).get();
    const teacherClassroomIds = new Set(classroomSnap.docs.map((doc) => doc.id));
    return classroomIds.every((id) => teacherClassroomIds.has(id));
  }
  if (user.role === "classroomadmin") return classroomIds.every((id) => (user.manageableClassrooms || []).includes(id));
  return false;
}

export const publishStructuredAssessment = functions
  .region("asia-south1")
  .runWith({timeoutSeconds: 120, memory: "512MB"})
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in before publishing an assessment.");
    const metadata = data?.metadata || {};
    const definitions = Array.isArray(data?.resultDefinitions) ? data.resultDefinitions : [];
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    if (!metadata.assessmentName || !metadata.assessmentDescription || !metadata.dateRange || !definitions.length || !rows.length) {
      throw new functions.https.HttpsError("invalid-argument", "Assessment metadata, result definitions, and student rows are required.");
    }
    if (rows.length > MAX_RECORDS) throw new functions.https.HttpsError("invalid-argument", `This upload would create ${rows.length} records. The maximum is ${MAX_RECORDS}.`);

    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    const user = userSnap.data() || {};
    const studentIds = [...new Set(rows.map((row) => String(row.studentId || "")).filter(Boolean))];
    const studentSnapshots = await db.getAll(...studentIds.map((studentId) => db.collection("students").doc(studentId)));
    const studentClassrooms = new Map(studentSnapshots.filter((snapshot) => snapshot.exists && (!snapshot.data()?.status || snapshot.data()?.status === "active")).map((snapshot) => [snapshot.id, snapshot.data()?.classroomId]));
    if (studentClassrooms.size !== studentIds.length || rows.some((row) => studentClassrooms.get(String(row.studentId)) !== row.classroomId)) {
      throw new functions.https.HttpsError("permission-denied", "One or more selected students no longer belongs to the selected classroom scope.");
    }
    const classroomIds = [...new Set(rows.map((row) => row.classroomId).filter(Boolean))];
    if (!await canUpload(user, context.auth.uid, classroomIds)) throw new functions.https.HttpsError("permission-denied", "You do not have access to every selected student.");
    const rowKeys = rows.map((row) => `${row.sourceRow}:${row.segment}`);
    if (new Set(rowKeys).size !== rowKeys.length) {
      throw new functions.https.HttpsError("invalid-argument", "The upload contains duplicate source row segments.");
    }

    const sourceRef = db.collection("structuredAssessmentSources").doc();
    const selectedSheetStoragePath = data.selectedSheetBase64
      ? `structured-assessments/${sourceRef.id}/selected-sheet.xlsx`
      : null;
    if (data.selectedSheetBase64) {
      await storage.bucket().file(selectedSheetStoragePath).save(Buffer.from(String(data.selectedSheetBase64), "base64"), {
        resumable: false,
        metadata: {contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
      });
    }
    const now = Timestamp.now();
    const batch = db.batch();
    batch.set(sourceRef, {
      schemaVersion: 1,
      assessmentName: String(metadata.assessmentName),
      assessmentDescription: String(metadata.assessmentDescription),
      dateRange: metadata.dateRange,
      resultDefinitions: definitions,
      normalizedFilename: normalizeFilename(data.fileName || ""),
      sourceFileName: String(data.fileName || ""),
      worksheetName: String(data.worksheetName || ""),
      selectedSheetStoragePath,
      classroomIds,
      studentIds: [...new Set(rows.map((row) => row.studentId).filter(Boolean))],
      recordCount: rows.length,
      createdBy: context.auth.uid,
      createdAt: now,
      publishedAt: now,
    });
    rows.forEach((row) => {
      const studentId = String(row.studentId || "");
      const observationId = buildStructuredAssessmentId(sourceRef.id, row.sourceRow, row.segment);
      const observationRef = db.collection("students").doc(studentId).collection("observations").doc(observationId);
      batch.set(observationRef, {
        type: "assessment",
        assessmentKind: "structured",
        schemaVersion: 1,
        sourceId: sourceRef.id,
        studentId,
        classroomId: row.classroomId || null,
        branchId: row.branchId || null,
        assessmentName: String(metadata.assessmentName),
        assessmentDescription: String(metadata.assessmentDescription),
        assessmentDate: metadata.dateRange,
        values: row.values || {},
        sourceRow: Number(row.sourceRow),
        sourceSegment: Number(row.segment),
        createdBy: context.auth.uid,
        createdAt: now,
        observedAt: Timestamp.fromDate(new Date(`${metadata.dateRange.endDate}T00:00:00Z`)),
        updatedAt: now,
      });
    });
    try {
      await batch.commit();
    } catch {
      if (selectedSheetStoragePath) await storage.bucket().file(selectedSheetStoragePath).delete().catch(() => {});
      throw new functions.https.HttpsError("internal", "Assessment publication failed; no records were published.");
    }
    return {sourceId: sourceRef.id, recordCount: rows.length};
  });

// Medical assessments are intentionally student-scoped: unlike structured
// workbooks they never fan out and therefore do not need a source collection.
export const publishMedicalAssessment = functions
  .region("asia-south1")
  .runWith({timeoutSeconds: 120, memory: "512MB"})
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in before uploading a medical assessment.");
    const studentId = String(data?.studentId || "");
    const fileName = String(data?.fileName || "medical-assessment.pdf");
    const base64 = String(data?.fileBase64 || "");
    if (!studentId || !base64 || !fileName.toLowerCase().endsWith(".pdf")) {
      throw new functions.https.HttpsError("invalid-argument", "A student and PDF file are required.");
    }
    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    const user = userSnap.data() || {};
    const studentSnap = await db.collection("students").doc(studentId).get();
    const student = studentSnap.data() || {};
    if (!studentSnap.exists || (student.status && student.status !== "active")) {
      throw new functions.https.HttpsError("permission-denied", "This student is not active.");
    }
    if (!await canUpload(user, context.auth.uid, [student.classroomId])) {
      throw new functions.https.HttpsError("permission-denied", "You do not have access to this student.");
    }
    const now = Timestamp.now();
    const safeName = normalizeFilename(fileName) || "medical-assessment.pdf";
    const observationId = `Assessment_medical_${Date.now()}`;
    const storagePath = `students/${studentId}/observations/${observationId}/${safeName}`;
    await storage.bucket().file(storagePath).save(Buffer.from(base64, "base64"), {
      resumable: false,
      metadata: {contentType: "application/pdf"},
    });
    try {
      await db.collection("students").doc(studentId).collection("observations").doc(observationId).set({
        type: "assessment",
        assessmentKind: "medical",
        schemaVersion: 1,
        studentId,
        classroomId: student.classroomId || null,
        assessmentName: fileName.replace(/\.pdf$/i, ""),
        assessmentDescription: String(data?.note || ""),
        originalFile: {storagePath, fileName, contentType: "application/pdf"},
        createdBy: context.auth.uid,
        createdByName: String(user.displayName || user.name || user.email || ""),
        createdAt: now,
        observedAt: now,
        processingStatus: "pending",
      });
    } catch {
      await storage.bucket().file(storagePath).delete().catch(() => {});
      throw new functions.https.HttpsError("internal", "Medical assessment upload failed; no record was published.");
    }
    return {observationId};
  });
