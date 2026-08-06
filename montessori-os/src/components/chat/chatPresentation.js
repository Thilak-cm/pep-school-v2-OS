export const FOLLOW_THRESHOLD_PX = 200;

function timestampMs(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameCalendarDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function formatChatTimestamp(value, now = new Date()) {
  const milliseconds = timestampMs(value);
  if (!milliseconds) return '';

  const date = new Date(milliseconds);
  const reference = now instanceof Date ? now : new Date(now);
  const age = Math.max(0, reference.getTime() - milliseconds);
  if (age < 60_000) return 'Just now';

  const minutes = Math.floor(age / 60_000);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(age / 3_600_000);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const yesterday = new Date(reference);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameCalendarDate(date, yesterday)) return 'Yesterday';

  const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  return date.getFullYear() === reference.getFullYear()
    ? monthDay
    : `${monthDay}, ${date.getFullYear()}`;
}

export function getBottomDistance({ scrollHeight = 0, scrollTop = 0, clientHeight = 0 } = {}) {
  return Math.max(0, scrollHeight - scrollTop - clientHeight);
}

export function isNearBottom(metrics, threshold = FOLLOW_THRESHOLD_PX) {
  return getBottomDistance(metrics) <= threshold;
}

export function shouldShowAssistantActions(message) {
  return message?.role === 'assistant'
    && Boolean(message.content)
    && message.status !== 'streaming';
}

export function getComposerState({ loading = false, input = '' } = {}) {
  return {
    inputDisabled: false,
    sendDisabled: loading || !input.trim(),
    showStop: loading,
  };
}

export function safeLinkProps(href) {
  if (!href) return { href: undefined };
  let url;
  try {
    url = new URL(href, 'https://pep-os.invalid');
  } catch {
    return { href: undefined };
  }

  if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return { href: undefined };
  return { href, target: '_blank', rel: 'noopener noreferrer' };
}
