import * as functions from "firebase-functions/v1";
import * as XLSX from "xlsx";
import {db, storage, Timestamp} from "../shared/firebase.js";
import {
  buildStructuredAssessmentId,
  normalizeFilename,
  parseAssessmentMatrix,
  worksheetToAssessmentMatrix,
} from "./parser.js";

const MAX_RECORDS = 450;
const MAX_STRUCTURED_BYTES = 10 * 1024 * 1024;
const MAX_MEDICAL_BYTES = 25 * 1024 * 1024;
const STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STRUCTURED_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function requiredString(value, field, maxLength = 5000) {
  const result = String(value ?? "").trim();
  if (!result || result.length > maxLength) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `${field} is required and must be ${maxLength} characters or fewer.`,
    );
  }
  return result;
}

function optionalString(value, maxLength = 5000) {
  const result = String(value ?? "").trim();
  if (result.length > maxLength) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `Text fields must be ${maxLength} characters or fewer.`,
    );
  }
  return result;
}

function normalizedName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dateTimestamp(value) {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Assessment date must be a valid date.",
    );
  }
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Assessment date must be a valid date.",
    );
  }
  return Timestamp.fromDate(date);
}

async function getCaller(uid) {
  const snap = await db.collection("users").doc(uid).get();
  const user = snap.data() || null;
  if (!snap.exists || !["teacher", "classroomadmin", "superadmin"].includes(user?.role)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Your account is not authorized to manage assessments.",
    );
  }
  return user;
}

async function teacherClassroomIds(uid) {
  const snap = await db.collection("classrooms")
    .where("teacherIds", "array-contains", uid)
    .get();
  return new Set(snap.docs.map((doc) => doc.id));
}

async function authorizedClassrooms(user, uid) {
  if (user.role === "superadmin") return null;
  if (user.role === "teacher") return teacherClassroomIds(uid);
  return new Set(user.manageableClassrooms || []);
}

async function canAccessClassrooms(user, uid, classroomIds) {
  if (user.role === "superadmin") return true;
  const allowed = await authorizedClassrooms(user, uid);
  return classroomIds.every((id) => allowed.has(id));
}

function hasClassroomCoverage(user, allowedClassrooms, classroomIds) {
  return user.role === "superadmin" ||
    classroomIds.every((id) => allowedClassrooms.has(id));
}

function canDeleteAssessments(user, classroomIds) {
  return user.role === "superadmin" ||
    user.role === "classroomadmin" &&
    classroomIds.length > 0 &&
    classroomIds.every((id) => (user.manageableClassrooms || []).includes(id));
}

function validationError(message, errors) {
  return new functions.https.HttpsError(
    "invalid-argument",
    message,
    {errors},
  );
}

function pendingStructuredRef(uploadId) {
  return db.collection("pendingStructuredAssessmentUploads").doc(uploadId);
}

function structuredDownloadFilename(sourceFileName) {
  const base = sourceFileName.replace(/\.(?:csv|xlsx)$/i, "") ||
    "assessment-source";
  return `${base}.xlsx`;
}

function timestampIso(value) {
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  return null;
}

async function cleanupPendingArtifacts({
  pendingRef,
  pending,
  paths,
  reason,
}) {
  const cleanupPaths = [...new Set((paths || []).filter(Boolean))];
  const cleanupAttempts = Number(pending.cleanupAttempts || 0) + 1;
  const cleanupState = {
    uploadStatus: "cleanup_pending",
    cleanupPaths,
    cleanupReason: reason,
    cleanupAttempts,
    cleanupUpdatedAt: Timestamp.now(),
  };

  // Persist every cleanup target before deleting anything. If the process dies
  // mid-cleanup, the scheduled sweeper can resume from this durable reference.
  await pendingRef.set(cleanupState, {merge: true});

  const failures = [];
  for (const storagePath of cleanupPaths) {
    try {
      await storage.bucket().file(storagePath).delete({ignoreNotFound: true});
    } catch (error) {
      failures.push({
        storagePath,
        code: String(error?.code || "storage-delete-failed"),
      });
    }
  }
  if (failures.length) {
    await pendingRef.set({
      cleanupFailures: failures,
      cleanupUpdatedAt: Timestamp.now(),
    }, {merge: true});
    const error = new Error("One or more staged assessment files could not be deleted.");
    error.cleanupFailures = failures;
    throw error;
  }
  await pendingRef.delete();
  return {removed: true};
}

function parseStructuredWorkbook(bytes) {
  if (!bytes.length || bytes.length > MAX_STRUCTURED_BYTES) {
    throw validationError("The selected worksheet must be 10 MB or smaller.", [{
      code: "FILE_SIZE",
      message: "Reduce the selected worksheet to 10 MB or less and upload it again.",
    }]);
  }

  let workbook;
  try {
    workbook = XLSX.read(bytes, {
      type: "buffer",
      cellFormula: true,
      cellNF: true,
      cellText: true,
    });
  } catch {
    throw validationError("The selected worksheet could not be read.", [{
      code: "INVALID_WORKBOOK",
      message: "Recalculate and save the workbook, then upload it again.",
    }]);
  }
  if (workbook.SheetNames.length !== 1) {
    throw validationError("Publish exactly one selected worksheet.", [{
      code: "WORKSHEET_COUNT",
      message: "Return to worksheet selection and choose one worksheet.",
    }]);
  }
  const worksheetName = workbook.SheetNames[0];
  const matrix = worksheetToAssessmentMatrix(
    workbook.Sheets[worksheetName],
    XLSX,
  );
  const parsed = parseAssessmentMatrix(matrix, {worksheetName});
  if (parsed.errors.length || !parsed.rows.length) {
    throw validationError(
      "The worksheet has validation errors. Nothing was published.",
      parsed.errors,
    );
  }
  return {parsed, worksheetName};
}

