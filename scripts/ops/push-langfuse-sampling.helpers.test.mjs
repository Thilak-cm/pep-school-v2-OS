/**
 * Tests for push-langfuse-sampling helpers (#298).
 * Run: node --test scripts/ops/push-langfuse-sampling.helpers.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DESIRED_RATES,
  validateRates,
  diffRates,
  formatRatesDiff,
} from "./push-langfuse-sampling.helpers.mjs";

describe("DESIRED_RATES", () => {
  it("configures exactly text_cleanup and whisper_translate at 0.1 (#298 decision)", () => {
    assert.deepEqual(DESIRED_RATES, { text_cleanup: 0.1, whisper_translate: 0.1 });
  });
});

describe("validateRates", () => {
  it("accepts valid rates", () => {
    assert.deepEqual(validateRates({ text_cleanup: 0.1, whisper_translate: 1 }), []);
  });

  it("rejects non-object input", () => {
    assert.ok(validateRates(null).length > 0);
    assert.ok(validateRates([0.1]).length > 0);
  });

  it("rejects out-of-range or non-number rates", () => {
    assert.ok(validateRates({ a: -0.1 }).length > 0);
    assert.ok(validateRates({ a: 1.5 }).length > 0);
    assert.ok(validateRates({ a: "0.1" }).length > 0);
    assert.ok(validateRates({ a: NaN }).length > 0);
  });
});

describe("diffRates", () => {
  it("reports all-added when remote doc is missing", () => {
    const diff = diffRates({ a: 0.1 }, null);
    assert.deepEqual(diff.added, ["a"]);
    assert.deepEqual(diff.changed, []);
    assert.deepEqual(diff.removed, []);
  });

  it("reports changed and unchanged keys", () => {
    const diff = diffRates({ a: 0.1, b: 0.2 }, { rates: { a: 0.1, b: 0.5 } });
    assert.deepEqual(diff.unchanged, ["a"]);
    assert.deepEqual(diff.changed, ["b"]);
  });

  it("reports keys present remotely but not locally as removed", () => {
    const diff = diffRates({ a: 0.1 }, { rates: { a: 0.1, stale: 0.3 } });
    assert.deepEqual(diff.removed, ["stale"]);
  });
});

describe("formatRatesDiff", () => {
  it("names keys and rates without dumping doc contents", () => {
    const out = formatRatesDiff(
      { added: ["a"], changed: ["b"], removed: ["c"], unchanged: [] },
      { a: 0.1, b: 0.2 },
      { rates: { b: 0.5, c: 0.3 } },
    );
    assert.match(out, /a.*0\.1/);
    assert.match(out, /b.*0\.5.*->.*0\.2/);
    assert.match(out, /c/);
  });
});
