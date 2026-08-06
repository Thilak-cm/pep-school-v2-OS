export const stripQuotes = (text) => text ? text.replace(/^["']|["']$/g, '') : text;

function messageTime(message) {
  const value = message?.createdAt || message?.timestamp || 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Keep each assistant attempt after the user message that created its logical
 * turn, even while optimistic and Firestore timestamps temporarily disagree.
 * Attempts whose timestamps are already later keep their natural position, so
 * an interrupted attempt and a much-later retry are not forced into one block.
 */
export function sortMessagesForDisplay(messages) {
  const userByTurn = new Map();

  messages.forEach((message) => {
    if (!message?.turnId || message.role !== 'user') return;
    const current = userByTurn.get(message.turnId);
    if (!current) {
      userByTurn.set(message.turnId, message);
      return;
    }
    const delta = messageTime(message) - messageTime(current);
    if (delta < 0 || (delta === 0 && String(message.id).localeCompare(String(current.id)) < 0)) {
      userByTurn.set(message.turnId, message);
    }
  });

  return messages.map((message, index) => {
    const time = messageTime(message);
    const turnUser = message.role === 'assistant' && message.turnId
      ? userByTurn.get(message.turnId)
      : null;
    const userTime = turnUser ? messageTime(turnUser) : 0;
    const pinnedToUser = Boolean(turnUser) && time <= userTime;

    return {
      message,
      time,
      effectiveTime: pinnedToUser ? userTime : time,
      // Sharing the user's tie key makes the role precedence transitive even
      // when unrelated messages have the same timestamp.
      tieKey: pinnedToUser ? String(turnUser.id) : String(message.id),
      turnPrecedence: pinnedToUser ? 1 : 0,
      index,
    };
  }).sort((left, right) => {
    const timeDelta = left.effectiveTime - right.effectiveTime;
    if (timeDelta) return timeDelta;
    const keyDelta = left.tieKey.localeCompare(right.tieKey);
    if (keyDelta) return keyDelta;
    const precedenceDelta = left.turnPrecedence - right.turnPrecedence;
    if (precedenceDelta) return precedenceDelta;
    const originalTimeDelta = left.time - right.time;
    if (originalTimeDelta) return originalTimeDelta;
    if (left.turnPrecedence && right.turnPrecedence) return left.index - right.index;
    return String(left.message.id).localeCompare(String(right.message.id));
  }).map(({ message }) => message);
}

/**
 * Firestore snapshots do not contain the local streaming placeholder until the
 * server persists the assistant message. Merge by ID so snapshot refreshes do
 * not erase progressively rendered tokens. The authoritative document wins as
 * soon as it appears.
 */
export function mergeMessageSnapshot(previous, incoming, retainedIds = new Set()) {
  const incomingIds = new Set(incoming.map((message) => message.id));
  const merged = new Map();

  previous.forEach((message) => {
    if (incomingIds.has(message.id) || retainedIds.has(message.id)) merged.set(message.id, message);
  });
  incoming.forEach((message) => merged.set(message.id, { ...(merged.get(message.id) || {}), ...message }));

  return sortMessagesForDisplay([...merged.values()]);
}