function buildMappings(data, parsedRows) {
  const mappings = Array.isArray(data?.mappings) ? data.mappings : [];
  if (mappings.length > MAX_RECORDS) {
    throw validationError("Too many student mappings were submitted.", [{
      code: "INVALID_MAPPING",
      message: `Submit no more than ${MAX_RECORDS} student mappings.`,
    }]);
  }
  const expectedNames = new Map();
  parsedRows.forEach((row) => expectedNames.set(normalizedName(row.name), row.name));
  const byName = new Map();
  for (const mapping of mappings) {
    const sourceName = normalizedName(mapping?.sourceName);
    const studentId = String(mapping?.studentId || "").trim();
    if (!expectedNames.has(sourceName) ||
        sourceName.length > 500 ||
        !studentId ||
        studentId.length > 128 ||
        byName.has(sourceName)) {
      throw validationError("Student mappings are incomplete or invalid.", [{
        code: "INVALID_MAPPING",
        message: "Review every source name and accept exactly one student match.",
      }]);
    }
    byName.set(sourceName, studentId);
  }
  if (byName.size !== expectedNames.size) {
    const unresolved = [...expectedNames.entries()]
      .filter(([name]) => !byName.has(name))
      .map(([, displayName]) => displayName);
    throw validationError("Every source name must be resolved before publication.", [{
      code: "UNRESOLVED_STUDENT",
      message: `Resolve: ${unresolved.join(", ")}.`,
    }]);
  }
  return byName;
}

async function loadMappedStudents(mappingByName) {
  const studentIds = [...new Set(mappingByName.values())];
  const snapshots = await db.getAll(...studentIds.map((studentId) => (
    db.collection("students").doc(studentId)
  )));
  const students = new Map();
  snapshots.forEach((snapshot) => {
    const data = snapshot.data() || {};
    if (snapshot.exists && (data.status || "active") === "active") {
      students.set(snapshot.id, data);
    }
  });
  if (students.size !== studentIds.length) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "One or more selected students is no longer active.",
    );
  }
  return students;
}

function mappedRows(parsedRows, mappingByName, students) {
  const rows = parsedRows.map((row) => {
    const studentId = mappingByName.get(normalizedName(row.name));
    const student = students.get(studentId);
    return {
      ...row,
      studentId,
      classroomId: student.classroomId || null,
    };
  });
  const sourceRowsByStudent = new Map();
  rows.forEach((row) => {
    if (!sourceRowsByStudent.has(row.studentId)) {
      sourceRowsByStudent.set(row.studentId, new Set());
    }
    sourceRowsByStudent.get(row.studentId).add(row.sourceRow);
  });
  for (const [studentId, sourceRows] of sourceRowsByStudent) {
    if (sourceRows.size > 1) {
      throw validationError("Two source rows cannot resolve to the same student.", [{
        code: "DUPLICATE_STUDENT_MAPPING",
        message: `Rows ${[...sourceRows].join(" and ")} resolve to student ${studentId}. Combine repeated events into aligned multiline values in one row.`,
      }]);
    }
  }
  return rows;
}

export const createStructuredAssessmentUpload = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign in before uploading an assessment.",
      );
    }
    await getCaller(context.auth.uid);
    const sourceFileName = requiredString(
      data?.originalFilename,
      "Original filename",
      255,
    );
    const contentType = String(data?.contentType || "").toLowerCase();
    const sizeBytes = Number(data?.sizeBytes);
    if (!/\.(csv|xlsx)$/i.test(sourceFileName) ||
        contentType !== STRUCTURED_CONTENT_TYPE ||
        !Number.isInteger(sizeBytes) ||
        sizeBytes <= 0 ||
        sizeBytes > MAX_STRUCTURED_BYTES) {
      throw validationError("Choose a valid selected worksheet.", [{
        code: "FILE_VALIDATION",
        message: "The selected worksheet must be an XLSX file no larger than 10 MB.",
      }]);
    }

    const pendingRef = db.collection("pendingStructuredAssessmentUploads").doc();
    const storagePath =
      `pending-structured-assessments/${pendingRef.id}/selected-sheet.xlsx`;
    const now = Timestamp.now();
    await pendingRef.set({
      kind: "structured_assessment_upload",
      schemaVersion: 1,
      sourceFileName,
      normalizedFilename: normalizeFilename(sourceFileName),
      selectedSheet: {
        storagePath,
        contentType: STRUCTURED_CONTENT_TYPE,
        sizeBytes,
        downloadFilename: structuredDownloadFilename(sourceFileName),
      },
      createdBy: context.auth.uid,
      createdAt: now,
      updatedAt: now,
      uploadStatus: "pending_upload",
    });
    return {uploadId: pendingRef.id, storagePath};
  });

export const findStructuredAssessmentDuplicate = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const user = await getCaller(context.auth.uid);
    const filenameKey = normalizeFilename(data?.fileName || "");
    if (!filenameKey) return {duplicate: null};
    const allowedClassrooms = await authorizedClassrooms(
      user,
      context.auth.uid,
    );
    let cursor = null;
    while (true) {
      let query = db.collection("structuredAssessmentSources")
        .where("normalizedFilename", "==", filenameKey)
        .orderBy("__name__")
        .limit(10);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      for (const doc of snap.docs) {
        const source = doc.data() || {};
        const classroomIds = Array.isArray(source.classroomIds) ?
          source.classroomIds : [];
        if (hasClassroomCoverage(user, allowedClassrooms, classroomIds)) {
          const publishedAt = source.publishedAt || source.createdAt || null;
          return {
            duplicate: {
              sourceId: doc.id,
              assessmentName: source.assessmentName || "Assessment",
              dateRange: source.dateRange || null,
              worksheetName: source.worksheetName || "",
              publishedAt: timestampIso(publishedAt),
              uploaderName: source.uploader?.displayName ||
                source.createdByName || "Unknown uploader",
              studentCount: source.studentCount || 0,
            },
          };
        }
      }
      if (snap.size < 10) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return {duplicate: null};
  });

