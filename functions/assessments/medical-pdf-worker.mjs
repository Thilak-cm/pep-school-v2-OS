/**
 * Medical PDF async processing pipeline (#255).
 *
 * Triggered by a Pub/Sub message published at the end of finalizeMedicalAssessmentUpload.
 * Message payload: { studentId, observationId }
 *
 * Flow:
 *   1. Fetch observation doc; short-circuit if processingStatus === "completed" (isAlreadyDone)
 *   2. Download PDF from Storage at originalFile.storagePath
 *   3. Parse native PDF text → write parsedContent + processingStatus:"processing"
 *   4. Call LLM (call 1 of soul pattern: medical-only context) → summary, parsedTitle
 *   5. Write summary + processingStatus:"completed"
 *
 * Retry: if parsedContent already exists on the doc, skip parse step (PDF parse and LLM
 * are independent points of failure - decoupled by the intermediate write).
 *
 * Soul integration: completed medical docs flow into soul gen via isGenericObservation
 * carve-out in functions/shared/studentHelpers.js.
 */

import * as functions from "firebase-functions/v1";
import { db } from "../shared/firebase.js";
import { makeFanoutWorker } from "../shared/fanout.js";

export const MEDICAL_PDF_TOPIC = "medical-pdf-workers";

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable, no side effects)
// ---------------------------------------------------------------------------

/**
 * Compute whether a parsed PDF likely needs OCR based on character density.
 * Native text PDFs from Word-converted templates yield >200 chars/page on average.
 * Below that threshold, the extraction is likely from a scanned image page.
 *
 * @param {number} charCount - Total extracted characters across all pages
 * @param {number} pageCount - Total page count
 * @returns {boolean} true when charCount/pageCount < 200
 */
export function computeOcrHeuristic(charCount, pageCount) {
  throw new Error("Not implemented");
}

/**
 * Build the intermediate Firestore update written after PDF parse completes.
 * Stored before the LLM call so retries can skip re-parsing.
 *
 * @param {{ parsedContent: string, pageCount: number, charCount: number, likelyNeedsOcr: boolean }} parsed
 * @returns {object} Firestore update payload
 */
export function buildParsedContentUpdate({ parsedContent, pageCount, charCount, likelyNeedsOcr }) {
  throw new Error("Not implemented");
}

/**
 * Build the final Firestore update written after the LLM call completes.
 *
 * @param {{ summary: string, parsedTitle: string }} llmResult
 * @returns {object} Firestore update payload
 */
export function buildCompletedUpdate({ summary, parsedTitle }) {
  throw new Error("Not implemented");
}

// ---------------------------------------------------------------------------
// Worker core
// ---------------------------------------------------------------------------

/**
 * Process a single medical PDF observation:
 * download from Storage, parse text, call LLM for summary, write results.
 *
 * @param {{ studentId: string, observationId: string }} payload
 * @param {{ db, storage, runLLM }} deps - injected for testability
 * @returns {Promise<void>}
 */
export async function processMedicalPdf(payload, deps = {}) {
  throw new Error("Not implemented");
}

// ---------------------------------------------------------------------------
// CF export (wired in functions/index.js)
// ---------------------------------------------------------------------------

export const medicalPdfWorker = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB",
    maxInstances: 10,
    // failurePolicy: true enables Pub/Sub redelivery on thrown errors (transient failures)
    failurePolicy: true,
  })
  .pubsub.topic(MEDICAL_PDF_TOPIC)
  .onPublish(
    makeFanoutWorker({
      jobKey: "medicalPdfProcessing",
      extraKeys: ["observationId"],
      isAlreadyDone: async ({ studentId, observationId }) => {
        throw new Error("Not implemented");
      },
      process: async ({ studentId, observationId }) => {
        throw new Error("Not implemented");
      },
    }),
  );
