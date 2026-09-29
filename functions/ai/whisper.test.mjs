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
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWhisperUsageDetails, buildRecordExit, extractGatedTranscript } from "./whisper.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
// extractGatedTranscript - hallucination gating on verbose_json segments (#304)
//
// Thresholds are OpenAI's reference defaults (transcribe.py / faster-whisper):
// silence gate = no_speech_prob > 0.6 AND avg_logprob < -1.0 (both required),
// repetition gate = compression_ratio > 2.4. Strict inequalities: boundary
// values are kept.
// ---------------------------------------------------------------------------

// Clean segment factory: passes every gate unless overridden.
function seg(text, overrides = {}) {
  return { text, no_speech_prob: 0.1, avg_logprob: -0.3, compression_ratio: 1.5, ...overrides };
}

describe("extractGatedTranscript (#304)", () => {
  it("keeps clean segments and joins their text", () => {
    const json = { segments: [seg(" Hello"), seg(" world.")], text: "Hello world." };
    const { text, droppedSegments } = extractGatedTranscript(json);
    assert.equal(text, "Hello world.");
    assert.deepEqual(droppedSegments, []);
  });

  it("drops a segment when no_speech_prob > 0.6 AND avg_logprob < -1.0", () => {
    const json = {
      segments: [seg(" real speech"), seg(" fema.gov", { no_speech_prob: 0.9, avg_logprob: -1.5 })],
    };
    const { text, droppedSegments } = extractGatedTranscript(json);
    assert.equal(text, "real speech");
    assert.equal(droppedSegments.length, 1);
  });

  it("keeps a segment when only ONE silence signal trips (AND gate)", () => {
    const json = {
      segments: [
        seg(" confident silence hallucination?", { no_speech_prob: 0.9, avg_logprob: -0.2 }),
        seg(" noisy real speech", { no_speech_prob: 0.1, avg_logprob: -1.8 }),
      ],
    };
    const { text, droppedSegments } = extractGatedTranscript(json);
    assert.equal(text, "confident silence hallucination? noisy real speech");
    assert.deepEqual(droppedSegments, []);
  });

  it("drops a segment when compression_ratio > 2.4 regardless of other scores", () => {
    const json = {
      segments: [seg(" ok"), seg(" the the the the the", { compression_ratio: 3.1 })],
    };
    const { text, droppedSegments } = extractGatedTranscript(json);
    assert.equal(text, "ok");
    assert.equal(droppedSegments.length, 1);
  });

  it("keeps segments at exact boundary values (strict inequalities)", () => {
    const json = {
      segments: [
        seg(" a", { no_speech_prob: 0.6, avg_logprob: -1.0 }),
        seg(" b", { compression_ratio: 2.4 }),
      ],
    };
    const { text, droppedSegments } = extractGatedTranscript(json);
    assert.equal(text, "a b");
    assert.deepEqual(droppedSegments, []);
  });

  it("returns empty text when all segments are dropped", () => {
    const json = {
      segments: [
        seg(" This is a Montessori teacher recording...", { no_speech_prob: 0.95, avg_logprob: -1.4 }),
      ],
      text: "This is a Montessori teacher recording...",
    };
    const { text, droppedSegments } = extractGatedTranscript(json);
    assert.equal(text, "");
    assert.equal(droppedSegments.length, 1);
  });

  it("falls back to json.text when segments array is missing", () => {
    assert.equal(extractGatedTranscript({ text: " plain text " }).text, "plain text");
    assert.equal(extractGatedTranscript({}).text, "");
    assert.equal(extractGatedTranscript(null).text, "");
  });

  it("keeps segments with missing/non-numeric scores (cannot prove hallucination)", () => {
    const json = { segments: [{ text: " no scores at all" }, seg(" scored")] };
    const { text, droppedSegments } = extractGatedTranscript(json);
    assert.equal(text, "no scores at all scored");
    assert.deepEqual(droppedSegments, []);
  });

  it("droppedSegments entries carry text and all three scores for tuning", () => {
    const json = {
      segments: [seg(" junk", { no_speech_prob: 0.8, avg_logprob: -1.2, compression_ratio: 1.1 })],
    };
    const { droppedSegments } = extractGatedTranscript(json);
    assert.deepEqual(droppedSegments[0], {
      text: " junk",
      no_speech_prob: 0.8,
      avg_logprob: -1.2,
      compression_ratio: 1.1,
    });
  });
});

// ---------------------------------------------------------------------------
// Prompt removal (#304): the descriptive decoder-conditioning prompt made
// prompt echo possible on silent audio. It must be structurally absent.
// ---------------------------------------------------------------------------

describe("whisper.js prompt removal (#304)", () => {
  const source = readFileSync(join(__dirname, "whisper.js"), "utf-8");

  it("no longer appends a prompt to the Whisper form", () => {
    assert.ok(!source.includes('form.append("prompt"'), "prompt form field must be gone");
  });

  it("no longer reads config/voice_transcriber", () => {
    assert.ok(!source.includes("voice_transcriber"), "config fetch must be gone");
  });

  it("no longer embeds the descriptive default prompt", () => {
    assert.ok(!source.includes("Montessori teacher recording"), "default prompt text must be gone");
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