export const publishStructuredAssessment = functions
  .region("asia-south1")
  .runWith({timeoutSeconds: 120, memory: "512MB"})
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign in before publishing an assessment.",
      );
    }
    const uploadId = requiredString(data?.uploadId, "Structured upload", 128);
    const pendingRef = pendingStructuredRef(uploadId);
    let pending = null;
    let finalStoragePath = null;
    let finalFileCreated = false;
    let published = false;
    try {
      pending = await db.runTransaction(async (transaction) => {
        const pendingSnap = await transaction.get(pendingRef);
        const value = pendingSnap.data() || {};
        if (!pendingSnap.exists ||
            value.kind !== "structured_assessment_upload" ||
            value.uploadStatus !== "pending_upload" ||
            value.createdBy !== context.auth.uid) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "This structured upload can no longer be published.",
          );
        }
        transaction.update(pendingRef, {
          uploadStatus: "processing",
          updatedAt: Timestamp.now(),
        });
        return value;
      });

      const user = await getCaller(context.auth.uid);
      const stagingFile = storage.bucket().file(
        pending.selectedSheet.storagePath,
      );
      let metadata;
      let bytes;
      try {
        [[metadata], [bytes]] = await Promise.all([
          stagingFile.getMetadata(),
          stagingFile.download(),
        ]);
      } catch {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "The selected worksheet upload did not complete. Choose the file and retry.",
        );
      }
      const sizeBytes = Number(metadata.size);
      const contentType = String(metadata.contentType || "").toLowerCase();
      if (contentType !== STRUCTURED_CONTENT_TYPE ||
          sizeBytes !== pending.selectedSheet.sizeBytes ||
          sizeBytes > MAX_STRUCTURED_BYTES ||
          bytes.length !== sizeBytes) {
        throw validationError("The uploaded worksheet did not match the selected file.", [{
          code: "FILE_VALIDATION",
          message: "Choose the worksheet again and retry the upload.",
        }]);
      }

      const {parsed, worksheetName} = parseStructuredWorkbook(bytes);
      if (parsed.rows.length > MAX_RECORDS) {
        throw validationError("This worksheet exceeds the record limit.", [{
          code: "RECORD_LIMIT",
          message: `This upload would create ${parsed.rows.length} records. The maximum is ${MAX_RECORDS}.`,
        }]);
      }
      const mappingByName = buildMappings(data, parsed.rows);
      const students = await loadMappedStudents(mappingByName);
      const rows = mappedRows(parsed.rows, mappingByName, students);
      const classroomIds = [...new Set(
        rows.map((row) => row.classroomId).filter(Boolean),
      )];
      if (!classroomIds.length || !await canAccessClassrooms(
        user,
        context.auth.uid,
        classroomIds,
      )) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You do not have access to every selected student.",
        );
      }

      const sourceRef = db.collection("structuredAssessmentSources").doc();
      finalStoragePath =
        `structured-assessments/${sourceRef.id}/selected-sheet.xlsx`;
      const now = Timestamp.now();
      const observedAt = Timestamp.fromDate(new Date(
        `${parsed.metadata.dateRange.endDate}T00:00:00.000Z`,
      ));
      const studentIds = [...new Set(rows.map((row) => row.studentId))];
      const sourceFileName = pending.sourceFileName;
      const recordRefs = rows.map((row) => ({
        studentId: row.studentId,
        observationId: buildStructuredAssessmentId(
          sourceRef.id,
          row.sourceRow,
          row.segment,
        ),
      }));

      await pendingRef.update({
        cleanupPaths: [
          pending.selectedSheet.storagePath,
          finalStoragePath,
        ],
        updatedAt: Timestamp.now(),
      });
      finalFileCreated = true;
      await stagingFile.copy(storage.bucket().file(finalStoragePath));

      const batch = db.batch();
      batch.set(sourceRef, {
      schemaVersion: 1,
      assessmentName: parsed.metadata.assessmentName,
      assessmentDescription: parsed.metadata.assessmentDescription,
      dateRange: parsed.metadata.dateRange,
      resultDefinitions: parsed.resultDefinitions,
      normalizedFilename: pending.normalizedFilename,
      sourceFileName,
      worksheetName,
      selectedSheet: {
        storagePath: finalStoragePath,
        contentType: STRUCTURED_CONTENT_TYPE,
        sizeBytes: bytes.length,
        downloadFilename: pending.selectedSheet.downloadFilename,
      },
      uploader: {
        uid: context.auth.uid,
        displayName: user.displayName || user.name || user.email || "Unknown uploader",
      },
      classroomIds,
      studentIds,
      studentCount: studentIds.length,
      recordCount: rows.length,
      multilineSplitCount: rows.length - new Set(
        rows.map((row) => row.sourceRow),
      ).size,
      recordRefs,
      // #313: criticality from XLSX metadata; denormed counts for listMyAssessmentUploads
      criticality: parsed.metadata.criticality || "low",
      pendingCount: rows.filter((r) => r.gradeStatus === "absent").length,
      gradedCount: rows.filter((r) => r.gradeStatus !== "absent").length,
      createdBy: context.auth.uid,
      createdByName: user.displayName || user.name || user.email || "Unknown uploader",
      createdAt: now,
      publishedAt: now,
    });
      rows.forEach((row) => {
      const observationId = buildStructuredAssessmentId(
        sourceRef.id,
        row.sourceRow,
        row.segment,
      );
      const observationRef = db.collection("students")
        .doc(row.studentId)
        .collection("observations")
        .doc(observationId);
      batch.set(observationRef, {
        type: "assessment",
        assessmentKind: "structured",
        schemaVersion: 1,
        sourceId: sourceRef.id,
        studentId: row.studentId,
        classroomId: row.classroomId,
        assessmentName: parsed.metadata.assessmentName,
        assessmentDescription: parsed.metadata.assessmentDescription,
        assessmentDate: parsed.metadata.dateRange,
        resultDefinitions: parsed.resultDefinitions,
        // #313: criticality + gradeStatus denormalized from source/parser for
        // CriticalAssessmentsCard queries and lineup pending-count display
        criticality: parsed.metadata.criticality || "low",
        gradeStatus: row.gradeStatus || "graded",
        // #290: denormalized so timelines can render "{file} for {N}
        // students" lines straight from the observation query, without a
        // Cloud Function round-trip per entry. Immutable post-publish (no
        // edit capability exists), so there is no sync risk.
        sourceFileName,
        studentCount: studentIds.length,
        values: row.values,
        results: row.results.map((result) => ({
          resultNumber: result.resultNumber,
          label: result.label,
          sourceValue: result.sourceValue,
        })),
        sourceProvenance: {
          row: row.sourceRow,
          nameCell: row.nameSourceCell,
          segment: row.segment,
          segmentCount: row.segmentCount,
          resultCells: row.results.map((result) => ({
            resultNumber: result.resultNumber,
            sourceCell: result.sourceCell,
            sourceFormula: result.sourceFormula,
          })),
        },
        createdBy: context.auth.uid,
        createdByName: user.displayName || user.name || user.email || "Unknown uploader",
        createdAt: now,
        observedAt,
        updatedAt: now,
      });
      });
      batch.update(pendingRef, {
        uploadStatus: "cleanup_pending",
        cleanupPaths: [pending.selectedSheet.storagePath],
        cleanupReason: "published",
        cleanupAttempts: 0,
        cleanupUpdatedAt: now,
        publishedSourceId: sourceRef.id,
      });
      await batch.commit();
      published = true;

      let cleanupDeferred = false;
      try {
        await cleanupPendingArtifacts({
          pendingRef,
          pending: {...pending, cleanupAttempts: 0},
          paths: [pending.selectedSheet.storagePath],
          reason: "published",
        });
      } catch (cleanupError) {
        cleanupDeferred = true;
        console.error("[publishStructuredAssessment] staging cleanup deferred", {
          uploadId,
          sourceId: sourceRef.id,
          error: cleanupError?.message,
        });
      }
      return {
        sourceId: sourceRef.id,
        recordCount: rows.length,
        cleanupDeferred,
      };
    } catch (error) {
      if (pending && !published) {
        const cleanupPaths = [
          pending.selectedSheet?.storagePath,
          finalFileCreated ? finalStoragePath : null,
        ];
        try {
          await cleanupPendingArtifacts({
            pendingRef,
            pending,
            paths: cleanupPaths,
            reason: "publication_failed",
          });
        } catch (cleanupError) {
          console.error("[publishStructuredAssessment] failure cleanup deferred", {
            uploadId,
            error: cleanupError?.message,
          });
        }
      }
      if (error instanceof functions.https.HttpsError) throw error;
      console.error("[publishStructuredAssessment] publication failed", {
        uploadId,
        error: error?.message,
      });
      throw new functions.https.HttpsError(
        "internal",
        "Assessment publication failed; no records were published.",
      );
    }
  });

