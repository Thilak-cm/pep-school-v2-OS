/**
 * Tests for whisper usage-detail helper (#298).
 * Run: node --test functions/ai/whisper.test.mjs
 *
 * The "audio_seconds" key is a CONTRACT with the live Langfuse model
 * definition ((?i)^(whisper-1)$ @ $0.0001/audio_second) - renaming it
 * silently zeroes whisper cost reporting.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWhisperUsageDetails } from "./whisper.js";

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
