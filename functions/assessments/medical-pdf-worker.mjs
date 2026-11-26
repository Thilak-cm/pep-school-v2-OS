/**
 * Medical PDF async processing pipeline (#255).
 *
 * Triggered by a Pub/Sub message published at the end of finalizeMedicalAssessmentUpload.
 * Message payload: { studentId, executionId, observationId }
 *
 * Flow:
 *   1. Fetch observation doc; short-circuit if processingStatus === "completed" or "failed" (isAlreadyDone)
 *   2. Download PDF from Storage at originalFile.storagePath
 *   3. Parse native PDF text → write parsedContent + processingStatus:"processing"
 *   4. Call LLM (call 1 of soul pattern: medical-only context) → summary, parsedTitle
 *   5. Write summary + processingStatus:"completed"
 *
 * Retry: if parsedContent already exists on the doc, skip parse step (PDF parse and LLM
 * are independent points of failure - decoupled by the intermediate write).
 *
 * Soul integration: completed medical docs flow into soul gen via isSoulObservation
 * filter in functions/shared/studentHelpers.js.
 *
 * State machine: queued -> processing -> completed | failed
 * Note: the spec also defines a "needs_review" state for OCR-flagged docs.
 * Deferred to a future iteration when OCR support is added - at that point,
 * likelyNeedsOcr === true docs would transition to "needs_review" instead of
 * "completed", signaling that a human should verify the extraction quality.
 */

import * as functions from "firebase-functions/v1";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, storage } from "../shared/firebase.js";
import { makeFanoutWorker } from "../shared/fanout.js";
import { runLLM, sanitizeMedicalMessagesForTrace, OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY } from "../shared/llm.js";

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
  return charCount / pageCount < 200;
}

/**
 * Build the intermediate Firestore update written after PDF parse completes.
 * Stored before the LLM call so retries can skip re-parsing.
 *
 * @param {{ parsedContent: string, pageCount: number, charCount: number, likelyNeedsOcr: boolean }} parsed
 * @returns {object} Firestore update payload
 */
export function buildParsedContentUpdate({ parsedContent, pageCount, charCount, likelyNeedsOcr }) {
  return {
    processingStatus: "processing",
    parsedContent,
    pageCount,
    charCount,
    likelyNeedsOcr,
  };
}

/**
 * Build the final Firestore update written after the LLM call completes.
 *
 * @param {{ summary: string, parsedTitle: string }} llmResult
 * @returns {object} Firestore update payload
 */
export function buildCompletedUpdate({ summary, parsedTitle }) {
  return {
    processingStatus: "completed",
    summary,
    parsedTitle,
    processedAt: Timestamp.now(),
  };
}

// ---------------------------------------------------------------------------
// Production defaults (injected in tests via deps)
// ---------------------------------------------------------------------------

async function defaultDownloadPdf(storagePath) {
  const [buffer] = await storage.bucket().file(storagePath).download();
  return buffer;
}

async function defaultParsePdf(buffer) {
  // Lazy import to keep test isolation intact (pdf-parse is not loaded in tests).
  const { default: pdfParse } = await import("pdf-parse");
  const result = await pdfParse(buffer);
  return { text: result.text, pageCount: result.numpages };
}

const MEDICAL_SUMMARY_SYSTEM_PROMPT = `You are a Montessori educational support assistant. \
You will receive the full text of a medical or developmental assessment report for a student. \
Your task is to produce two things:
1. A concise professional summary (3-5 sentences) highlighting key findings relevant to the student's learning and classroom needs.
2. A short document title (5-10 words) derived from the report content.

Respond in JSON format:
{
  "summary": "<summary text>",
  "title": "<document title>"
}`;

// ---------------------------------------------------------------------------
// Worker core
// ---------------------------------------------------------------------------

/**
 * Process a single medical PDF observation:
 * download from Storage, parse text, call LLM for summary, write results.
 *
 * @param {{ studentId: string, observationId: string }} payload
 * @param {{ db, storage, downloadPdf, parsePdf, runLLM }} deps - injected for testability
 * @returns {Promise<void>}
 */