export const cancelStructuredAssessmentUpload = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const uploadId = requiredString(data?.uploadId, "Structured upload", 128);
    const pendingRef = pendingStructuredRef(uploadId);
    const pendingSnap = await pendingRef.get();
    const pending = pendingSnap.data() || {};
    if (!pendingSnap.exists) return {removed: true};
    if (pending.kind !== "structured_assessment_upload" ||
        !["pending_upload", "cleanup_pending"].includes(pending.uploadStatus) ||
        pending.createdBy !== context.auth.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only your pending structured upload can be cancelled.",
      );
    }
    try {
      return await cleanupPendingArtifacts({
        pendingRef,
        pending,
        paths: pending.cleanupPaths?.length ?
          pending.cleanupPaths : [pending.selectedSheet?.storagePath],
        reason: "cancelled",
      });
    } catch (error) {
      console.error("[cancelStructuredAssessmentUpload] cleanup deferred", {
        uploadId,
        error: error?.message,
      });
      throw new functions.https.HttpsError(
        "internal",
        "The upload was cancelled, but file cleanup is queued for retry.",
      );
    }
  });

function medicalRecordRef(studentId, observationId) {
  return db.collection("students").doc(studentId)
    .collection("observations").doc(observationId);
}

function pendingMedicalRef(uploadId) {
  return db.collection("pendingMedicalAssessmentUploads").doc(uploadId);
}

async function authorizedStudent(user, uid, studentId, activeOnly = false) {
  const snap = await db.collection("students").doc(studentId).get();
  const student = snap.data() || {};
  if (!snap.exists || (activeOnly && (student.status || "active") !== "active")) {
    throw new functions.https.HttpsError(
      activeOnly ? "failed-precondition" : "not-found",
      activeOnly ? "This student is not active." : "Student not found.",
    );
  }
  if (!student.classroomId || !await canAccessClassrooms(
    user,
    uid,
    [student.classroomId],
  )) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "You do not have access to this student.",
    );
  }
  return student;
}

export const createMedicalAssessmentUpload = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sign in before uploading a medical assessment.",
      );
    }
    const user = await getCaller(context.auth.uid);
    const studentId = requiredString(data?.studentId, "Student", 128);
    const student = await authorizedStudent(
      user,
      context.auth.uid,
      studentId,
      true,
    );
    const originalFilename = requiredString(
      data?.originalFilename,
      "PDF filename",
      255,
    );
    const contentType = String(data?.contentType || "").toLowerCase();
    const sizeBytes = Number(data?.sizeBytes);
    if (!originalFilename.toLowerCase().endsWith(".pdf") ||
        contentType !== "application/pdf" ||
        !Number.isInteger(sizeBytes) ||
        sizeBytes <= 0 ||
        sizeBytes > MAX_MEDICAL_BYTES) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Choose a PDF no larger than 25 MB.",
      );
    }
    const pendingRef = db.collection("pendingMedicalAssessmentUploads").doc();
    const observationId = `assessment_medical_${pendingRef.id}`;
    const storagePath =
      `pending-medical-assessments/${pendingRef.id}/original.pdf`;
    const now = Timestamp.now();
    await pendingRef.set({
      kind: "medical_assessment_upload",
      schemaVersion: 1,
      observationId,
      studentId,
      classroomId: student.classroomId,
      assessmentName: requiredString(data?.assessmentName, "Report name", 250),
      assessmentDescription: optionalString(data?.assessmentDescription),
      originalFile: {
        storagePath,
        originalFilename,
        contentType: "application/pdf",
        sizeBytes,
      },
      createdBy: context.auth.uid,
      createdByName: user.displayName || user.name || user.email || "Unknown uploader",
      createdAt: now,
      updatedAt: now,
      observedAt: dateTimestamp(data?.assessmentDate),
      uploadStatus: "pending_upload",
    });
    return {uploadId: pendingRef.id, observationId, storagePath};
  });

