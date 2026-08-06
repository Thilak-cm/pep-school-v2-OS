import { sortMessagesForDisplay } from './chatUtils.js';

const RETRYABLE_STATUSES = new Set(['failed', 'interrupted']);

export function getOptimisticEntryMessageIds(ids, isRetry = false) {
  const assistantMessageId = `${ids.runId}-assistant`;
  return isRetry ? [assistantMessageId] : [ids.userMessageId, assistantMessageId];
}

export function createMessageAnimationState() {
  return { entryMessageIds: new Set() };
}

export function resetMessageAnimationState(state) {
  state.entryMessageIds.clear();
}

export function registerOptimisticEntryAnimations(state, ids, isRetry = false) {
  const messageIds = getOptimisticEntryMessageIds(ids, isRetry);
  messageIds.forEach((messageId) => state.entryMessageIds.add(messageId));
  return messageIds;
}

export function registerAssistantAttemptAnimation(state, messageId) {
  if (messageId) state.entryMessageIds.add(messageId);
}

export function shouldAnimateMessage(state, messageId) {
  return state.entryMessageIds.has(messageId);
}

export function appendOptimisticTurn(messages, {
  ids,
  message,
  authorId,
  authorName = null,
  createdAt,
  isRetry = false,
}) {
  const retry = {
    chatId: ids.chatId,
    turnId: ids.turnId,
    userMessageId: ids.userMessageId,
  };
  return sortMessagesForDisplay([
    ...messages,
    ...(!isRetry ? [{
      id: ids.userMessageId,
      turnId: ids.turnId,
      role: 'user',
      content: message,
      authorId,
      authorName,
      createdAt,
      status: 'complete',
    }] : []),
    {
      id: `${ids.runId}-assistant`,
      turnId: ids.turnId,
      runId: ids.runId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      retry,
      createdAt: new Date(createdAt.getTime() + 1),
    },
  ]);
}

export function applyChatStreamEvent(messages, event, eventIds, userMessageId) {
  const assistantMessageId = `${eventIds.runId}-assistant`;
  if (event.event === 'started') {
    return messages.map((item) => item.id === userMessageId
      ? { ...item, status: 'complete' }
      : item);
  }
  if (event.event === 'token' && typeof event.data?.text === 'string') {
    return messages.map((item) => item.id === assistantMessageId && item.status === 'streaming'
      ? { ...item, content: `${item.content}${event.data.text}` }
      : item);
  }
  if (event.event === 'complete') {
    return messages.map((item) => item.id === assistantMessageId
      ? { ...item, status: event.data?.status || 'complete' }
      : item);
  }
  return messages;
}

/**
 * Failed pre-token attempts have no assistant transcript document. Reconcile
 * their durable turn state onto the matching user message so a reload can
 * still render an inline retry without inventing an empty assistant bubble.
 */
export function reconcileMessagesWithTurns(
  messages,
  turns,
  chatId,
  persistedMessageIds = new Set(messages.map((message) => message.id)),
) {
  let reconciled = messages.map((message) => {
    if (!message.turnRetry) return message;
    const { turnRetry: _turnRetry, ...withoutTurnRetry } = message;
    return withoutTurnRetry;
  });

  turns.forEach((turn) => {
    if (!RETRYABLE_STATUSES.has(turn.status) || !turn.id || !turn.userMessageId) return;
    const assistantMessageId = turn.assistantMessageId || `${turn.runId}-assistant`;
    const assistant = reconciled.find((message) => message.id === assistantMessageId
      && message.role === 'assistant');
    if (persistedMessageIds.has(assistantMessageId)) return;

    if (assistant?.content) {
      reconciled = reconciled.map((message) => message.id === assistantMessageId ? {
        ...message,
        status: turn.status,
        retry: {
          chatId,
          turnId: turn.id,
          userMessageId: turn.userMessageId,
        },
      } : message);
      return;
    }

    reconciled = reconciled
      .filter((message) => message.id !== assistantMessageId)
      .map((message) => message.id === turn.userMessageId && message.role === 'user' ? {
        ...message,
        turnRetry: {
          chatId,
          turnId: turn.id,
          userMessageId: turn.userMessageId,
          runId: turn.runId,
          assistantMessageId,
          status: turn.status,
        },
      } : message);
  });

  return sortMessagesForDisplay(reconciled);
}

export function buildRetryRequest({ messages, assistantMessage, chatId, runId }) {
  if (!assistantMessage) return null;
  const isAssistantRetry = assistantMessage.role === 'assistant'
    && RETRYABLE_STATUSES.has(assistantMessage.status);
  const isTurnRetry = assistantMessage.role === 'user'
    && RETRYABLE_STATUSES.has(assistantMessage.turnRetry?.status);
  if (!isAssistantRetry && !isTurnRetry) return null;
  const retry = isTurnRetry ? assistantMessage.turnRetry : assistantMessage.retry;
  if (!retry?.chatId || retry.chatId !== chatId || !retry.turnId || !retry.userMessageId) return null;
  if (isAssistantRetry) {
    const attempts = messages.filter((message) => message.role === 'assistant'
      && message.turnId === retry.turnId);
    if (attempts.at(-1)?.id !== assistantMessage.id) return null;
  } else if (messages.some((message) => message.role === 'assistant'
    && message.id === retry.assistantMessageId)) {
    return null;
  }
  const userMessage = messages.find((message) => message.id === retry.userMessageId
    && message.role === 'user');
  if (!userMessage?.content) return null;
  return {
    ids: {
      chatId,
      turnId: retry.turnId,
      userMessageId: retry.userMessageId,
      runId,
    },
    message: userMessage.content,
  };
}
