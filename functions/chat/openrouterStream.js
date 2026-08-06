const TERMINAL_FINISH_REASONS = new Set([
  "stop",
  "length",
  "tool_calls",
  "content_filter",
  "function_call",
]);

export class ProviderStreamError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderStreamError";
    this.code = "chat/provider-stream-error";
  }
}

export async function streamOpenRouterResponse({
  fetchImpl = fetch,
  apiKey,
  endpoint,
  messages,
  model,
  temperature = 0.7,
  maxTokens = 4096,
  signal,
  onChunk,
}) {
  const result = await streamOpenRouterTurn({
    fetchImpl,
    apiKey,
    endpoint,
    messages,
    model,
    temperature,
    maxTokens,
    signal,
    onChunk,
  });
  return result.content;
}

function normalizeToolCalls(toolCallParts) {
  return [...toolCallParts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => ({
      id: tc.id,
      type: tc.type || "function",
      function: {
        name: tc.function?.name || "",
        arguments: tc.function?.arguments || "",
      },
    }))
    .filter((tc) => tc.id && tc.function.name);
}

export async function streamOpenRouterTurn({
  fetchImpl = fetch,
  apiKey,
  endpoint,
  messages,
  model,
  temperature = 0.7,
  maxTokens = 4096,
  tools = [],
  signal,
  onChunk = () => {},
}) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      ...(tools?.length ? { tools } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenRouter error: ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }
  if (!response.body?.getReader) throw new Error("OpenRouter returned no stream body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let finishReason = null;
  const toolCallParts = new Map();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          return {
            content,
            toolCalls: normalizeToolCalls(toolCallParts),
            finishReason,
          };
        }
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const choice = json?.choices?.[0] || {};
        finishReason = choice.finish_reason || finishReason;
        const delta = choice.delta || {};
        const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
        for (const part of toolCalls) {
          const index = Number.isInteger(part.index) ? part.index : toolCallParts.size;
          const existing = toolCallParts.get(index) || { function: { arguments: "" } };
          const fn = part.function || {};
          toolCallParts.set(index, {
            id: part.id || existing.id,
            type: part.type || existing.type,
            function: {
              name: fn.name || existing.function?.name || "",
              arguments: `${existing.function?.arguments || ""}${fn.arguments || ""}`,
            },
          });
        }

        const contentDelta = delta.content;
        if (typeof contentDelta === "string" && contentDelta) {
          content += contentDelta;
          onChunk(contentDelta);
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  if (!TERMINAL_FINISH_REASONS.has(finishReason)) {
    throw new ProviderStreamError(
      "OpenRouter stream ended before a terminal event was received",
    );
  }

  return {
    content,
    toolCalls: normalizeToolCalls(toolCallParts),
    finishReason,
  };
}

function parseToolArgs(rawArgs) {
  try {
    return JSON.parse(rawArgs || "{}");
  } catch {
    return {};
  }
}

function safeJsonSize(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

async function executeToolCall({ tc, toolExecutor, trace }) {
  const args = parseToolArgs(tc.function.arguments);
  const toolSpan = trace?.span({
    name: `tool-${tc.function.name}`,
    input: args,
  });
  try {
    const result = await toolExecutor(tc.function.name, args);
    toolSpan?.end({
      output: result,
      metadata: { resultSizeBytes: safeJsonSize(result) },
    });
    return { tc, args, result };
  } catch (error) {
    const result = { error: error.message || "Tool call failed" };
    toolSpan?.end({ output: result, level: "ERROR" });
    return { tc, args, result };
  }
}

/**
 * Execute one model-emitted tool batch in prerequisite layers. Calls in the
 * same layer remain concurrent, while a dependent call waits for its emitted
 * prerequisite. Results retain the model's original tool-call order.
 */
export async function executeToolCallBatch({
  toolCalls,
  toolExecutor,
  toolPrerequisites = {},
  trace,
}) {
  const pending = toolCalls.map((tc, index) => ({ tc, index }));
  const emittedNames = new Set(toolCalls.map((tc) => tc.function.name));
  const completedNames = new Set();
  const orderedResults = new Array(toolCalls.length);

  while (pending.length) {
    let ready = pending.filter(({ tc }) => (toolPrerequisites[tc.function.name] || [])
      .every((prerequisite) => !emittedNames.has(prerequisite) || completedNames.has(prerequisite)));
    // Catalog cycles should never occur, but executing the unresolved layer lets
    // the registry return its normal prerequisite error instead of deadlocking.
    if (!ready.length) ready = [...pending];

    const layerResults = await Promise.all(ready.map(({ tc }) => executeToolCall({
      tc,
      toolExecutor,
      trace,
    })));
    ready.forEach(({ tc, index }, layerIndex) => {
      orderedResults[index] = layerResults[layerIndex];
      completedNames.add(tc.function.name);
      const pendingIndex = pending.findIndex((item) => item.index === index);
      pending.splice(pendingIndex, 1);
    });
  }

  return orderedResults;
}

export async function runStreamingAgentLoop({
  fetchImpl = fetch,
  apiKey,
  endpoint,
  messages,
  model,
  temperature = 0.7,
  maxTokens = 4096,
  tools = [],
  toolExecutor,
  toolPrerequisites = {},
  signal,
  onChunk = () => {},
  onToolCalls = () => {},
  trace,
  maxIterations = 8,
}) {
  if (typeof trace?.generation !== "function") {
    throw new Error("Langfuse trace is required for chat model execution");
  }
  let content = "";
  let iterations = 0;
  const toolCallLog = [];

  while (iterations < maxIterations) {
    iterations += 1;
    const generation = trace?.generation({
      name: `chat-stream-iteration-${iterations}`,
      model,
      input: messages[messages.length - 1],
      metadata: { toolCount: tools.length, stream: true },
    });
    if (typeof generation?.end !== "function") {
      throw new Error("Langfuse generation could not be created");
    }
    let turn;
    try {
      turn = await streamOpenRouterTurn({
        fetchImpl,
        apiKey,
        endpoint,
        messages,
        model,
        temperature,
        maxTokens,
        tools,
        signal,
        onChunk: (text) => {
          content += text;
          onChunk(text);
        },
      });
    } catch (error) {
      generation.end({
        output: { error: error.message || "Model execution failed" },
        level: "ERROR",
        metadata: { streamedChars: content.length },
      });
      throw error;
    }

    if (!turn.toolCalls.length) {
      generation?.end({
        output: content,
        metadata: {
          finishReason: turn.finishReason || "stop",
          streamedChars: content.length,
        },
      });
      return { content, messages, toolCallLog, iterations, finishReason: turn.finishReason || "stop" };
    }

    const assistantMessage = {
      role: "assistant",
      content: turn.content || null,
      tool_calls: turn.toolCalls,
    };
    messages.push(assistantMessage);
    onToolCalls(turn.toolCalls.map((tc) => tc.function.name));
    generation?.end({
      output: { toolCalls: turn.toolCalls.map((tc) => tc.function.name) },
      metadata: { finishReason: turn.finishReason || "tool_calls" },
    });

    const results = await executeToolCallBatch({
      toolCalls: turn.toolCalls,
      toolExecutor,
      toolPrerequisites,
      trace,
    });

    for (const { tc, args, result } of results) {
      toolCallLog.push({ name: tc.function.name, args, result });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  const error = new Error(`Chat agent loop exceeded max iterations (${maxIterations})`);
  trace?.span?.({ name: "chat-stream-loop-error" })?.end?.({ output: error.message, level: "ERROR" });
  throw error;
}