export async function processMedicalPdf(payload, deps = {}) {
  const { studentId, observationId } = payload;
  const dbDep = deps.db || db;
  const downloadPdfFn = deps.downloadPdf || defaultDownloadPdf;
  const parsePdfFn = deps.parsePdf || defaultParsePdf;
  const runLLMFn = deps.runLLM || runLLM;

  const obsRef = dbDep
    .collection("students")
    .doc(studentId)
    .collection("observations")
    .doc(observationId);

  const snap = await obsRef.get();
  if (!snap.exists) {
    const err = new Error(`Observation ${observationId} not found for student ${studentId}`);
    err.code = "not-found";
    throw err;
  }
  const data = snap.data();

  // Idempotency guard: already completed or already failed
  if (data.processingStatus === "completed" || data.processingStatus === "failed") {
    return;
  }

  // Track each processing attempt for retry analysis (#255)
  await obsRef.update({
    processingStatus: "processing",
    retryCount: FieldValue.increment(1),
  });

  try {
    let parsedContent = data.parsedContent || null;
    let pageCount = data.pageCount || 0;
    let charCount = data.charCount || 0;

    if (!parsedContent) {
      // Step 2-3: download PDF and parse native text
      const pdfBuffer = await downloadPdfFn(data.originalFile.storagePath);
      const { text, pageCount: pages } = await parsePdfFn(pdfBuffer);

      parsedContent = text || "";
      pageCount = pages || 1;
      charCount = parsedContent.length;
      const likelyNeedsOcr = computeOcrHeuristic(charCount, pageCount);

      // Write intermediate state so retries skip re-parsing
      await obsRef.update(buildParsedContentUpdate({ parsedContent, pageCount, charCount, likelyNeedsOcr }));
    }

    // Step 4: call LLM for summary and title
    const messages = [
      { role: "system", content: MEDICAL_SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: parsedContent },
    ];

    // Redact medical content from Langfuse trace (#255): traceInput replaces the
    // default sanitizeMessagesForTrace(messages) in runLLM, ensuring the full PDF
    // text never appears in the Langfuse generation input field.
    const sanitized = sanitizeMedicalMessagesForTrace(messages, "", { charCount, pageCount });
    const llmResult = await runLLMFn({
      featureId: "medicalPdfSummary",
      messages,
      temperature: 0.3,
      maxTokens: 1024,
      responseFormat: { type: "json_object" },
      traceName: "medical-pdf-summary",
      traceMetadata: { studentId, observationId, pageCount, charCount },
      traceInput: sanitized.messages,
      generationMetadata: { charCount, pageCount },
      timeoutMs: 120_000,
    });

    let summary = "";
    let parsedTitle = data.assessmentName || "";
    try {
      const parsed = JSON.parse(llmResult.content);
      summary = parsed.summary || llmResult.content;
      parsedTitle = parsed.title || parsedTitle;
    } catch {
      // If the LLM returns non-JSON, use raw content as summary
      summary = llmResult.content || "";
    }

    // Step 5: write completed state
    await obsRef.update(buildCompletedUpdate({ summary, parsedTitle }));
  } catch (err) {
    // Write terminal failure state to the observation doc so it does not stay
    // stuck in "queued" or "processing" indefinitely. The fanout layer handles
    // permanent vs transient classification for message ACK/rethrow; this ensures
    // the doc itself reflects the failure regardless of transport-level outcome.
    // "internal" is intentionally excluded: OpenRouter HTTP errors (500, 429)
    // surface as code:"internal" but are often transient and should be retried
    // by Pub/Sub redelivery rather than marked permanently failed.
    const isPermanent = err.code && ["not-found", "failed-precondition"].includes(err.code);
    if (isPermanent) {
      await obsRef.update({
        processingStatus: "failed",
        processingError: err.message || "unknown error",
      }).catch((writeErr) => {
        console.error(`[medical-pdf-worker] failed to write failure state for ${observationId}:`, writeErr.message);
      });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// CF export (wired in functions/index.js)
//
// Intentional deviation from the dispatcher+ledger pattern (#255):
// Medical PDF processing is event-driven (finalizeMedicalAssessmentUpload
// publishes directly to Pub/Sub), not cron-dispatched. There is no dispatcher
// CF and no execution ledger. Ledger writes in makeFanoutWorker are best-effort
// and unverified - the observation doc's processingStatus field is the source
// of truth for processing state, and the integrity checker monitors for stuck
// docs. This is acceptable because medical uploads are low-volume (<5/week)
// and individually triggered, unlike the batch fan-out jobs.
// ---------------------------------------------------------------------------

export const medicalPdfWorker = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB",
    maxInstances: 10,
    // failurePolicy: true enables Pub/Sub redelivery on thrown errors (transient failures)
    failurePolicy: true,
    secrets: [OPENROUTER_API_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY],
  })
  .pubsub.topic(MEDICAL_PDF_TOPIC)
  .onPublish(
    makeFanoutWorker({
      jobKey: "medicalPdfProcessing",
      extraKeys: ["observationId"],
      isAlreadyDone: async ({ studentId, observationId }) => {
        const snap = await db
          .collection("students")
          .doc(studentId)
          .collection("observations")
          .doc(observationId)
          .get();
        return snap.exists && (snap.data().processingStatus === "completed" || snap.data().processingStatus === "failed");
      },
      process: async ({ studentId, observationId }) => {
        await processMedicalPdf({ studentId, observationId });
        return { state: "success", evidence: { observationId } };
      },
    }),
  );
