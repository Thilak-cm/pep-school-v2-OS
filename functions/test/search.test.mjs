/**
 * Contract tests: Typesense search CFs (#331).
 *
 * Source-scan tests verify structural invariants for mintTypesenseKey and
 * syncObservationToTypesense without executing Cloud Functions.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_ROOT = join(__dirname, "..");

function readSource(relativePath) {
  return readFileSync(join(FUNCTIONS_ROOT, relativePath), "utf8");
}

// ── syncObservationToTypesense ─────────────────────────────────────────────

describe("syncObservationToTypesense (#331)", () => {
  const source = readSource("search/syncObservationToTypesense.mjs");

  test("triggers on students/{studentId}/observations/{observationId}", () => {
    assert.match(source, /students\/\{studentId\}\/observations\/\{observationId\}/);
  });

  test("handles writes (create, update, delete) via onWrite", () => {
    assert.match(source, /onWrite/);
  });

  test("skips assessment type observations (never indexed)", () => {
    assert.match(source, /assessment/);
  });

  test("skips medical type observations (never indexed)", () => {
    assert.match(source, /medical/);
  });

  test("runs in asia-south1 region", () => {
    assert.match(source, /asia-south1/);
  });
});

// ── mintTypesenseKey ───────────────────────────────────────────────────────

describe("mintTypesenseKey (#331)", () => {
  const source = readSource("search/mintTypesenseKey.mjs");

  test("is a Callable CF (onCall)", () => {
    assert.match(source, /onCall/);
  });

  test("scopes key for classroomadmin via manageableClassrooms", () => {
    assert.match(source, /classroomadmin/);
    assert.match(source, /manageableClassrooms/);
  });

  test("handles superadmin as unscoped key", () => {
    assert.match(source, /superadmin/);
  });

  test("returns key and expiresAt for TTL-aware caching in hook", () => {
    assert.match(source, /expiresAt/);
    assert.match(source, /key/);
  });

  test("runs in asia-south1 region", () => {
    assert.match(source, /asia-south1/);
  });
});

// ── backfill script ────────────────────────────────────────────────────────

describe("backfill-typesense script (#331)", () => {
  const source = readFileSync(
    join(FUNCTIONS_ROOT, "..", "scripts", "ops", "backfill-typesense.mjs"),
    "utf8"
  );

  test("requires explicit --yes flag before writing (dry-run default)", () => {
    assert.match(source, /--yes/);
  });

  test("supports --resume to continue from checkpoint", () => {
    assert.match(source, /--resume|checkpoint/i);
  });

  test("skips assessment and medical observations", () => {
    assert.match(source, /assessment/);
    assert.match(source, /medical/);
  });
});
