function newId(idFactory = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`) {
  return idFactory();
}

export function createChatIds(idFactory = undefined) {
  return {
    chatId: newId(idFactory),
    turnId: newId(idFactory),
    runId: newId(idFactory),
    userMessageId: newId(idFactory),
  };
}

export function parseSseEvents(buffer, chunk) {
  const source = `${buffer || ''}${chunk || ''}`;
  const events = [];
  let remainder = source;
  let boundary = remainder.indexOf('\n\n');
  while (boundary >= 0) {
    const block = remainder.slice(0, boundary);
    remainder = remainder.slice(boundary + 2);
    boundary = remainder.indexOf('\n\n');
    if (!block.trim()) continue;
    let event = 'message';
    const dataLines = [];
    block.split('\n').forEach((line) => {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    });
    events.push({ event, data: dataLines.join('\n') });
  }
  return { events, remainder };
}

export async function streamChatTurn({
  url,
  token,
  payload,
  signal,
  fetchImpl = fetch,
  onEvent = () => {},
}) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw new Error(`Chat request failed (${response.status})`);
  if (!response.body?.getReader) throw new Error('Chat response did not provide a stream');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let status = 'running';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const parsed = parseSseEvents(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.remainder;
      for (const event of parsed.events) {
        let data = event.data;
        try { data = JSON.parse(event.data); } catch { /* keep text payload */ }
        if (event.event === 'token' && typeof data?.text === 'string') content += data.text;
        if (event.event === 'complete' && data?.status) status = data.status;
        onEvent({ ...event, data });
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  return { content, status };
}
