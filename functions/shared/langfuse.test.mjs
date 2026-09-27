/**
 * Tests for Langfuse sampling helpers (#298).
 * Run: node --test functions/shared/langfuse.test.mjs
 *
 * getTraceSampleRate: config-driven per-feature rate, 5-min TTL cache,
 * fail-safe default 1.0 (telemetry config must never break LLM calls).
 *
 * recordTailTrace: tail-based recorder - callers buffer trace/generation
 * payloads until the outcome is known. Keep policy: level ERROR or WARNING
 * recorded unconditionally; clean successes coin-flip against the rate.
 * Sampled-out = zero Langfuse objects created (no client, no events, no flush).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getTraceSampleRate,
  invalidateSamplingCache,
  recordTailTrace,
} from "./langfuse.js";

// ---------------------------------------------------------------------------
// getTraceSampleRate
// ---------------------------------------------------------------------------

/** Build a deps.fetchSamplingDoc stub returning the given doc (or throwing). */
function fetchStub(doc, { throwErr } = {}) {
  const calls = { count: 0 };
  const fetch = async () => {
    calls.count++;
    if (throwErr) throw new Error("firestore unavailable");
    return doc;
  };
  return { fetch, calls };
}

describe("getTraceSampleRate", () => {
  beforeEach(() => invalidateSamplingCache());

  it("returns the configured rate for a feature", async () => {
    const { fetch } = fetchStub({ rates: { text_cleanup: 0.1, whisper_translate: 0.25 } });
    assert.equal(await getTraceSampleRate("text_cleanup", { deps: { fetchSamplingDoc: fetch } }), 0.1);
    assert.equal(await getTraceSampleRate("whisper_translate", { deps: { fetchSamplingDoc: fetch } }), 0.25);
  });

  it("returns 1.0 when the doc is missing", async () => {
    const { fetch } = fetchStub(null);
    assert.equal(await getTraceSampleRate("text_cleanup", { deps: { fetchSamplingDoc: fetch } }), 1.0);
  });

  it("returns 1.0 when the feature key is missing", async () => {
    const { fetch } = fetchStub({ rates: { text_cleanup: 0.1 } });
    assert.equal(await getTraceSampleRate("coach", { deps: { fetchSamplingDoc: fetch } }), 1.0);
  });

  it("returns 1.0 when rates map is absent", async () => {
    const { fetch } = fetchStub({});
    assert.equal(await getTraceSampleRate("text_cleanup", { deps: { fetchSamplingDoc: fetch } }), 1.0);
  });

  it("returns 1.0 when the Firestore read throws (never fail-fast)", async () => {
    const { fetch } = fetchStub(null, { throwErr: true });
    assert.equal(await getTraceSampleRate("text_cleanup", { deps: { fetchSamplingDoc: fetch } }), 1.0);
  });

  it("returns 1.0 for invalid rate values (non-number, negative, >1, NaN)", async () => {
    const { fetch } = fetchStub({
      rates: { a: "0.1", b: -0.5, c: 1.5, d: NaN, e: null },
    });
    const deps = { fetchSamplingDoc: fetch };
    for (const f of ["a", "b", "c", "d", "e"]) {
      assert.equal(await getTraceSampleRate(f, { deps }), 1.0, `rate for "${f}" should fail safe`);
    }
  });

  it("accepts edge rates 0 and 1", async () => {
    const { fetch } = fetchStub({ rates: { zero: 0, one: 1 } });
    const deps = { fetchSamplingDoc: fetch };
    assert.equal(await getTraceSampleRate("zero", { deps }), 0);
    assert.equal(await getTraceSampleRate("one", { deps }), 1);
  });

  it("caches the doc within the TTL (single fetch across calls)", async () => {
    const { fetch, calls } = fetchStub({ rates: { text_cleanup: 0.1 } });
    const deps = { fetchSamplingDoc: fetch };
    await getTraceSampleRate("text_cleanup", { deps });
    await getTraceSampleRate("whisper_translate", { deps });
    await getTraceSampleRate("coach", { deps });
    assert.equal(calls.count, 1, "should fetch once and serve the rest from cache");
  });

  it("invalidateSamplingCache forces a re-fetch", async () => {
    const { fetch, calls } = fetchStub({ rates: { text_cleanup: 0.1 } });
    const deps = { fetchSamplingDoc: fetch };
    await getTraceSampleRate("text_cleanup", { deps });
    invalidateSamplingCache();
    await getTraceSampleRate("text_cleanup", { deps });
    assert.equal(calls.count, 2);
  });

  it("does NOT cache a failed fetch (retries next call)", async () => {
    let shouldThrow = true;
    let count = 0;
    const fetch = async () => {
      count++;
      if (shouldThrow) throw new Error("boom");
      return { rates: { text_cleanup: 0.1 } };
    };
    const deps = { fetchSamplingDoc: fetch };
    assert.equal(await getTraceSampleRate("text_cleanup", { deps }), 1.0);
    shouldThrow = false;
    assert.equal(await getTraceSampleRate("text_cleanup", { deps }), 0.1);
    assert.equal(count, 2);
  });
});

