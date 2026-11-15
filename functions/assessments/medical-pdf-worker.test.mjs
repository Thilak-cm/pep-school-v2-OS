/**
 * Contract tests for medical PDF processing pipeline (#255).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { computeOcrHeuristic, buildParsedContentUpdate, buildCompletedUpdate, processMedicalPdf } from "./medical-pdf-worker.mjs";

// ---------------------------------------------------------------------------
// computeOcrHeuristic
// ---------------------------------------------------------------------------

test("computeOcrHeuristic: flags true when charCount/pageCount < 200", () => {
  // 100 chars across 1 page = 100 chars/page → needs OCR
  assert.equal(computeOcrHeuristic(100, 1), true);
});

test("computeOcrHeuristic: flags true when avg density is low across multiple pages", () => {
  // 300 chars across 3 pages = 100 chars/page → needs OCR
  assert.equal(computeOcrHeuristic(300, 3), true);
});

test("computeOcrHeuristic: returns false when charCount/pageCount >= 200", () => {
  // 400 chars across 1 page = 400 chars/page → native text, no OCR needed
  assert.equal(computeOcrHeuristic(400, 1), false);
});

test("computeOcrHeuristic: boundary at exactly 200 returns false", () => {
  // 200 chars / 1 page = exactly 200 → not flagged
  assert.equal(computeOcrHeuristic(200, 1), false);
});

test("computeOcrHeuristic: boundary just below 200 returns true", () => {
  // 199 chars / 1 page = 199 → flagged
  assert.equal(computeOcrHeuristic(199, 1), true);
});

// ---------------------------------------------------------------------------
// buildParsedContentUpdate
// ---------------------------------------------------------------------------

test("buildParsedContentUpdate includes processingStatus:processing", () => {
  const update = buildParsedContentUpdate({
    parsedContent: "some text",
    pageCount: 6,
    charCount: 2400,
    likelyNeedsOcr: false,
  });
  assert.equal(update.processingStatus, "processing");
});

test("buildParsedContentUpdate includes all parsed fields", () => {
  const update = buildParsedContentUpdate({
    parsedContent: "text content",
    pageCount: 6,
    charCount: 2400,
    likelyNeedsOcr: false,
  });
  assert.equal(update.parsedContent, "text content");
  assert.equal(update.pageCount, 6);
  assert.equal(update.charCount, 2400);
  assert.equal(update.likelyNeedsOcr, false);
});

// ---------------------------------------------------------------------------
// buildCompletedUpdate
// ---------------------------------------------------------------------------

test("buildCompletedUpdate includes processingStatus:completed", () => {
  const update = buildCompletedUpdate({
    summary: "Child shows strong language skills",
    parsedTitle: "Speech Therapy Assessment 2023",
  });
  assert.equal(update.processingStatus, "completed");
});

test("buildCompletedUpdate includes summary, parsedTitle, and processedAt", () => {
  const update = buildCompletedUpdate({
    summary: "Child shows strong language skills",
    parsedTitle: "Speech Therapy Assessment 2023",
  });
  assert.equal(update.summary, "Child shows strong language skills");
  assert.equal(update.parsedTitle, "Speech Therapy Assessment 2023");
  assert.ok(update.processedAt, "processedAt must be set");
});

// ---------------------------------------------------------------------------
// processMedicalPdf - isAlreadyDone guard
// ---------------------------------------------------------------------------

test("processMedicalPdf short-circuits when processingStatus is completed", async () => {
  const callLog = [];
  const mockDeps = {
    db: {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              get: async () => ({
                exists: true,
                data: () => ({ processingStatus: "completed", originalFile: { storagePath: "path/original.pdf" } }),
              }),
              update: async () => callLog.push("update"),
            }),
          }),
        }),
      }),
    },
    downloadPdf: async () => callLog.push("download"),
    parsePdf: async () => callLog.push("parse"),
    runLLM: async () => callLog.push("llm"),
  };

  await processMedicalPdf({ studentId: "s1", observationId: "o1" }, mockDeps);
  assert.equal(callLog.length, 0, "no side effects should occur when already completed");
});

test("processMedicalPdf short-circuits when processingStatus is failed", async () => {
  const callLog = [];
  const mockDeps = {
    db: {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              get: async () => ({
                exists: true,
                data: () => ({ processingStatus: "failed", originalFile: { storagePath: "path/original.pdf" } }),
              }),
              update: async () => callLog.push("update"),
            }),
          }),
        }),
      }),
    },
    downloadPdf: async () => callLog.push("download"),
    parsePdf: async () => callLog.push("parse"),
    runLLM: async () => callLog.push("llm"),
  };

  await processMedicalPdf({ studentId: "s1", observationId: "o1" }, mockDeps);
  assert.equal(callLog.length, 0, "no side effects should occur when already failed");
});

// ---------------------------------------------------------------------------
// processMedicalPdf - state machine transitions
// ---------------------------------------------------------------------------

test("processMedicalPdf skips parse step when parsedContent already exists on retry", async () => {
  const callLog = [];
  const mockDeps = {
    db: {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              get: async () => ({
                exists: true,
                data: () => ({
                  processingStatus: "processing",
                  parsedContent: "already parsed text",
                  pageCount: 6,
                  charCount: 2400,
                  originalFile: { storagePath: "path/original.pdf" },
                }),
              }),
              update: async (payload) => callLog.push({ op: "update", payload }),
            }),
          }),
        }),
      }),
    },
    downloadPdf: async () => { callLog.push("download"); return Buffer.from(""); },
    parsePdf: async () => { callLog.push("parse"); return { text: "", pageCount: 6 }; },
    runLLM: async () => {
      callLog.push("llm");
      return { content: '{"summary":"test summary","title":"Test Doc"}', usage: {} };
    },
  };

  await processMedicalPdf({ studentId: "s1", observationId: "o1" }, mockDeps);

  assert.ok(!callLog.includes("download"), "should not re-download when parsedContent exists");
  assert.ok(!callLog.includes("parse"), "should not re-parse when parsedContent exists");
  assert.ok(callLog.includes("llm"), "should still call LLM");

  // Verify the initial processing update includes retryCount increment
  const processingUpdate = callLog.find((e) => e.op === "update" && e.payload?.processingStatus === "processing");
  assert.ok(processingUpdate, "must write processingStatus: processing with retryCount");
  assert.equal(processingUpdate.payload.retryCount?.operand, 1, "retryCount must be FieldValue.increment(1)");

  // Verify the completed update was written with correct fields
  const completedUpdate = callLog.find((e) => e.op === "update" && e.payload?.processingStatus === "completed");
  assert.ok(completedUpdate, "must write processingStatus: completed");
  assert.equal(completedUpdate.payload.summary, "test summary");
});

// ---------------------------------------------------------------------------
// processMedicalPdf - permanent error failure write path
// ---------------------------------------------------------------------------

test("processMedicalPdf writes failed state and rethrows on permanent error", async () => {
  const callLog = [];
  const mockDeps = {
    db: {
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              get: async () => ({
                exists: true,
                data: () => ({
                  processingStatus: "queued",
                  originalFile: { storagePath: "path/missing.pdf" },
                }),
              }),
              update: async (payload) => callLog.push({ op: "update", payload }),
            }),
          }),
        }),
      }),
    },
    downloadPdf: async () => {
      const err = new Error("PDF not found in storage");
      err.code = "not-found";
      throw err;
    },
    parsePdf: async () => { throw new Error("should not be called"); },
    runLLM: async () => { throw new Error("should not be called"); },
  };

  await assert.rejects(
    () => processMedicalPdf({ studentId: "s1", observationId: "o1" }, mockDeps),
    { code: "not-found" },
  );

  // Verify the failure state was written to the observation doc
  const failedUpdate = callLog.find((e) => e.op === "update" && e.payload?.processingStatus === "failed");
  assert.ok(failedUpdate, "must write processingStatus: failed");
  assert.equal(failedUpdate.payload.processingError, "PDF not found in storage");
});
