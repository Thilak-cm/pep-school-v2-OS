/**
 * Tests for whisper helpers (#298).
 * Run: node --test functions/ai/whisper.test.mjs
 *
 * The "audio_seconds" key is a CONTRACT with the live Langfuse model
 * definition ((?i)^(whisper-1)$ @ $0.0001/audio_second) - renaming it
 * silently zeroes whisper cost reporting.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWhisperUsageDetails, buildRecordExit } from "./whisper.js";

// ---------------------------------------------------------------------------
// buildWhisperUsageDetails
// ---------------------------------------------------------------------------

describe("buildWhisperUsageDetails", () => {
  it("rounds verbose_json duration to whole audio_seconds", () => {
    assert.deepEqual(buildWhisperUsageDetails({ duration: 3.4 }), { audio_seconds: 3 });
    assert.deepEqual(buildWhisperUsageDetails({ duration: 3.6 }), { audio_seconds: 4 });
    assert.deepEqual(buildWhisperUsageDetails({ duration: 42 }), { audio_seconds: 42 });
  });

  it("uses the exact key name audio_seconds (Langfuse model definition contract)", () => {
    const details = buildWhisperUsageDetails({ duration: 10 });
    assert.deepEqual(Object.keys(details), ["audio_seconds"]);
  });

  it("returns undefined when duration is missing or invalid (no fake usage)", () => {
    assert.equal(buildWhisperUsageDetails({}), undefined);
    assert.equal(buildWhisperUsageDetails(null), undefined);
    assert.equal(buildWhisperUsageDetails({ duration: "not-a-number" }), undefined);
    assert.equal(buildWhisperUsageDetails({ duration: Infinity }), undefined);
  });
});

// ---------------------------------------------------------------------------
// buildRecordExit - whisper-translate tail sampling (#298)
//
// Mirrors the runLLM deps-injection pattern: inject fake recordTailTrace and
// getTraceSampleRate to verify the sampling contract without calling the CF.
// ---------------------------------------------------------------------------

function makeDeps({ rate = 0.1 } = {}) {
  const calls = { record: [], rate: [] };
  return {
    calls,
    deps: {
      recordTailTrace: async (payload) => {
        calls.record.push(payload);
        return true;
      },
      getTraceSampleRate: async (featureId) => {
        calls.rate.push(featureId);
        return rate;
      },
    },
  };
}

describe("buildRecordExit (whisper-translate tail sampling)", () => {
  it("error exit: recorder called with sampleRate 1, level ERROR", async () => {
    const { calls, deps } = makeDeps();
    const recordExit = buildRecordExit({
      tracingEnabled: true,
      mimeType: "audio/mpeg",
      rawBytes: 1000,
      startTime: new Date(),
      deps,
    });

    await recordExit({ output: { error: "boom" }, statusMessage: "network_error", level: "ERROR" });

    assert.equal(calls.record.length, 1);
    assert.equal(calls.record[0].sampleRate, 1, "errors must always keep (sampleRate=1)");
    assert.equal(calls.record[0].generation.end.level, "ERROR");
    assert.equal(calls.record[0].generation.end.statusMessage, "network_error");
    assert.deepEqual(calls.rate, [], "no rate lookup needed for errors");
  });

  it("http error exit: recorder called with sampleRate 1, level ERROR, http status", async () => {
    const { calls, deps } = makeDeps();
    const recordExit = buildRecordExit({
      tracingEnabled: true,
      mimeType: "audio/mpeg",
      rawBytes: 500,
      startTime: new Date(),
      deps,
    });

    await recordExit({
      output: { error: "server error" },
      statusMessage: "http_500",
      level: "ERROR",
    });

    assert.equal(calls.record[0].sampleRate, 1);
    assert.equal(calls.record[0].generation.end.statusMessage, "http_500");
  });

  it("success exit with applySampling: fetches rate for whisper_translate", async () => {
    const { calls, deps } = makeDeps({ rate: 0.1 });
    const recordExit = buildRecordExit({
      tracingEnabled: true,
      mimeType: "audio/mpeg",
      rawBytes: 2000,
      startTime: new Date(),
      deps,
    });

    await recordExit(
      { output: "translated text", usageDetails: { audio_seconds: 5 }, metadata: {} },
      { applySampling: true },
    );

    assert.deepEqual(calls.rate, ["whisper_translate"]);
    assert.equal(calls.record[0].sampleRate, 0.1);
    assert.equal(calls.record[0].generation.end.output, "translated text");
    assert.equal(calls.record[0].generation.end.level, undefined, "clean success has no level");
  });

  it("success exit passes usageDetails through to recorder (audio_seconds contract)", async () => {
    const { calls, deps } = makeDeps();
    const recordExit = buildRecordExit({
      tracingEnabled: true,
      mimeType: "audio/mpeg",
      rawBytes: 1000,
      startTime: new Date(),
      deps,
    });

    await recordExit(
      { output: "text", usageDetails: { audio_seconds: 42 } },
      { applySampling: true },
    );

    assert.deepEqual(calls.record[0].generation.end.usageDetails, { audio_seconds: 42 });
  });

  it("tracing disabled: recorder never called", async () => {
    const { calls, deps } = makeDeps();
    const recordExit = buildRecordExit({
      tracingEnabled: false,
      mimeType: "audio/mpeg",
      rawBytes: 1000,
      startTime: new Date(),
      deps,
    });

    await recordExit({ output: "text" }, { applySampling: true });
    assert.equal(calls.record.length, 0);
    assert.equal(calls.rate.length, 0);
  });

  it("trace and generation carry backdated startTime", async () => {
    const { calls, deps } = makeDeps();
    const start = new Date("2026-09-27T10:00:00.000Z");
    const recordExit = buildRecordExit({
      tracingEnabled: true,
      mimeType: "audio/mpeg",
      rawBytes: 1000,
      startTime: start,
      deps,
    });

    await recordExit({ output: "text" }, { applySampling: true });

    assert.equal(calls.record[0].trace.startTime, start);
    assert.equal(calls.record[0].generation.startTime, start);
    assert.ok(calls.record[0].generation.end.endTime instanceof Date);
  });

  it("trace metadata includes mimeType and audioBytes", async () => {
    const { calls, deps } = makeDeps();
    const recordExit = buildRecordExit({
      tracingEnabled: true,
      mimeType: "audio/webm",
      rawBytes: 3456,
      startTime: new Date(),
      deps,
    });

    await recordExit({ output: "text" }, { applySampling: true });

    assert.deepEqual(calls.record[0].trace.metadata, { mimeType: "audio/webm", audioBytes: 3456 });
    assert.equal(calls.record[0].trace.name, "whisper-translate");
    assert.equal(calls.record[0].generation.name, "whisper-translation");
    assert.equal(calls.record[0].generation.model, "whisper-1");
  });
});
