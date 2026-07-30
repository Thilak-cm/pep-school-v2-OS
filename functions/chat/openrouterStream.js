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
  signal,
  onChunk = () => {},
  onToolCalls = () => {},
  maxIterations = 8,
}) {
  let content = "";
  let iterations = 0;
  const toolCallLog = [];

  while (iterations < maxIterations) {
    iterations += 1;
    const turn = await streamOpenRouterTurn({
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

    if (!turn.toolCalls.length) {
      return { content, messages, toolCallLog, iterations, finishReason: turn.finishReason || "stop" };
    }

    const assistantMessage = {
      role: "assistant",
      content: turn.content || null,
      tool_calls: turn.toolCalls,
    };
    messages.push(assistantMessage);
    onToolCalls(turn.toolCalls.map((tc) => tc.function.name));

    const results = await Promise.all(turn.toolCalls.map(async (tc) => {
      const args = parseToolArgs(tc.function.arguments);
      try {
        const result = await toolExecutor(tc.function.name, args);
        return { tc, args, result };
      } catch (error) {
        return { tc, args, result: { error: error.message || "Tool call failed" } };
      }
    }));

    for (const { tc, args, result } of results) {
      toolCallLog.push({ name: tc.function.name, args, result });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error(`Chat agent loop exceeded max iterations (${maxIterations})`);
}
