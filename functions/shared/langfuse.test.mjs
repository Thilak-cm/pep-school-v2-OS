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

/**
 * v6-compatible fake deps for recordTailTrace.
 *
 * Mirrors the dep-injection surface of the rewritten recordTailTrace:
 *   isTracingEnabled, getSpanProcessor, startObservation, propagateAttributes.
 *
 * captured.rootSpans      - args passed to startObservation for the root span
 * captured.generations    - args passed to rootSpan.startObservation (child gen)
 * captured.genUpdates     - args passed to gen.update(...)
 * captured.endCalls       - args passed to obs.end() (endTime lands here, not in update)
 * captured.propagateCalls - params objects passed to propagateAttributes
 * captured.flushes        - times forceFlush() resolved without throwing
 */
function fakeV6Deps() {
  const captured = {
    rootSpans: [],
    generations: [],
    genUpdates: [],
    endCalls: [],
    flushes: 0,
  };

  function makeObservation() {
    const obs = {
      traceId: "fake-trace-id",
      startObservation(childName, childAttrs, options) {
        const child = makeObservation(childName, childAttrs);
        captured.generations.push({ name: childName, attrs: childAttrs, options, obs: child });
        return child;
      },
      update(updateAttrs) {
        captured.genUpdates.push(updateAttrs);
        return this;
      },
      end(endTime) {
        captured.endCalls.push(endTime);
      },
    };
    return obs;
  }

  const deps = {
    isTracingEnabled: () => true,
    getSpanProcessor: () => ({
      forceFlush: async () => {
        captured.flushes++;
      },
    }),
    startObservation: (name, attrs, options) => {
      const obs = makeObservation(name, attrs);
      captured.rootSpans.push({ name, attrs, options, obs });
      return obs;
    },
    propagateAttributes: (params, fn) => {
      captured.propagateCalls = captured.propagateCalls || [];
      captured.propagateCalls.push(params);
      return fn();
    },
  };

  return { deps, captured };
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
    const { deps, captured } = fakeV6Deps();
    const recorded = await recordTailTrace({
      deps,
      sampleRate: 0,
      rng: () => 0.99,
      ...basePayload({ end: { output: { error: "boom" }, level: "ERROR", statusMessage: "network_error", endTime: END } }),
    });
    assert.equal(recorded, true);
    assert.equal(captured.rootSpans.length, 1);
    assert.equal(captured.genUpdates[0].level, "ERROR");
    assert.equal(captured.flushes, 1);
  });

  it("records WARNING unconditionally (Q1: cap-hit signal must survive sampling)", async () => {
    const { deps, captured } = fakeV6Deps();
    const recorded = await recordTailTrace({
      deps,
      sampleRate: 0,
      rng: () => 0.99,
      ...basePayload({ end: { output: "truncated...", level: "WARNING", endTime: END } }),
    });
    assert.equal(recorded, true);
    assert.equal(captured.genUpdates[0].level, "WARNING");
  });

  it("records a clean success when the coin-flip lands under the rate", async () => {
    const { deps, captured } = fakeV6Deps();
    const recorded = await recordTailTrace({
      deps,
      sampleRate: 0.1,
      rng: () => 0.05,
      ...basePayload(),
    });
    assert.equal(recorded, true);
    assert.equal(captured.flushes, 1);
  });

  it("sampled-out success creates ZERO Langfuse objects (no spans, no flush)", async () => {
    // rng() = 0.5 > sampleRate 0.1 -> sampled out; sampling happens before
    // any span creation, so rootSpans must stay empty.
    const { deps, captured } = fakeV6Deps();
    const recorded = await recordTailTrace({
      deps,
      sampleRate: 0.1,
      rng: () => 0.5,
      ...basePayload(),
    });
    assert.equal(recorded, false);
    assert.equal(captured.rootSpans.length, 0, "sampled-out must not create any spans");
    assert.equal(captured.flushes, 0, "sampled-out must not flush");
  });

  it("backdates the trace and generation with explicit start/end times", async () => {
    const { deps, captured } = fakeV6Deps();
    await recordTailTrace({
      deps,
      sampleRate: 1,
      ...basePayload(),
    });
    // Root span startTime = trace.startTime so latency in the UI stays honest.
    assert.equal(captured.rootSpans[0].options.startTime, START);
    // Generation child startTime = generation.startTime.
    assert.equal(captured.generations[0].options.startTime, START);
    // endTime is stripped from update() and passed to end() - it lands in endCalls.
    // endCalls[0] = gen.end(END), endCalls[1] = rootSpan.end(END).
    assert.equal(captured.endCalls[0], END);
  });

  it("passes usageDetails through verbatim (audio_seconds key is a contract)", async () => {
    const { deps, captured } = fakeV6Deps();
    await recordTailTrace({
      deps,
      sampleRate: 1,
      ...basePayload({
        end: { output: "text", usageDetails: { audio_seconds: 42 }, endTime: END },
      }),
    });
    assert.deepEqual(captured.genUpdates[0].usageDetails, { audio_seconds: 42 });
  });

  it("never throws into the request path (startObservation failure -> false + warn)", async () => {
    const { deps } = fakeV6Deps();
    deps.startObservation = () => {
      throw new Error("langfuse down");
    };
    const recorded = await recordTailTrace({
      deps,
      sampleRate: 1,
      ...basePayload(),
    });
    assert.equal(recorded, false);
  });

  it("never throws when flush fails", async () => {
    const { deps } = fakeV6Deps();
    deps.getSpanProcessor = () => ({
      forceFlush: async () => {
        throw new Error("flush failed");
      },
    });
    const recorded = await recordTailTrace({
      deps,
      sampleRate: 1,
      ...basePayload(),
    });
    assert.equal(recorded, true, "spans were created; only the flush failed");
  });

  it("defaults to keeping everything when sampleRate is omitted", async () => {
    const { deps, captured } = fakeV6Deps();
    const recorded = await recordTailTrace({
      deps,
      rng: () => 0.999999,
      ...basePayload(),
    });
    assert.equal(recorded, true);
    assert.equal(captured.flushes, 1);
  });
});
