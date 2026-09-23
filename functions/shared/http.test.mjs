/**
 * #288: timeout helper tests.
 *
 * fetchWithTimeout is exercised against a stubbed globalThis.fetch that
 * honors AbortSignal, so no network is involved. withTimeout is a pure
 * Promise.race wrapper.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchWithTimeout, withTimeout } from "./http.js";

const realFetch = globalThis.fetch;

/** Stub fetch that never resolves but rejects on abort (like a hung socket). */
function hangingFetch() {
  return (url, options = {}) => new Promise((resolve, reject) => {
    options.signal?.addEventListener("abort", () => {
      const err = new Error("This operation was aborted");
      err.name = "AbortError";
      reject(err);
    });
  });
}

describe("fetchWithTimeout", () => {
  afterEach(() => { globalThis.fetch = realFetch; });

  it("passes url/options through and resolves normally under the deadline", async () => {
    const seen = [];
    globalThis.fetch = async (url, options) => {
      seen.push({ url, options });
      return { ok: true, marker: "resp" };
    };

    const res = await fetchWithTimeout("https://x.test", { method: "POST" }, 5000);
    assert.equal(res.marker, "resp");
    assert.equal(seen[0].url, "https://x.test");
    assert.equal(seen[0].options.method, "POST");
    assert.ok(seen[0].options.signal instanceof AbortSignal, "signal attached when timeoutMs set");
  });

  it("aborts a hung request at the deadline with an AbortError", async () => {
    globalThis.fetch = hangingFetch();

    await assert.rejects(
      () => fetchWithTimeout("https://x.test", {}, 30),
      (err) => err.name === "AbortError",
    );
  });

  it("attaches no signal and never aborts when timeoutMs is absent", async () => {
    const seen = [];
    globalThis.fetch = async (url, options = {}) => {
      seen.push(options);
      return { ok: true };
    };

    await fetchWithTimeout("https://x.test", {});
    assert.equal(seen[0].signal, undefined);
  });
});

describe("withTimeout", () => {
  it("resolves with the promise value when it beats the deadline", async () => {
    const result = await withTimeout(Promise.resolve(42), 5000, "download");
    assert.equal(result, 42);
  });

  it("rejects with a labeled TimeoutError when the promise hangs", async () => {
    const hung = new Promise(() => {});
    await assert.rejects(
      () => withTimeout(hung, 30, "storage download"),
      (err) => err.name === "TimeoutError" && /storage download/.test(err.message),
    );
  });

  it("propagates the promise's own rejection when it fails under the deadline", async () => {
    await assert.rejects(
      () => withTimeout(Promise.reject(new Error("boom")), 5000, "x"),
      /boom/,
    );
  });
});
