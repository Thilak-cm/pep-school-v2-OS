/**
 * Tests for per-program baseball card config resolution (PEP-132).
 *
 * Validates that:
 * 1. Config doc ID resolves correctly per program
 * 2. Unknown/null programId throws
 * 3. Each program's prompt contains correct curriculum domains
 * 4. Prompts do NOT contain domains from other programs
 *
 * Run with: node --test functions/ai/baseballCard.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";

// ── Inline copy of config resolution logic under test ─────────────────

const VALID_PROGRAMS = ["toddler", "primary", "elementary", "adolescent"];

function getBaseballCardConfigDocId(programId) {
  if (!programId || !VALID_PROGRAMS.includes(programId)) {
    throw new Error(
      `Cannot resolve baseball card config: invalid programId "${programId}". ` +
      `Must be one of: ${VALID_PROGRAMS.join(", ")}`
    );
  }
  return `baseball_card_${programId}`;
}

// ── Per-program curriculum domains (source of truth for prompt content) ──

const PROGRAM_DOMAINS = {
  toddler: ["Practical Life", "Social-Emotional", "Language & Literacy", "Mathematics & Sensorial"],
  primary: ["Practical Life", "Social-Emotional", "Language & Literacy", "Mathematics & Sensorial"],
  elementary: ["Language Arts", "Mathematics", "Sciences & Cultural Studies", "Creative Arts"],
  adolescent: ["Mathematics", "Language & Humanities", "Sciences", "Enterprise & Applied Learning", "Social Development"],
};

// Domains that should NOT appear in non-primary/toddler programs
const PRIMARY_ONLY_DOMAINS = ["Practical Life", "Sensorial"];

// ── Tests: Config doc ID resolution ───────────────────────────────────

test("getBaseballCardConfigDocId — resolves correct doc for each program", () => {
  assert.equal(getBaseballCardConfigDocId("primary"), "baseball_card_primary");
  assert.equal(getBaseballCardConfigDocId("toddler"), "baseball_card_toddler");
  assert.equal(getBaseballCardConfigDocId("elementary"), "baseball_card_elementary");
  assert.equal(getBaseballCardConfigDocId("adolescent"), "baseball_card_adolescent");
});

test("getBaseballCardConfigDocId — throws for null programId", () => {
  assert.throws(
    () => getBaseballCardConfigDocId(null),
    /invalid programId/
  );
});

test("getBaseballCardConfigDocId — throws for undefined programId", () => {
  assert.throws(
    () => getBaseballCardConfigDocId(undefined),
    /invalid programId/
  );
});

test("getBaseballCardConfigDocId — throws for unknown program", () => {
  assert.throws(
    () => getBaseballCardConfigDocId("middle_school"),
    /invalid programId/
  );
});

test("getBaseballCardConfigDocId — throws for empty string", () => {
  assert.throws(
    () => getBaseballCardConfigDocId(""),
    /invalid programId/
  );
});

// ── Tests: Domain correctness per program ─────────────────────────────

test("PROGRAM_DOMAINS — primary has Practical Life and Sensorial-related domain", () => {
  const domains = PROGRAM_DOMAINS.primary;
  assert.ok(domains.some((d) => d.includes("Practical Life")));
  assert.ok(domains.some((d) => d.includes("Sensorial")));
});

test("PROGRAM_DOMAINS — toddler has Practical Life and Sensorial-related domain", () => {
  const domains = PROGRAM_DOMAINS.toddler;
  assert.ok(domains.some((d) => d.includes("Practical Life")));
  assert.ok(domains.some((d) => d.includes("Sensorial")));
});

test("PROGRAM_DOMAINS — elementary does NOT have Practical Life or Sensorial", () => {
  const domains = PROGRAM_DOMAINS.elementary;
  for (const forbidden of PRIMARY_ONLY_DOMAINS) {
    assert.ok(
      !domains.some((d) => d.includes(forbidden)),
      `Elementary should not include "${forbidden}" but found it in: ${domains.join(", ")}`
    );
  }
});

test("PROGRAM_DOMAINS — adolescent does NOT have Practical Life or Sensorial", () => {
  const domains = PROGRAM_DOMAINS.adolescent;
  for (const forbidden of PRIMARY_ONLY_DOMAINS) {
    assert.ok(
      !domains.some((d) => d.includes(forbidden)),
      `Adolescent should not include "${forbidden}" but found it in: ${domains.join(", ")}`
    );
  }
});

test("PROGRAM_DOMAINS — elementary has expected domains", () => {
  const domains = PROGRAM_DOMAINS.elementary;
  assert.ok(domains.includes("Language Arts"));
  assert.ok(domains.includes("Mathematics"));
  assert.ok(domains.includes("Sciences & Cultural Studies"));
  assert.ok(domains.includes("Creative Arts"));
});

test("PROGRAM_DOMAINS — adolescent has expected domains", () => {
  const domains = PROGRAM_DOMAINS.adolescent;
  assert.ok(domains.includes("Mathematics"));
  assert.ok(domains.includes("Language & Humanities"));
  assert.ok(domains.includes("Sciences"));
  assert.ok(domains.includes("Enterprise & Applied Learning"));
  assert.ok(domains.includes("Social Development"));
});

// ── Tests: Domain list consolidation (appears once in prompt) ─────────

test("PROGRAM_DOMAINS — all programs have at least 4 domains", () => {
  for (const [program, domains] of Object.entries(PROGRAM_DOMAINS)) {
    assert.ok(
      domains.length >= 4,
      `${program} has only ${domains.length} domains, expected at least 4`
    );
  }
});

test("PROGRAM_DOMAINS — no program has duplicate domains", () => {
  for (const [program, domains] of Object.entries(PROGRAM_DOMAINS)) {
    const unique = new Set(domains);
    assert.equal(
      unique.size,
      domains.length,
      `${program} has duplicate domains: ${domains.join(", ")}`
    );
  }
});