export const finalizeMedicalAssessmentUpload = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const uploadId = requiredString(data?.uploadId, "Medical upload", 128);
    const pendingRef = pendingMedicalRef(uploadId);
    const pendingSnap = await pendingRef.get();
    const pending = pendingSnap.data() || {};
    if (!pendingSnap.exists || pending.kind !== "medical_assessment_upload" ||
        pending.uploadStatus !== "pending_upload" ||
        pending.createdBy !== context.auth.uid) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This medical upload can no longer be finalized.",
      );
    }
    const user = await getCaller(context.auth.uid);
    const student = await authorizedStudent(
      user,
      context.auth.uid,
      pending.studentId,
      true,
    );
    if (student.classroomId !== pending.classroomId) {
      try {
        await cleanupPendingArtifacts({
          pendingRef,
          pending,
          paths: [pending.originalFile.storagePath],
          reason: "student_classroom_changed",
        });
      } catch (cleanupError) {
        console.error("[finalizeMedicalAssessmentUpload] cleanup deferred", {
          uploadId,
          error: cleanupError?.message,
        });
      }
      throw new functions.https.HttpsError(
        "failed-precondition",
        "The student changed classrooms. Start the upload again.",
      );
    }
    const file = storage.bucket().file(pending.originalFile.storagePath);
    let metadata;
    try {
      [metadata] = await file.getMetadata();
    } catch {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "The PDF upload did not complete. Retry the upload.",
      );
    }
    const sizeBytes = Number(metadata.size);
    const contentType = String(metadata.contentType || "").toLowerCase();
    if (contentType !== "application/pdf" ||
        sizeBytes !== pending.originalFile.sizeBytes ||
        sizeBytes > MAX_MEDICAL_BYTES) {
      try {
        await cleanupPendingArtifacts({
          pendingRef,
          pending,
          paths: [pending.originalFile.storagePath],
          reason: "invalid_medical_upload",
        });
      } catch (cleanupError) {
        console.error("[finalizeMedicalAssessmentUpload] cleanup deferred", {
          uploadId,
          error: cleanupError?.message,
        });
      }
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The uploaded file did not match the selected PDF.",
      );
    }
    const readyAt = Timestamp.now();
    const recordRef = medicalRecordRef(
      pending.studentId,
      pending.observationId,
    );
    const batch = db.batch();
    batch.set(recordRef, {
      type: "assessment",
      assessmentKind: "medical",
      schemaVersion: 1,
      studentId: pending.studentId,
      classroomId: pending.classroomId,
      assessmentName: pending.assessmentName,
      assessmentDescription: pending.assessmentDescription || "",
      originalFile: pending.originalFile,
      createdBy: pending.createdBy,
      createdByName: pending.createdByName,
      createdAt: pending.createdAt,
      updatedAt: readyAt,
      observedAt: pending.observedAt,
      uploadStatus: "ready",
      readyAt,
    });
    batch.delete(pendingRef);
    await batch.commit();
    return {observationId: pending.observationId, uploadStatus: "ready"};
  });

export const cancelMedicalAssessmentUpload = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const uploadId = requiredString(data?.uploadId, "Medical upload", 128);
    const pendingRef = pendingMedicalRef(uploadId);
    const pendingSnap = await pendingRef.get();
    const pending = pendingSnap.data() || {};
    if (!pendingSnap.exists) return {removed: true};
    if (pending.kind !== "medical_assessment_upload" ||
        pending.uploadStatus !== "pending_upload" ||
        pending.createdBy !== context.auth.uid) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only your pending medical upload can be cancelled.",
      );
    }
    try {
      return await cleanupPendingArtifacts({
        pendingRef,
        pending,
        paths: [pending.originalFile.storagePath],
        reason: "cancelled",
      });
    } catch (error) {
      console.error("[cancelMedicalAssessmentUpload] cleanup deferred", {
        uploadId,
        error: error?.message,
      });
      throw new functions.https.HttpsError(
        "internal",
        "The upload was cancelled, but file cleanup is queued for retry.",
      );
    }
  });

export const getStructuredAssessmentSource = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const user = await getCaller(context.auth.uid);
    const sourceId = requiredString(data?.sourceId, "Assessment source", 128);
    // #313: studentId is optional when the caller is the uploader or an admin.
    // The "Your Assessments" lineup accesses the full source without a student
    // context; existing callers (AssessmentMatrixSheet, StudentAssessmentsPage)
    // always pass studentId and are unaffected.
    const studentId = optionalString(data?.studentId, 128);
    const sourceSnap = await db.collection("structuredAssessmentSources")
      .doc(sourceId)
      .get();
    const source = sourceSnap.data() || {};
    if (!sourceSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Assessment source not found.",
      );
    }
    const isUploader = source.createdBy === context.auth.uid;
    const isAdmin = user.role === "classroomadmin" || user.role === "superadmin";
    if (studentId) {
      // Original path: student-scoped access
      await authorizedStudent(user, context.auth.uid, studentId);
      if (!Array.isArray(source.studentIds) ||
          !source.studentIds.includes(studentId)) {
        throw new functions.https.HttpsError(
          "not-found",
          "Assessment source not found.",
        );
      }
    } else if (!isUploader && !isAdmin) {
      // No studentId and not the uploader or admin - deny
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only the uploader or an admin can access the full assessment.",
      );
    }
    const canDownload = await canAccessClassrooms(
      user,
      context.auth.uid,
      source.classroomIds || [],
    );
    // #290 in-app matrix view: callers who can access ANY participating
    // student may see the full row set. Assessments are single-classroom by
    // product decision, so student-level access implies classroom-level
    // visibility of every row. Records are assembled server-side because
    // Firestore rules deny cross-student observation reads from clients.
    // #313: gate includeRecords on canDownload so classroomadmins without
    // classroom membership cannot read student records from other classrooms.
    let records;
    if (data?.includeRecords === true && canDownload) {
      const recordSnapshot = await db.collectionGroup("observations")
        .where("sourceId", "==", sourceId)
        .get();
      const studentIds = [...new Set(recordSnapshot.docs
        .map((docSnap) => docSnap.data().studentId)
        .filter(Boolean))];
      const studentSnaps = studentIds.length ?
        await db.getAll(...studentIds.map((id) =>
          db.collection("students").doc(id))) :
        [];
      const nameById = new Map(studentSnaps.map((snap) => [
        snap.id,
        snap.data()?.displayName || snap.data()?.firstName || "Unknown student",
      ]));
      records = recordSnapshot.docs.map((docSnap) => {
        const record = docSnap.data();
        return {
          observationId: docSnap.id,
          studentId: record.studentId || "",
          studentName: nameById.get(record.studentId) || "Unknown student",
          values: record.values || {},
          results: (record.results || []).map((r) => ({
            resultNumber: r.resultNumber,
            label: r.label,
            sourceValue: r.sourceValue,
          })),
          resultDefinitions: record.resultDefinitions || [],
          gradeStatus: record.gradeStatus || "graded",
          criticality: record.criticality || "low",
          attempts: record.attempts || [],
          sourceRow: record.sourceProvenance?.row || 0,
          segment: record.sourceProvenance?.segment || 1,
        };
      }).sort((a, b) => (
        a.sourceRow - b.sourceRow || a.segment - b.segment
      ));
    }
    return {
      source: {
        sourceId,
        assessmentName: source.assessmentName || "",
        assessmentDescription: source.assessmentDescription || "",
        dateRange: source.dateRange || null,
        sourceFileName: source.sourceFileName || "",
        worksheetName: source.worksheetName || "",
        resultDefinitions: source.resultDefinitions || [],
        uploaderName: source.uploader?.displayName || source.createdByName || "Unknown uploader",
        publishedAt: source.publishedAt || source.createdAt || null,
        studentCount: source.studentCount || 0,
        recordCount: source.recordCount || 0,
        canDownload,
        ...(records ? {records} : {}),
      },
    };
  });

