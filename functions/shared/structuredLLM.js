/**
 * Schema-enforced LLM calls with bounded repair retry.
 *
 * Reference implementation for #273 (Zod enforcement for LLM pipeline outputs),
 * built ad hoc after the W38 baseballCards incident: gpt-5.4-mini derailed
 * mid-JSON (emitted a keyless bare string at a paragraph boundary), rambled to
 * the max_tokens cap, and shipped unparseable output. A sibling failure in the
 * same run emitted a duplicate "summary" key - legal JSON, so JSON.parse
 * silently dropped a paragraph and the corrupted card shipped as "success".
 *
 * Two enforcement boundaries, one Zod schema:
 *
 * 1. Request-side (prevention): the schema is converted to JSON Schema and sent
 *    as response_format { type: "json_schema", strict: true }, so the provider
 *    constrains token sampling - keyless strings and duplicate keys become
 *    unsamplable. This is the layer that actually prevents both W38 failure
 *    modes; response-side validation cannot see duplicate keys (JSON.parse
 *    collapses them first).
 *
 * 2. Response-side (detection): schema.safeParse replaces bare JSON.parse, so
 *    valid-JSON-wrong-shape output (e.g. severity "moderate", missing redFlag)
 *    fails loudly with a field path instead of being silently coerced.
 *
 * Repair retry: on validation failure or a max_tokens cap-hit, re-invoke with
 * the bad output + exact validation error appended so the model sees its own
 * mistake (plain retry is wishful thinking; the repair context is what changes
 * the outcome). Cap-hits are treated as failures, never as a cue to raise
 * max_tokens: per-feature caps are tuned to ~2-3x observed healthy p99 output,
 * so hitting one means degenerate generation, not a legitimately long answer.
 *
 * Attempt budget trade-off (W38 decision): base rate of malformed output was
 * ~0.5% of generations (2/441 observed, one silent). One repair attempt
 * (~90-95% success) drops residual failure below the infra noise floor; the
 * second repair attempt is pure safety margin. Two consecutive repair failures
 * is strong evidence of a structural problem (prompt drift, model swap, schema
 * mismatch) where more retries would replay the failure and delay the alarm -
 * so we stop and fail the work item loudly. Hardcoded, not config: the number
 * falls out of failure statistics, not preference.
 *
 * Layering vs #288 (Pub/Sub retry + DLQ): disjoint failure modes. #288 retries
 * transport failures (timeouts, 5xx) via NACK/redelivery. This module retries
 * content failures (call succeeded, payload is garbage), which fan-out workers
 * classify as permanent ("internal") and never redeliver. This is the only
 * retry that failure mode gets.
 *
 * No silent downgrade by design: if the resolved model rejects strict
 * json_schema (registry later pointed at an unsupported model), the API call
 * fails loudly. Falling back to json_object would silently reopen both W38
 * failure modes.
 */

import * as functions from "firebase-functions/v1";
import { z } from "zod";
import { runLLM as defaultRunLLM } from "./llm.js";
import { createLangfuse } from "./langfuse.js";

/** Max repair attempts after the initial call (so max 3 LLM calls total). */
const MAX_REPAIR_ATTEMPTS = 2;

/**
 * Flatten a Zod error into "field.path: message; ..." for logs, work-item
 * detail, and the repair prompt.
 * @param {import("zod").ZodError} error
 * @returns {string}
 */
export function formatZodError(error) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Build the response_format payload for strict structured outputs.
 * Exported for tests.
 * @param {import("zod").ZodType} schema
 * @param {string} schemaName
 * @returns {object}
 */
export function buildJsonSchemaResponseFormat(schema, schemaName) {
  return {
    type: "json_schema",
    json_schema: {
      name: schemaName,
      strict: true,
      schema: z.toJSONSchema(schema),
    },
  };
}

