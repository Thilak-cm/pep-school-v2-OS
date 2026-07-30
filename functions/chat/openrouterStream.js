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
        if (payload === "[DONE]") return content;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          content += delta;
          onChunk(delta);
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  return content;
}
