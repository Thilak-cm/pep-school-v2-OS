function newId(idFactory = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`) {
  return idFactory();
}

export class ChatStreamError extends Error {
  constructor(message, { code = 'chat/stream-failed', status = null, details = null } = {}) {
    super(message);
    this.name = 'ChatStreamError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function createChatIds(idFactory = undefined) {
  return {
    chatId: newId(idFactory),
    turnId: newId(idFactory),
    runId: newId(idFactory),
    userMessageId: newId(idFactory),
  };
}

export function createChatTurnPayload({ studentId, chatId, ids, message, clientTurnId }) {
  return {
    studentId,
    ...ids,
    chatId,
    message,
    ...(clientTurnId ? { clientTurnId } : {}),
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
  telemetry,
}) {
  telemetry?.mark?.('requestStarted');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  telemetry?.mark?.('responseHeaders');
  if (!response.ok) {
    let details = null;
    try {
      details = await response.json();
    } catch {
      // Some infrastructure-generated HTTP failures are plain text.
    }
    const code = details?.code || (response.status === 401 ? 'auth/unauthenticated' : 'chat/http-error');
    throw new ChatStreamError(details?.error || `Chat request failed (${response.status})`, {
      code,
      status: response.status,
      details,
    });
  }
  if (!response.body?.getReader) {
    throw new ChatStreamError('Chat response did not provide a stream', { code: 'chat/missing-stream' });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let status = 'running';
  let terminalEvent = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      telemetry?.addResponseBytes?.(value?.byteLength || 0);
      const parsed = parseSseEvents(buffer, decoder.decode(value, { stream: true }));
      buffer = parsed.remainder;
      for (const event of parsed.events) {
        let data = event.data;
        try { data = JSON.parse(event.data); } catch { /* keep text payload */ }
        const parsedEvent = { ...event, data };
        telemetry?.recordSseEvent?.(parsedEvent);
        onEvent(parsedEvent);
        if (event.event === 'token' && typeof data?.text === 'string') content += data.text;
        if (event.event === 'error') {
          throw new ChatStreamError(data?.error || 'Chat request failed', {
            code: data?.code || 'chat/server-error',
            status: data?.status || null,
            details: data,
          });
        }
        if (event.event === 'complete') {
          terminalEvent = event;
          status = data?.status || 'complete';
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  if (!terminalEvent) {
    throw new ChatStreamError('Chat stream ended before completion', {
      code: 'chat/incomplete-stream',
      details: { content, status },
    });
  }
  return { content, status };
}
