#!/usr/bin/env node
/**
 * Smoke test for Langfuse v6 OTEL integration (#319).
 *
 * Creates a test trace with a generation and a span, flushes to Langfuse,
 * and prints the trace URL. Verifies the v6 SDK -> Langfuse v4 server path
 * works end-to-end without touching production Cloud Functions.
 *
 * Usage:
 *   LANGFUSE_SECRET_KEY=sk-lf-... LANGFUSE_PUBLIC_KEY=pk-lf-... \
 *     node scripts/ops/smoke-test-langfuse-v6.mjs
 *
 * Then open the printed URL in Langfuse to verify:
 *   - Trace appears with name "v6-smoke-test"
 *   - Generation child shows model, input, output, usageDetails
 *   - Span child shows input/output
 *   - Tags and metadata are set correctly
 *   - Environment is "development"
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startObservation, propagateAttributes } from "@langfuse/tracing";

const BASE_URL = process.env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com";

if (!process.env.LANGFUSE_SECRET_KEY || !process.env.LANGFUSE_PUBLIC_KEY) {
  console.error("Missing LANGFUSE_SECRET_KEY or LANGFUSE_PUBLIC_KEY env vars.");
  console.error("Usage:");
  console.error("  LANGFUSE_SECRET_KEY=sk-lf-... LANGFUSE_PUBLIC_KEY=pk-lf-... node scripts/ops/smoke-test-langfuse-v6.mjs");
  process.exit(1);
}

// 1. Init OTEL SDK with Langfuse processor (same as langfuse.js does at module level)
const processor = new LangfuseSpanProcessor({
  baseUrl: BASE_URL,
  exportMode: "immediate",
  environment: "development",
});
const sdk = new NodeSDK({ spanProcessors: [processor] });
sdk.start();
console.log("OTEL SDK started with LangfuseSpanProcessor (immediate mode, env=development)");

// 2. Create a root span (= the trace in Langfuse)
const root = startObservation("v6-smoke-test", {
  metadata: { purpose: "migration-verification", issue: "#319" },
});
console.log(`Root span created - traceId: ${root.traceId}`);

// 3. Set trace-level attributes
propagateAttributes({
  traceName: "v6-smoke-test",
  tags: ["smoke-test", "v6-migration"],
  metadata: { runner: "manual" },
}, () => {
  // 4. Create a generation child (simulates an LLM call)
  const gen = root.startObservation("test-llm-call", {
    model: "openai/gpt-5.4-nano",
    input: [{ role: "user", content: "Hello, this is a v6 smoke test" }],
    metadata: { featureId: "smoke_test", requestedModel: "gpt-5.4-nano" },
  }, { asType: "generation" });

  gen.update({
    output: "This is a simulated LLM response for the v6 migration smoke test.",
    usageDetails: { input: 15, output: 20, total: 35 },
    metadata: { responseModel: "openai/gpt-5.4-nano", finishReason: "stop" },
  }).end();
  console.log("Generation span created and ended");

  // 5. Create a span child (simulates a tool call or processing step)
  const span = root.startObservation("test-processing-step", {
    input: { step: "validation", schema: "test-schema" },
  });
  span.update({
    output: { valid: true, repairAttempts: 0 },
    metadata: { processingMs: 42 },
  }).end();
  console.log("Span created and ended");
});

// 6. End root and flush
root.update({
  output: { status: "smoke-test-complete", children: 2 },
}).end();

console.log("Flushing to Langfuse...");
await processor.forceFlush();
console.log("Flush complete.");

// 7. Print the trace URL
const traceUrl = `${BASE_URL}/trace/${root.traceId}`;
console.log("");
console.log("=== VERIFICATION ===");
console.log(`Open this URL to verify the trace: ${traceUrl}`);
console.log("");
console.log("Check:");
console.log("  - Trace name: v6-smoke-test");
console.log("  - Tags: smoke-test, v6-migration");
console.log("  - Environment: development");
console.log("  - 1 generation child (test-llm-call) with model + usage");
console.log("  - 1 span child (test-processing-step) with input/output");
console.log("");

await sdk.shutdown();