export const getAssessmentDownloadUrl = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const user = await getCaller(context.auth.uid);
    const kind = String(data?.assessmentKind || "");
    let storagePath;
    let filename;
    if (kind === "structured") {
      const sourceId = requiredString(data?.sourceId, "Assessment source", 128);
      const sourceSnap = await db.collection("structuredAssessmentSources")
        .doc(sourceId)
        .get();
      const source = sourceSnap.data() || {};
      if (!sourceSnap.exists || !await canAccessClassrooms(
        user,
        context.auth.uid,
        source.classroomIds || [],
      )) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You must have access to every classroom in this assessment source.",
        );
      }
      storagePath = source.selectedSheet?.storagePath;
      filename = source.selectedSheet?.downloadFilename ||
        structuredDownloadFilename(
          source.sourceFileName || "assessment-source.xlsx",
        );
    } else if (kind === "medical") {
      const studentId = requiredString(data?.studentId, "Student", 128);
      const observationId = requiredString(
        data?.observationId,
        "Assessment record",
        200,
      );
      await authorizedStudent(user, context.auth.uid, studentId);
      const recordSnap = await medicalRecordRef(studentId, observationId).get();
      const record = recordSnap.data() || {};
      if (!recordSnap.exists || record.assessmentKind !== "medical" ||
          record.uploadStatus !== "ready") {
        throw new functions.https.HttpsError(
          "not-found",
          "Ready medical assessment not found.",
        );
      }
      storagePath = record.originalFile?.storagePath;
      filename = record.originalFile?.originalFilename || "medical-assessment.pdf";
    } else {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Choose a structured or medical assessment download.",
      );
    }
    if (!storagePath) {
      throw new functions.https.HttpsError("not-found", "Source file not found.");
    }
    // #290: medical PDFs are view-only for every role - inline disposition
    // renders in the browser/iframe instead of forcing a download. Structured
    // sources keep attachment - no UI entry point exists post-#290 (the UI
    // renders the matrix from published data), but the CF is retained for
    // ops/debug use.
    const safeFilename = String(filename).replace(/["\r\n]/g, "_");
    const disposition = kind === "medical" ?
      `inline; filename="${safeFilename}"` :
      `attachment; filename="${safeFilename}"`;
    const [url] = await storage.bucket().file(storagePath).getSignedUrl({
      action: "read",
      expires: Date.now() + 15 * 60 * 1000,
      responseDisposition: disposition,
    });
    return {url, filename};
  });

export const deleteAssessment = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const user = await getCaller(context.auth.uid);
    if (!user || !["superadmin", "classroomadmin"].includes(user.role)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only administrators can delete assessments.",
      );
    }

    const kind = String(data?.assessmentKind || "");
    if (kind === "structured") {
      const sourceId = requiredString(data?.sourceId, "Assessment source", 128);
      const sourceRef = db.collection("structuredAssessmentSources").doc(sourceId);
      const sourceSnap = await sourceRef.get();
      const source = sourceSnap.data() || {};
      const classroomIds = Array.isArray(source.classroomIds) ?
        source.classroomIds : [];
      if (!sourceSnap.exists || !classroomIds.length) {
        throw new functions.https.HttpsError("not-found", "Assessment source not found.");
      }
      if (!canDeleteAssessments(user, classroomIds)) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "This assessment includes a classroom outside your purview.",
        );
      }
      const storagePath = source.selectedSheet?.storagePath;
      if (storagePath) {
        await storage.bucket().file(storagePath).delete({ignoreNotFound: true});
      }
      // Query by sourceId instead of trusting the denormalized recordRefs list.
      // Older published sources may not have recordRefs, but every structured
      // observation carries sourceId and must be removed by this cascade.
      const recordSnapshot = await db.collectionGroup("observations")
        .where("sourceId", "==", sourceId)
        .get();
      const batch = db.batch();
      recordSnapshot.docs.forEach((record) => batch.delete(record.ref));
      batch.delete(sourceRef);
      await batch.commit();
      return {
        deleted: true,
        assessmentKind: kind,
        recordCount: recordSnapshot.size,
      };
    }

    if (kind === "medical") {
      const studentId = requiredString(data?.studentId, "Student", 128);
      const observationId = requiredString(data?.observationId, "Assessment record", 200);
      const recordRef = medicalRecordRef(studentId, observationId);
      const recordSnap = await recordRef.get();
      const record = recordSnap.data() || {};
      const classroomIds = record.classroomId ? [record.classroomId] : [];
      if (!recordSnap.exists || record.assessmentKind !== "medical" ||
          record.uploadStatus !== "ready" || !classroomIds.length) {
        throw new functions.https.HttpsError("not-found", "Medical assessment not found.");
      }
      if (!canDeleteAssessments(user, classroomIds)) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "This assessment is outside your classroom purview.",
        );
      }
      const storagePath = record.originalFile?.storagePath;
      if (storagePath) {
        await storage.bucket().file(storagePath).delete({ignoreNotFound: true});
      }
      await recordRef.delete();
      return {deleted: true, assessmentKind: kind, recordCount: 1};
    }

    throw new functions.https.HttpsError(
      "invalid-argument",
      "Choose a structured or medical assessment to delete.",
    );
  });

