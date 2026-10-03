/**
 * #306: Monthly plan response schema tests.
 *
 * Validates the Zod contract for monthly plan generation (adopted after the
 * 2026-10 batch incident where a provider error shipped truncated JSON and a
 * bare JSON.parse turned it into a permanent failed work item), plus the
 * repair-path integration with runStructuredLLM.
 *
 * Strictness decisions (resolved at /plan-issue, 2026-10-02):
 * - enums for planningMode / basis / section name (consumers are name-keyed)
 * - exactly 5 sections + uniqueness refine, but NO order enforcement (both
 *   consumers look sections up by name; a tuple would couple code to prompt
 *   ordering that lives in Firestore config)
 * - items min(1) no max (schema guards integrity - empty section - while item
 *   count stays a prompt-level style rule; exact-5 would burn repair budget on
 *   stylistic misses)
 * - closed top-level object (safeParse strips unknown keys, so the Firestore
 *   doc shape is deterministic instead of inheriting arbitrary LLM extras)
 */
import test from "node:test";
import assert from "node:assert/strict";

import { MonthlyPlanResponseSchema } from "./planSchema.js";
import {
  runStructuredLLM,
  buildJsonSchemaResponseFormat,
} from "../shared/structuredLLM.js";

const SECTION_NAMES = [
  "Language",
  "Sensorial",
  "Math",
  "Practical Life",
  "Grace & Courtesy",
];

function validItem(overrides = {}) {
  return {
    work: "Sandpaper letters s, m, a, t",
    basis: "observed",
    why: "Repeated interest in letter sounds this month.",
    hook: "animals",
    offer: "Three period lesson, two letters at a time.",
    next: "Object boxes with initial sounds.",
    watch: "Traces letters unprompted.",
    ...overrides,
  };
}

function validSection(name, overrides = {}) {
  return {
    name,
    position: "Early sound work, on track for age.",
    monthlyAim: "Consolidate first sandpaper letters.",
    items: [validItem()],
    ...overrides,
  };
}

function validPlan(overrides = {}) {
  return {
    studentId: "2026-AED-009",
    studentName: "Test Student",
    age: "4y 2m",
    month: "2026-10",
    planningMode: "observationBased",
    dataSufficiency: {
      meaningfulObservationCount: 7,
      summary: "Enough recent observations to locate the child.",
    },
    dataWindow: { from: "2026-06-01", to: "2026-09-28", observationCount: 12 },
    affinities: ["animals", "maps"],
    sections: SECTION_NAMES.map((name) => validSection(name)),
    ...overrides,
  };
}