/**
 * Run a schema-enforced LLM call with bounded repair retry.
 *
 * Accepts all runLLM options except responseFormat (derived from the schema).
 * All attempts nest under one Langfuse trace, tagged with repairAttempt so a
 * rising repair rate is itself a drift signal worth alerting on.
 *
 * @param {object} options
 * @param {import("zod").ZodType} options.schema - Zod schema for the expected response
 * @param {string} options.schemaName - JSON Schema name sent to the provider
 * @param {Array} options.messages - Chat completion messages array
 * @param {object} [options.deps] - Test injection: { runLLM }
 * @returns {Promise<{data: object, rawContent: string, repairAttempts: number,
 *   usage: object, resolvedModel: string, responseModel: string|null}>}
 *   data is the schema-validated payload; repairAttempts is how many repairs ran.
 * @throws {functions.https.HttpsError} "internal" after all attempts fail -
 *   fan-out workers classify this as permanent (ACK + failed work item).
 */
export async function runStructuredLLM({
  schema,
  schemaName,
  messages,
  deps = {},
  ...llmOptions
}) {
  const runLLM = deps.runLLM || defaultRunLLM;
  const responseFormat = buildJsonSchemaResponseFormat(schema, schemaName);

  // One trace for all attempts. runLLM creates its own trace per call when none
  // is passed, which would scatter repair attempts across traces and hide the
  // repair rate. Events queue on the client that created the trace, so we own
  // the flush here (runLLM's internal flush only covers its own client).
  let langfuse = null;
  let trace = llmOptions.trace || null;
  if (!trace && process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY) {
    langfuse = createLangfuse();
    trace = langfuse.trace({
      name: llmOptions.traceName || llmOptions.featureId,
      metadata: { featureId: llmOptions.featureId, schemaName, ...llmOptions.traceMetadata },
    });
  }

  let attemptMessages = messages;
  let lastFailure = null;

  try {
    for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
      const { content, usage, resolvedModel, responseModel, finishReason } = await runLLM({
        ...llmOptions,
        messages: attemptMessages,
        responseFormat,
        trace,
        generationMetadata: { ...llmOptions.generationMetadata, repairAttempt: attempt },
      });

      let failure = null;
      if (finishReason === "length") {
        // Cap-hit = degenerate generation (see module docblock). The truncated
        // output still goes into the repair context - it shows the model where
        // it derailed.
        failure = "output truncated at max_tokens (finish_reason=length); " +
          "the response ran far past the expected length";
      } else {
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch (err) {
          failure = `invalid JSON: ${err.message}`;
        }
        if (!failure) {
          const result = schema.safeParse(parsed);
          if (result.success) {
            return {
              data: result.data,
              rawContent: content,
              repairAttempts: attempt,
              usage,
              resolvedModel,
              responseModel,
            };
          }
          failure = formatZodError(result.error);
        }
      }

      lastFailure = failure;
      console.warn(
        `[structuredLLM:${llmOptions.featureId}] attempt ${attempt} failed validation: ${failure}`,
      );

      if (attempt < MAX_REPAIR_ATTEMPTS) {
        // Repair context: original messages + the bad output + the exact error.
        // A different input escapes deterministic re-failure and gives the
        // model evidence of its own mistake instead of a blind re-roll.
        attemptMessages = [
          ...messages,
          { role: "assistant", content },
          {
            role: "user",
            content:
              `Your previous response failed validation: ${failure}\n` +
              "Return ONLY a single corrected JSON object that matches the required schema. " +
              "Do not include any text outside the JSON object.",
          },
        ];
      }
    }
  } finally {
    if (langfuse) {
      try {
        await langfuse.flushAsync();
      } catch (e) {
        console.warn("[structuredLLM] Langfuse flush failed:", e?.message);
      }
    }
  }

  // "internal" is in the fan-out workers' PERMANENT_CODES: ACK + failed work
  // item, no Pub/Sub redelivery. Two consecutive repair failures = structural
  // problem; surface to a human instead of spending more.
  throw new functions.https.HttpsError(
    "internal",
    `schema_violation: output failed validation after ${MAX_REPAIR_ATTEMPTS} repair attempt(s): ${lastFailure}`,
  );
}