async function cleanupStaleCollection(collectionName, fallbackPaths) {
  const cutoff = Timestamp.fromMillis(Date.now() - STAGING_MAX_AGE_MS);
  let cursor = null;
  let removed = 0;
  let deferred = 0;
  while (true) {
    let query = db.collection(collectionName)
      .where("createdAt", "<=", cutoff)
      .orderBy("createdAt")
      .limit(100);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    for (const doc of snapshot.docs) {
      const pending = doc.data() || {};
      try {
        await cleanupPendingArtifacts({
          pendingRef: doc.ref,
          pending,
          paths: pending.cleanupPaths?.length ?
            pending.cleanupPaths : fallbackPaths(pending),
          reason: "stale_upload",
        });
        removed += 1;
      } catch (error) {
        deferred += 1;
        console.error("[cleanupStaleAssessmentUploads] cleanup deferred", {
          collectionName,
          uploadId: doc.id,
          error: error?.message,
        });
      }
    }
    if (snapshot.size < 100) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
  return {removed, deferred};
}

export const cleanupStaleAssessmentUploads = functions
  .region("asia-south1")
  .pubsub.schedule("15 3 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const [structured, medical] = await Promise.all([
      cleanupStaleCollection(
        "pendingStructuredAssessmentUploads",
        (pending) => [pending.selectedSheet?.storagePath],
      ),
      cleanupStaleCollection(
        "pendingMedicalAssessmentUploads",
        (pending) => [pending.originalFile?.storagePath],
      ),
    ]);
    console.log("[cleanupStaleAssessmentUploads] cleanup complete", {
      structured,
      medical,
    });
    return {structured, medical};
  });

// ---------------------------------------------------------------------------
// #313: Your Assessments - uploader-scoped assessment management
// ---------------------------------------------------------------------------

/**
 * List the caller's own assessment uploads with denormalized counts.
 * Returns source metadata + pendingCount/gradedCount (no observation reads).
 */
export const listMyAssessmentUploads = functions
  .region("asia-south1")
  .https.onCall(async (_data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }
    await getCaller(context.auth.uid);

    const snap = await db.collection("structuredAssessmentSources")
      .where("createdBy", "==", context.auth.uid)
      .orderBy("createdAt", "desc")
      .get();

    return snap.docs.map((doc) => {
      const d = doc.data();
      return {
        sourceId: doc.id,
        assessmentName: d.assessmentName,
        assessmentDescription: d.assessmentDescription,
        dateRange: d.dateRange,
        criticality: d.criticality || "low",
        resultDefinitions: d.resultDefinitions,
        studentCount: d.studentCount,
        recordCount: d.recordCount,
        pendingCount: d.pendingCount ?? 0,
        gradedCount: d.gradedCount ?? d.studentCount ?? 0,
        sourceFileName: d.sourceFileName,
        createdAt: d.createdAt,
        publishedAt: d.publishedAt,
      };
    });
  });

/**
 * Append a retest/late grade to an assessment observation.
 * Auth: caller must be the source's uploader OR classroomadmin/superadmin.
 * Transaction: appends to attempts[] + updates gradeStatus + decrements
 * pendingCount on the source doc if status was 'absent'.
 */
