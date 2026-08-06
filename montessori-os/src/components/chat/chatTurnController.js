import { createChatIds, createChatTurnPayload, streamChatTurn } from '../../services/chatStreamService.js';

const AUTH_ERROR_CODES = new Set([
  'auth/unauthenticated',
  'auth/id-token-expired',
  'auth/invalid-user-token',
  'auth/user-token-expired',
  'functions/unauthenticated',
]);

export function isTypedAuthError(error) {
  return AUTH_ERROR_CODES.has(error?.code) || error?.status === 401;
}

function abortedError() {
  const error = new Error('Chat request was cancelled.');
  error.name = 'AbortError';
  return error;
}

/**
 * Fetch a Firebase token and stream one logical turn. Authentication failures
 * happen before the backend persists the turn, so the retry keeps the stable
 * turn identifiers while using a fresh run ID for tracing and the assistant doc.
 */
export async function runAuthenticatedChatTurn({
  currentUser,
  url,
  signal,
  studentId,
  chatId,
  ids,
  message,
  onEvent,
  onRunChange = () => {},
  createRunId = () => createChatIds().runId,
  stream = streamChatTurn,
}) {
  if (!currentUser?.getIdToken) {
    const error = new Error('You must be signed in to chat.');
    error.code = 'auth/unauthenticated';
    throw error;
  }

  let attemptIds = { ...ids, chatId };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let receivedToken = false;
    try {
      const token = await currentUser.getIdToken(attempt === 1);
      if (signal.aborted) throw abortedError();

      const result = await stream({
        url,
        token,
        signal,
        payload: createChatTurnPayload({ studentId, chatId, ids: attemptIds, message }),
        onEvent: (event) => {
          if (event.event === 'token') receivedToken = true;
          onEvent?.(event, attemptIds);
        },
      });
      return { result, ids: attemptIds };
    } catch (error) {
      if (signal.aborted) throw error;
      const canRefreshAuth = attempt === 0 && !receivedToken && isTypedAuthError(error);
      if (!canRefreshAuth) throw error;

      attemptIds = { ...attemptIds, runId: createRunId() };
      onRunChange(attemptIds, { retryingAuth: true });
    }
  }

  throw new Error('Chat authentication retry failed.');
}

/**
 * Stop keeps the active request registered so its catch/finally handlers can
 * mark the placeholder interrupted. Navigation clears it to suppress stale UI.
 */
export function abortActiveChatRequest(activeRequestRef, { clear = false } = {}) {
  const activeRequest = activeRequestRef.current;
  activeRequest?.abort();
  if (clear && activeRequestRef.current === activeRequest) activeRequestRef.current = null;
  return Boolean(activeRequest);
}

export function chatErrorMessage(error) {
  if (isTypedAuthError(error)) return 'Your session expired. Please sign in again.';
  if (error?.code === 'auth/permission-denied' || error?.status === 403) {
    return 'You do not have permission to chat about this student.';
  }
  return error?.message || 'Chat request failed. Please try again.';
}