/** Injectable runLLM stub replaying scripted responses (structuredLLM.test.mjs pattern). */
function stubRunLLM(responses) {
  const calls = [];
  return {
    calls,
    runLLM: async (options) => {
      calls.push(options);
      const next = responses[Math.min(calls.length - 1, responses.length - 1)];
      return {
        content: next.content,
        finishReason: next.finishReason ?? "stop",
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        resolvedModel: "openai/test-model",
        responseModel: null,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

test("valid full payload passes and data is preserved", () => {
  const result = MonthlyPlanResponseSchema.safeParse(validPlan());
  assert.equal(result.success, true);
  assert.equal(result.data.planningMode, "observationBased");
  assert.equal(result.data.sections.length, 5);
  assert.equal(result.data.sections[0].items[0].basis, "observed");
});

test("coldStart payload with empty affinities passes", () => {
  const result = MonthlyPlanResponseSchema.safeParse(
    validPlan({ planningMode: "coldStart", affinities: [] }),
  );
  assert.equal(result.success, true);
});

test("unknown top-level keys are stripped from parsed data", () => {
  const result = MonthlyPlanResponseSchema.safeParse(
    validPlan({ hallucinatedExtra: "should not reach Firestore" }),
  );
  assert.equal(result.success, true);
  assert.equal("hallucinatedExtra" in result.data, false);
});

test("missing required field fails with path", () => {
  const plan = validPlan();
  delete plan.dataSufficiency;
  const result = MonthlyPlanResponseSchema.safeParse(plan);
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((i) => i.path[0] === "dataSufficiency"));
});

test("invalid planningMode fails", () => {
  const result = MonthlyPlanResponseSchema.safeParse(
    validPlan({ planningMode: "observation-based" }),
  );
  assert.equal(result.success, false);
});

test("invalid basis enum fails with full path", () => {
  const sections = SECTION_NAMES.map((name) => validSection(name));
  sections[2].items = [validItem({ basis: "age-benchmark" })];
  const result = MonthlyPlanResponseSchema.safeParse(validPlan({ sections }));
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some(
    (i) => i.path.join(".") === "sections.2.items.0.basis",
  ));
});

test("misspelled section name fails", () => {
  const sections = SECTION_NAMES.map((name) => validSection(name));
  sections[3] = validSection("Practical life");
  const result = MonthlyPlanResponseSchema.safeParse(validPlan({ sections }));
  assert.equal(result.success, false);
});

test("4 sections fails, 6 sections fails", () => {
  const four = SECTION_NAMES.slice(0, 4).map((name) => validSection(name));
  assert.equal(
    MonthlyPlanResponseSchema.safeParse(validPlan({ sections: four })).success,
    false,
  );
  const six = [...SECTION_NAMES, "Language"].map((name) => validSection(name));
  assert.equal(
    MonthlyPlanResponseSchema.safeParse(validPlan({ sections: six })).success,
    false,
  );
});

test("duplicate section names fail even at count 5", () => {
  const sections = [
    validSection("Language"),
    validSection("Language"),
    validSection("Math"),
    validSection("Practical Life"),
    validSection("Grace & Courtesy"),
  ];
  const result = MonthlyPlanResponseSchema.safeParse(validPlan({ sections }));
  assert.equal(result.success, false);
});

test("empty items array fails (min 1); 7 items passes (no max)", () => {
  const empty = SECTION_NAMES.map((name) => validSection(name));
  empty[4].items = [];
  assert.equal(
    MonthlyPlanResponseSchema.safeParse(validPlan({ sections: empty })).success,
    false,
  );
  const seven = SECTION_NAMES.map((name) => validSection(name));
  seven[0].items = Array.from({ length: 7 }, () => validItem());
  assert.equal(
    MonthlyPlanResponseSchema.safeParse(validPlan({ sections: seven })).success,
    true,
  );
});

test("empty work string fails", () => {
  const sections = SECTION_NAMES.map((name) => validSection(name));
  sections[0].items = [validItem({ work: "" })];
  assert.equal(
    MonthlyPlanResponseSchema.safeParse(validPlan({ sections })).success,
    false,
  );
});

test("negative or non-integer observation counts fail", () => {
  assert.equal(
    MonthlyPlanResponseSchema.safeParse(validPlan({
      dataSufficiency: { meaningfulObservationCount: -1, summary: "x" },
    })).success,
    false,
  );
  assert.equal(
    MonthlyPlanResponseSchema.safeParse(validPlan({
      dataWindow: { from: "2026-06-01", to: "2026-09-28", observationCount: 2.5 },
    })).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// Strict json_schema conversion (request-side boundary)
// ---------------------------------------------------------------------------

test("schema converts to strict json_schema response_format without throwing", () => {
  const rf = buildJsonSchemaResponseFormat(MonthlyPlanResponseSchema, "monthly_plan");
  assert.equal(rf.type, "json_schema");
  assert.equal(rf.json_schema.strict, true);
  const js = rf.json_schema.schema;
  // Closed object with every field required (strict-mode contract).
  assert.equal(js.additionalProperties, false);
  assert.deepEqual(
    [...js.required].sort(),
    Object.keys(js.properties).sort(),
  );
  // length(5) surfaces as minItems/maxItems; the uniqueness refine is
  // response-side only and must not break conversion.
  assert.equal(js.properties.sections.minItems, 5);
  assert.equal(js.properties.sections.maxItems, 5);
});

// ---------------------------------------------------------------------------
// Repair path through runStructuredLLM (the 2026-10 incident class)
// ---------------------------------------------------------------------------

const TRUNCATED = JSON.stringify(validPlan()).slice(0, 180);

test("truncated JSON (provider mid-generation failure) repairs on second attempt", async () => {
  const stub = stubRunLLM([
    { content: TRUNCATED },
    { content: JSON.stringify(validPlan()) },
  ]);
  const result = await runStructuredLLM({
    schema: MonthlyPlanResponseSchema,
    schemaName: "monthly_plan",
    featureId: "monthly_plan",
    messages: [{ role: "system", content: "sys" }, { role: "user", content: "u" }],
    model: "test-model",
    deps: { runLLM: stub.runLLM },
  });
  assert.equal(stub.calls.length, 2);
  assert.equal(result.repairAttempts, 1);
  assert.equal(result.data.studentId, "2026-AED-009");
});

test("persistent shape violation exhausts repairs and throws schema_violation", async () => {
  const bad = JSON.stringify(validPlan({ planningMode: "vibes" }));
  const stub = stubRunLLM([{ content: bad }]);
  await assert.rejects(
    runStructuredLLM({
      schema: MonthlyPlanResponseSchema,
      schemaName: "monthly_plan",
      featureId: "monthly_plan",
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "u" }],
      model: "test-model",
      deps: { runLLM: stub.runLLM },
    }),
    (err) => {
      assert.equal(err.code, "internal");
      assert.match(err.message, /schema_violation/);
      return true;
    },
  );
  assert.equal(stub.calls.length, 3); // initial + 2 repairs
});

// ---------------------------------------------------------------------------
// traceTags threading (AC-3 / AC-5: run provenance reaches own-trace)
// ---------------------------------------------------------------------------

test("traceTags are forwarded to the own-trace Langfuse trace", async () => {
  const stub = stubRunLLM([{ content: JSON.stringify(validPlan()) }]);

  // Fake Langfuse client to capture the trace creation payload.
  const traces = [];
  const fakeLangfuse = {
    trace(payload) {
      const t = { payload, gens: [] };
      t.generation = (gp) => {
        const g = { create: gp, ends: [] };
        t.gens.push(g);
        return { end: (e) => g.ends.push(e) };
      };
      traces.push(t);
      return t;
    },
    flushAsync: async () => {},
  };

  // Inject env so structuredLLM creates its own trace (own-trace path).
  const savedSK = process.env.LANGFUSE_SECRET_KEY;
  const savedPK = process.env.LANGFUSE_PUBLIC_KEY;
  process.env.LANGFUSE_SECRET_KEY = "sk-test";
  process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
  try {
    await runStructuredLLM({
      schema: MonthlyPlanResponseSchema,
      schemaName: "monthly_plan",
      featureId: "monthly_plan",
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "u" }],
      model: "test-model",
      traceTags: ["run:scheduled"],
      deps: { runLLM: stub.runLLM, createLangfuse: () => fakeLangfuse },
    });
  } finally {
    if (savedSK === undefined) delete process.env.LANGFUSE_SECRET_KEY;
    else process.env.LANGFUSE_SECRET_KEY = savedSK;
    if (savedPK === undefined) delete process.env.LANGFUSE_PUBLIC_KEY;
    else process.env.LANGFUSE_PUBLIC_KEY = savedPK;
  }

  assert.equal(traces.length, 1, "exactly one own-trace created");
  assert.deepEqual(traces[0].payload.tags, ["run:scheduled"],
    "traceTags must reach the Langfuse trace so run provenance is filterable");
});
