export const FOLLOW_THRESHOLD_PX = 200;

export const CHAT_SHELL_WIDTH_SX = Object.freeze({
  width: '100%',
  maxWidth: '420px',
});

export const CONVERSATION_SELECTOR_LAYER_SX = Object.freeze({
  position: 'relative',
  zIndex: 3,
});

export const TRANSCRIPT_LAYER_SX = Object.freeze({
  position: 'relative',
  zIndex: 0,
});

export const SCROLL_TO_BOTTOM_FAB_LAYER_SX = Object.freeze({
  position: 'absolute',
  zIndex: 2,
});

function normalizeInset(value) {
  return typeof value === 'number' ? Math.max(0, value) : value;
}

function addInsets(...values) {
  const normalized = values.map(normalizeInset);
  if (normalized.every((value) => typeof value === 'number')) {
    return normalized.reduce((total, value) => total + value, 0);
  }
  return `calc(${normalized.map((value) => (
    typeof value === 'number' ? `${value}px` : value
  )).join(' + ')})`;
}

/**
 * Defines the fixed chat shell's vertical contract. Numeric inputs expose the
 * exact viewport boundaries to tests, while CSS env() inputs let production
 * react to device safe-area changes without measuring layout in JavaScript.
 */
export function getChatShellGeometry({
  viewportHeight,
  headerHeight,
  headerBottomPadding,
  footerHeight,
  safeAreaTop = 0,
  safeAreaBottom = 0,
  keyboardOpen = false,
  keyboardBottomOffset = 0,
}) {
  const topInset = addInsets(headerHeight, safeAreaTop, headerBottomPadding);
  const bottomInset = keyboardOpen
    ? normalizeInset(keyboardBottomOffset)
    : addInsets(footerHeight, safeAreaBottom);
  const hasNumericViewport = typeof viewportHeight === 'number'
    && typeof topInset === 'number'
    && typeof bottomInset === 'number';

  return {
    topInset,
    bottomInset,
    bottomEdge: hasNumericViewport ? Math.max(topInset, viewportHeight - bottomInset) : undefined,
    height: hasNumericViewport ? Math.max(0, viewportHeight - topInset - bottomInset) : undefined,
  };
}

export function getBubbleAnimationSx(animate = false) {
  return {
    animation: animate ? 'chatBubbleEnter 180ms ease-out both' : 'none',
    '@keyframes chatBubbleEnter': {
      from: { opacity: 0, transform: 'translateY(6px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    '@media (prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  };
}

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

export function createFollowModeState() {
  return {
    enabled: true,
    initialScrollPending: false,
    programmaticScrollPending: false,
  };
}

export function resetFollowMode(state, { initialScrollPending = false } = {}) {
  state.enabled = true;
  state.initialScrollPending = initialScrollPending;
  state.programmaticScrollPending = false;
}

export function enableFollowMode(state) {
  state.enabled = true;
}

export function beginProgrammaticScroll(state) {
  state.enabled = true;
  state.programmaticScrollPending = true;
}

export function interruptProgrammaticScroll(state, metrics, threshold = FOLLOW_THRESHOLD_PX) {
  state.programmaticScrollPending = false;
  state.enabled = isNearBottom(metrics, threshold);
  return state.enabled;
}

export function consumeFollowModeGrowth(state) {
  const shouldScroll = state.initialScrollPending || state.enabled;
  // Initial positioning is a one-shot request; subsequent growth follows only
  // while the teacher has not deliberately scrolled away from the bottom.
  state.initialScrollPending = false;
  return shouldScroll;
}

export function updateFollowModeFromScroll(state, metrics, threshold = FOLLOW_THRESHOLD_PX) {
  const nearBottom = isNearBottom(metrics, threshold);

  // A smooth FAB scroll emits intermediate events far from the bottom. Those
  // events are animation progress, not evidence that the teacher scrolled away.
  if (state.programmaticScrollPending) {
    state.enabled = true;
    if (nearBottom) state.programmaticScrollPending = false;
    return nearBottom;
  }

  state.enabled = nearBottom;
  return nearBottom;
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
