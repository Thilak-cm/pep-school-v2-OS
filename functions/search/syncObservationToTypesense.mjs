// #331 - Firestore trigger: sync observation writes to Typesense
//
// Triggers on students/{studentId}/observations/{observationId} onWrite.
// Handles create, update, and delete. Skips assessment and medical types.
// Retries transient Typesense errors via Cloud Functions built-in retry.

import * as functions from "firebase-functions/v1";
import { defineSecret } from "firebase-functions/params";
import Typesense from "typesense";

const TYPESENSE_API_KEY = defineSecret("TYPESENSE_API_KEY");
const TYPESENSE_HOST = defineSecret("TYPESENSE_HOST");

const COLLECTION = "observations";
const SKIPPED_TYPES = new Set(["assessment", "medical"]);

// Fields indexed as searchable text or facet filters
function buildTypesenseDoc(observationData, studentId, observationId) {
  const coachSelections = observationData.coach?.selections || {};
  return {
    id: `${studentId}_${observationId}`,
    studentId,
    observationId,
    classroomId: observationData.classroomId || "",
    type: observationData.type || "text",
    createdBy: observationData.createdBy || "",
    observedAt: observationData.observedAt?.seconds
      || (observationData.observedAt?._seconds)
      || Math.floor(Date.now() / 1000),
    programId: observationData.programId || "",
    starScore: observationData.starScore || 0,
    groupId: observationData.groupId || "",
    studentName: observationData.studentName || "",
    // Searchable text fields
    text: observationData.text || "",
    lessonTitle: observationData.lessonTitle || "",
    lessonDescription: observationData.lessonDescription || "",
    groupComment: observationData.groupComment || "",
    studentComment: observationData.studentComment || "",
    teacherComment: observationData.teacherComment || "",
    curriculumArea: observationData.curriculumArea || "",
    materialsIdentified: Array.isArray(observationData.materialsIdentified)
      ? observationData.materialsIdentified.join(", ")
      : "",
    pdfTitle: observationData.pdfTitle || "",
    essence_text: observationData.essence_text || "",
    evidence_quote: coachSelections.evidence_quote || "",
    objective_line: coachSelections.objective_line || "",
  };
}

function getTypesenseClient() {
  return new Typesense.Client({
    nodes: [{ host: TYPESENSE_HOST.value(), port: 443, protocol: "https" }],
    apiKey: TYPESENSE_API_KEY.value(),
  });
}

export const syncObservationToTypesense = functions
  .region("asia-south1")
  .runWith({ secrets: [TYPESENSE_API_KEY, TYPESENSE_HOST] })
  .firestore.document("students/{studentId}/observations/{observationId}")
  .onWrite(async (change, context) => {
    const { studentId, observationId } = context.params;
    const docId = `${studentId}_${observationId}`;

    // Delete case: document was removed
    if (!change.after.exists) {
      try {
        const client = getTypesenseClient();
        await client.collections(COLLECTION).documents(docId).delete();
        functions.logger.info(`[syncObservation] deleted ${docId}`);
      } catch (err) {
        // 404 means it was never indexed (e.g. assessment type) - not an error
        if (err.httpStatus === 404) return;
        functions.logger.error(`[syncObservation] delete failed for ${docId}`, err);
        throw err; // Retry transient errors
      }
      return;
    }

    const data = change.after.data();
    const type = data?.type || "";

    // Skip assessment and medical types - never indexed
    if (SKIPPED_TYPES.has(type)) {
      functions.logger.info(`[syncObservation] skipping ${type} type for ${docId}`);
      return;
    }

    try {
      const client = getTypesenseClient();
      const tsDoc = buildTypesenseDoc(data, studentId, observationId);
      await client.collections(COLLECTION).documents().upsert(tsDoc);
      functions.logger.info(`[syncObservation] upserted ${docId}`);
    } catch (err) {
      functions.logger.error(`[syncObservation] upsert failed for ${docId}`, err);
      throw err; // Retry transient errors
    }
  });
