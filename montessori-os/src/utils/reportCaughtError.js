export function reportCaughtError(error, scope, action, options = {}) {
  const level = options?.level === 'warn' ? 'warn' : 'error';
  const logger = typeof console !== 'undefined' && typeof console[level] === 'function'
    ? console[level].bind(console)
    : (typeof console !== 'undefined' && typeof console.error === 'function'
      ? console.error.bind(console)
      : null);

  if (!logger) return;

  const scopeLabel = scope || 'unknown-scope';
  const actionLabel = action || 'unknown-action';

  try {
    logger(`[${scopeLabel}] ${actionLabel}`, error);
  } catch {
    // Avoid throwing from logging paths.
  }
}

export default reportCaughtError;