export const appendAssessmentAttempt = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }
    const user = await getCaller(context.auth.uid);

    const observationId = requiredString(data?.observationId, "observationId");
    const dateTaken = requiredString(data?.dateTaken, "dateTaken");
    const values = data?.values;

    // Validate dateTaken format and not in the future
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTaken)) {
      throw new functions.https.HttpsError("invalid-argument", "dateTaken must be YYYY-MM-DD.");
    }
    const dateObj = new Date(`${dateTaken}T00:00:00.000Z`);
    if (Number.isNaN(dateObj.getTime())) {
      throw new functions.https.HttpsError("invalid-argument", "dateTaken must be a valid date.");
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dateTaken > today) {
      throw new functions.https.HttpsError("invalid-argument", "dateTaken cannot be in the future.");
    }

    if (!values || typeof values !== "object" || Array.isArray(values)) {
      throw new functions.https.HttpsError("invalid-argument", "values must be an object keyed by result number.");
    }

    // observationId is the doc ID format sa_{sourceId}_{row}_{segment}.
    // We look up the source doc to find the student via recordRefs.
    let observationRef;
    let observation;
    const idParts = observationId.match(/^sa_(.+)_(\d+)_(\d+)$/);
    if (!idParts) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid observation ID format.");
    }
    const sourceId = idParts[1];

    // Query the source to get recordRefs -> find the student for this observation
    const sourceSnap = await db.collection("structuredAssessmentSources").doc(sourceId).get();
    if (!sourceSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Assessment source not found.");
    }
    const sourceData = sourceSnap.data();

    // Auth: uploader OR admin; classroomadmins scoped to their manageable classrooms
    const isUploader = sourceData.createdBy === context.auth.uid;
    const isAdmin = user.role === "classroomadmin" || user.role === "superadmin";
    if (!isUploader && !isAdmin) {
      throw new functions.https.HttpsError("permission-denied", "Only the uploader or an admin can add attempts.");
    }
    // Mirror the read-path classroom-scope check: classroomadmins cannot mutate
    // grades on assessments outside their manageable classrooms (#313).
    if (!isUploader && user.role === "classroomadmin") {
      const hasAccess = await canAccessClassrooms(user, context.auth.uid, sourceData.classroomIds || []);
      if (!hasAccess) {
        throw new functions.https.HttpsError("permission-denied", "Classroom access required to add attempts.");
      }
    }

    // Find the observation via recordRefs
    const ref = (sourceData.recordRefs || []).find((r) => r.observationId === observationId);
    if (!ref) {
      throw new functions.https.HttpsError("not-found", "Observation not found in this assessment.");
    }

    observationRef = db.collection("students")
      .doc(ref.studentId)
      .collection("observations")
      .doc(observationId);

    const obsDoc = await observationRef.get();
    if (!obsDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Observation document not found.");
    }
    observation = obsDoc.data();

    // Validate values keys match resultDefinitions
    const resultNumbers = new Set(
      (observation.resultDefinitions || []).map((d) => d.number),
    );
    for (const k of Object.keys(values)) {
      const num = Number(k);
      if (!resultNumbers.has(num)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Result number ${k} does not match any result definition.`,
        );
      }
      if (typeof values[k] !== "string" || !values[k].trim()) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Value for result ${k} must be a non-empty string.`,
        );
      }
    }
    for (const num of resultNumbers) {
      if (!(String(num) in values) && !(num in values)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Missing value for result ${num}.`,
        );
      }
    }

    // Build the attempt payload (kind and n are finalized inside the transaction
    // using fresh data to prevent stale-read races under concurrent writes).
    const attemptBase = {
      values: Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v]),
      ),
      dateTaken,
      addedBy: context.auth.uid,
      addedAt: Timestamp.now(),
    };

    // Transaction: append attempt + update gradeStatus + update source pendingCount.
    // kind and n are derived inside the transaction from fresh reads so concurrent
    // appends always produce correct metadata even under retry.
    let committedN;
    let committedKind;
    const sourceRef = db.collection("structuredAssessmentSources").doc(sourceId);
    await db.runTransaction(async (tx) => {
      const freshObs = await tx.get(observationRef);
      const freshSource = await tx.get(sourceRef);
      if (!freshObs.exists || !freshSource.exists) {
        throw new functions.https.HttpsError("not-found", "Document disappeared during transaction.");
      }

      const freshAttempts = freshObs.data().attempts || [];
      const freshGradeStatus = freshObs.data().gradeStatus;

      // Derive kind from fresh state:
      // 'late'  - absent student receiving their first grade
      // 'retest' - any additional attempt (graded or absent with prior attempts)
      // 'original' is reserved for the source XLSX grade, never for appended attempts
      const freshKind = (freshGradeStatus === "absent" && freshAttempts.length === 0)
        ? "late"
        : "retest";
      committedN = freshAttempts.length + 1;
      committedKind = freshKind;

      tx.update(observationRef, {
        attempts: [...freshAttempts, { ...attemptBase, n: committedN, kind: freshKind }],
        gradeStatus: "graded",
        updatedAt: Timestamp.now(),
      });

      // Only decrement pendingCount if status was absent (first grade for this student)
      if (freshGradeStatus === "absent") {
        const currentPending = freshSource.data().pendingCount ?? 0;
        const currentGraded = freshSource.data().gradedCount ?? 0;
        tx.update(sourceRef, {
          pendingCount: Math.max(0, currentPending - 1),
          gradedCount: currentGraded + 1,
        });
      }
    });

    return { success: true, attemptNumber: committedN, kind: committedKind };
  });

/**
 * Correct an original grade on an assessment observation.
 * Auth: classroomadmin or superadmin only. Teachers cannot call this.
 * Atomically mutates results[i].sourceValue and values["Result N"].
 * Does NOT touch attempts[].
 */
export const correctAssessmentGrade = functions
  .region("asia-south1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }
    const user = await getCaller(context.auth.uid);

    // Admin-only: teachers cannot correct grades
    if (user.role !== "classroomadmin" && user.role !== "superadmin") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only classroom admins or super admins can correct grades.",
      );
    }

    const observationId = requiredString(data?.observationId, "observationId");
    const resultNumber = data?.resultNumber;
    const correctedValue = requiredString(data?.correctedValue, "correctedValue");

    if (typeof resultNumber !== "number" || resultNumber < 1) {
      throw new functions.https.HttpsError("invalid-argument", "resultNumber must be a positive integer.");
    }

    // Parse observationId to find source and student
    const idParts = observationId.match(/^sa_(.+)_(\d+)_(\d+)$/);
    if (!idParts) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid observation ID format.");
    }
    const sourceId = idParts[1];

    const sourceSnap = await db.collection("structuredAssessmentSources").doc(sourceId).get();
    if (!sourceSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Assessment source not found.");
    }
    const sourceData = sourceSnap.data();

    // Classroomadmins scoped to their manageable classrooms; superadmins have full access.
    // Mirror the read-path classroom-scope check added in #313 to getStructuredAssessmentSource.
    if (user.role === "classroomadmin") {
      const hasAccess = await canAccessClassrooms(user, context.auth.uid, sourceData.classroomIds || []);
      if (!hasAccess) {
        throw new functions.https.HttpsError("permission-denied", "Classroom access required to correct grades.");
      }
    }

    // Find the observation via recordRefs
    const ref = (sourceData.recordRefs || []).find((r) => r.observationId === observationId);
    if (!ref) {
      throw new functions.https.HttpsError("not-found", "Observation not found in this assessment.");
    }

    const observationRef = db.collection("students")
      .doc(ref.studentId)
      .collection("observations")
      .doc(observationId);

    // Pre-read for validation only (resultDefinitions don't change post-publish)
    const obsDoc = await observationRef.get();
    if (!obsDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Observation document not found.");
    }
    const obsForValidation = obsDoc.data();

    // Validate resultNumber exists in resultDefinitions
    const definitions = obsForValidation.resultDefinitions || [];
    const defIndex = definitions.findIndex((d) => d.number === resultNumber);
    if (defIndex < 0) {
      throw new functions.https.HttpsError("invalid-argument", `Result number ${resultNumber} does not exist.`);
    }

    // Validate result exists in results array (pre-read is sufficient for existence check)
    const preResults = obsForValidation.results || [];
    const preResultIndex = preResults.findIndex((r) => r.resultNumber === resultNumber);
    if (preResultIndex < 0) {
      throw new functions.https.HttpsError("not-found", `Result ${resultNumber} not found in observation.`);
    }

    // Transaction: re-read + mutate atomically so concurrent corrections to
    // different result fields on the same observation don't overwrite each other.
    await db.runTransaction(async (tx) => {
      const freshObs = await tx.get(observationRef);
      if (!freshObs.exists) {
        throw new functions.https.HttpsError("not-found", "Observation document not found.");
      }
      const freshData = freshObs.data();

      const results = [...(freshData.results || [])];
      const resultIndex = results.findIndex((r) => r.resultNumber === resultNumber);
      if (resultIndex < 0) {
        throw new functions.https.HttpsError("not-found", `Result ${resultNumber} not found in observation.`);
      }

      results[resultIndex] = { ...results[resultIndex], sourceValue: correctedValue };
      const updatedValues = {
        ...(freshData.values || {}),
        [`Result ${resultNumber}`]: correctedValue,
      };

      tx.update(observationRef, {
        results,
        values: updatedValues,
        updatedAt: Timestamp.now(),
      });
    });

    return { success: true, resultNumber, correctedValue };
  });
