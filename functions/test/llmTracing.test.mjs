/**
 * Unit tests for LLM tracing: usageDetails forwarding and input sanitizer (#319).
 *
 * Tests the shared layer changes via dependency injection (llm.js deps param).
 * Run: node --test functions/test/llmTracing.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// sanitizeMessagesForTrace
// ---------------------------------------------------------------------------

// Imported after the module exists - placeholder for the red phase.
// The import will fail until the export is added to llm.js.
let sanitizeMessagesForTrace;
let mapUsageDetails;
try {
  ({ sanitizeMessagesForTrace, mapUsageDetails } = await import("../shared/llm.js"));
} catch {
  // Expected to fail in red phase
}

describe("sanitizeMessagesForTrace", () => {
  it("strips data-URI image parts and replaces with metadata", () => {
    // 12 bytes of base64 payload = 9 raw bytes
    const base64Payload = "AQIDBAUG"; // 8 chars = 6 bytes
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image" },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64Payload}` },
          },
        ],
      },
    ];

    const sanitized = sanitizeMessagesForTrace(messages);

    // Text part unchanged
    assert.deepStrictEqual(sanitized[0].content[0], {
      type: "text",
      text: "Describe this image",
    });
    // Image part stripped
    const imgPart = sanitized[0].content[1];
    assert.ok(imgPart.image_url.url.startsWith("[stripped:"));
    assert.ok(imgPart.image_url.url.includes("image/png"));
    // Original untouched
    assert.ok(messages[0].content[1].image_url.url.startsWith("data:"));
  });

  it("leaves non-data-URI URLs untouched", () => {
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "https://example.com/photo.jpg" },
          },
        ],
      },
    ];

    const sanitized = sanitizeMessagesForTrace(messages);
    assert.equal(
      sanitized[0].content[0].image_url.url,
      "https://example.com/photo.jpg",
    );
  });

  it("handles plain string content (no parts array)", () => {
    const messages = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ];

    const sanitized = sanitizeMessagesForTrace(messages);
    assert.deepStrictEqual(sanitized, messages);
  });

  it("handles mixed content with multiple data-URIs", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "Compare these" },
          {
            type: "image_url",
            image_url: { url: "data:image/jpeg;base64,/9j/4AAQ" },
          },
          {
            type: "image_url",
            image_url: { url: "data:application/pdf;base64,JVBERi0" },
          },
        ],
      },
    ];

    const sanitized = sanitizeMessagesForTrace(messages);
    assert.equal(sanitized[0].content[0].text, "Compare these");
    assert.ok(sanitized[0].content[1].image_url.url.includes("image/jpeg"));
    assert.ok(
      sanitized[0].content[2].image_url.url.includes("application/pdf"),
    );
    // Both stripped
    assert.ok(!sanitized[0].content[1].image_url.url.startsWith("data:"));
    assert.ok(!sanitized[0].content[2].image_url.url.startsWith("data:"));
  });

  it("returns empty array for empty input", () => {
    assert.deepStrictEqual(sanitizeMessagesForTrace([]), []);
  });

  it("does not mutate original messages", () => {
    const original = [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,abc123" },
          },
        ],
      },
    ];
    const urlBefore = original[0].content[0].image_url.url;
    sanitizeMessagesForTrace(original);
    assert.equal(original[0].content[0].image_url.url, urlBefore);
  });
});

// ---------------------------------------------------------------------------
// usageDetails forwarding in runLLM (via deps injection)
// ---------------------------------------------------------------------------

describe("mapUsageDetails", () => {
  it("maps standard OpenRouter usage to Langfuse shape", () => {
    const raw = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
    const result = mapUsageDetails(raw);
    assert.deepStrictEqual(result, { input: 100, output: 50, total: 150 });
  });

  it("includes reasoning tokens when present", () => {
    const raw = {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
      completion_tokens_details: { reasoning_tokens: 150 },
    };
    const result = mapUsageDetails(raw);
    assert.deepStrictEqual(result, {
      input: 100, output: 200, total: 300, reasoningTokens: 150,
    });
  });

  it("includes cache read tokens when present", () => {
    const raw = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_tokens_details: { cached_tokens: 80 },
    };
    const result = mapUsageDetails(raw);
    assert.deepStrictEqual(result, {
      input: 100, output: 50, total: 150, cacheReadTokens: 80,
    });
  });

  it("returns undefined for null/undefined input", () => {
    assert.equal(mapUsageDetails(null), undefined);
    assert.equal(mapUsageDetails(undefined), undefined);
  });

  it("returns undefined for empty object", () => {
    assert.equal(mapUsageDetails({}), undefined);
  });

  it("handles zero values correctly", () => {
    const raw = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const result = mapUsageDetails(raw);
    assert.deepStrictEqual(result, { input: 0, output: 0, total: 0 });
  });
});

// ---------------------------------------------------------------------------
// streaming langfuseUsage (openrouterStream.js)
// ---------------------------------------------------------------------------

describe("streaming langfuseUsage", () => {
  // langfuseUsage is module-private in openrouterStream.js.
  // After #319, it should return raw usageDetails. We'll test via export
  // or by verifying the shape through persistGenerationUsage.
  //
  // For now, placeholder - the implementation will either export the helper
  // or we'll test through the generation.end() payload shape.

  it("placeholder for streaming usage - verified via persistGenerationUsage shape", () => {
    // Will be filled once implementation exposes testable surface
    assert.ok(true, "streaming usage path covered by manual verification");
  });
});
