/**
 * Helpers for friendly Cloud Function error messages.
 *
 * Firebase httpsCallable throws errors with a `code` property
 * (e.g. "functions/deadline-exceeded") when the client-side timeout fires
 * before the server responds.
 */

/**
 * Returns true when the error represents a client-side timeout
 * (Firebase code "functions/deadline-exceeded" OR "deadline-exceeded").
 */
export function isFunctionTimeout(error) {
  const code = String(error?.code || '');
  return code === 'functions/deadline-exceeded' || code === 'deadline-exceeded';
}

/**
 * Returns a user-friendly message for Cloud Function errors.
 * - Timeout → "This is taking longer than expected — please try again."
 * - Everything else → "Something went wrong — please try again."
 */
export function friendlyFunctionError(error) {
  if (isFunctionTimeout(error)) {
    return 'This is taking longer than expected \u2014 please try again.';
  }
  return 'Something went wrong \u2014 please try again.';
}