// ---------------------------------------------------------------------------
// recordTailTrace
// ---------------------------------------------------------------------------

/** Fake Langfuse client capturing all calls. */
function fakeClient() {
  const captured = {
    tracePayloads: [],
    generationPayloads: [],
    endPayloads: [],
    flushes: 0,
  };
  const client = {
    trace(payload) {
      captured.tracePayloads.push(payload);
      return {
        generation(genPayload) {
          captured.generationPayloads.push(genPayload);
          return {
            end(endPayload) {
              captured.endPayloads.push(endPayload);
            },
          };
        },
      };
    },
    async flushAsync() {
      captured.flushes++;
    },
  };
  return { client, captured };
}

const START = new Date("2026-09-27T10:00:00.000Z");
const END = new Date("2026-09-27T10:00:03.500Z");

function basePayload(overrides = {}) {
  return {
    trace: { name: "text_cleanup", metadata: { featureId: "text_cleanup" }, startTime: START },
    generation: {
      name: "text_cleanup-completion",
      model: "openai/gpt-5.4-nano",
      input: [{ role: "user", content: "hi" }],
      startTime: START,
      end: { output: "cleaned", endTime: END },
      ...overrides,
    },
  };
}

describe("recordTailTrace", () => {
  it("records failures (level ERROR) unconditionally, even at rate 0", async () => {
    const { client, captured } = fakeClient();
    const recorded = await recordTailTrace({
      createClient: () => client,
      sampleRate: 0,
      rng: () => 0.99,
      ...basePayload({ end: { output: { error: "boom" }, level: "ERROR", statusMessage: "network_error", endTime: END } }),
    });
    assert.equal(recorded, true);
    assert.equal(captured.tracePayloads.length, 1);
    assert.equal(captured.endPayloads[0].level, "ERROR");
    assert.equal(captured.flushes, 1);
  });

  it("records WARNING unconditionally (Q1: cap-hit signal must survive sampling)", async () => {
    const { client, captured } = fakeClient();
    const recorded = await recordTailTrace({
      createClient: () => client,
      sampleRate: 0,
      rng: () => 0.99,
      ...basePayload({ end: { output: "truncated...", level: "WARNING", endTime: END } }),
    });
    assert.equal(recorded, true);
    assert.equal(captured.endPayloads[0].level, "WARNING");
  });

  it("records a clean success when the coin-flip lands under the rate", async () => {
    const { client, captured } = fakeClient();
    const recorded = await recordTailTrace({
      createClient: () => client,
      sampleRate: 0.1,
      rng: () => 0.05,
      ...basePayload(),
    });
    assert.equal(recorded, true);
    assert.equal(captured.flushes, 1);
  });

  it("sampled-out success creates ZERO Langfuse objects (no client, no flush)", async () => {
    let clientCreated = false;
    const recorded = await recordTailTrace({
      createClient: () => {
        clientCreated = true;
        return fakeClient().client;
      },
      sampleRate: 0.1,
      rng: () => 0.5,
      ...basePayload(),
    });
    assert.equal(recorded, false);
    assert.equal(clientCreated, false, "sampled-out must not even instantiate the client");
  });

  it("backdates the trace and generation with explicit start/end times", async () => {
    const { client, captured } = fakeClient();
    await recordTailTrace({
      createClient: () => client,
      sampleRate: 1,
      ...basePayload(),
    });
    // Trace timestamp = call start, so latency in the UI stays honest.
    assert.equal(captured.tracePayloads[0].timestamp, START);
    assert.equal(captured.generationPayloads[0].startTime, START);
    assert.equal(captured.endPayloads[0].endTime, END);
  });

  it("passes usageDetails through verbatim (audio_seconds key is a contract)", async () => {
    const { client, captured } = fakeClient();
    await recordTailTrace({
      createClient: () => client,
      sampleRate: 1,
      ...basePayload({
        end: { output: "text", usageDetails: { audio_seconds: 42 }, endTime: END },
      }),
    });
    assert.deepEqual(captured.endPayloads[0].usageDetails, { audio_seconds: 42 });
  });

  it("never throws into the request path (client creation failure -> false + warn)", async () => {
    const recorded = await recordTailTrace({
      createClient: () => {
        throw new Error("langfuse down");
      },
      sampleRate: 1,
      ...basePayload(),
    });
    assert.equal(recorded, false);
  });

  it("never throws when flush fails", async () => {
    const { client } = fakeClient();
    client.flushAsync = async () => {
      throw new Error("flush failed");
    };
    const recorded = await recordTailTrace({
      createClient: () => client,
      sampleRate: 1,
      ...basePayload(),
    });
    assert.equal(recorded, true, "events were queued; only the flush failed");
  });

  it("defaults to keeping everything when sampleRate is omitted", async () => {
    const { client, captured } = fakeClient();
    const recorded = await recordTailTrace({
      createClient: () => client,
      rng: () => 0.999999,
      ...basePayload(),
    });
    assert.equal(recorded, true);
    assert.equal(captured.flushes, 1);
  });
});
