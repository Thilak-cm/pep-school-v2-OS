/**
 * Provider-neutral monitoring adapter (#229).
 *
 * Jobs and verifiers call emit() with start/success/failure events.
 * Ships with NoOpProvider; the fast-follow #268 adds HealthchecksProvider
 * without changing any job code.
 */

/**
 * No-op provider - logs and discards. Default until #268 ships.
 */
class NoOpProvider {
  // eslint-disable-next-line no-unused-vars
  async emit(event, payload) {
    // no-op
  }
}

let activeProvider = new NoOpProvider();

/**
 * Register a monitoring provider (e.g. HealthchecksProvider from #268).
 * @param {object} provider - must implement emit(event, payload)
 */
export function registerProvider(provider) {
  activeProvider = provider;
}

/**
 * Emit a monitoring event.
 * @param {"start"|"success"|"failure"} event
 * @param {object} payload - PII-free: jobKey, executionId, correlationId,
 *   status, duration, aggregate counts only.
 */
export async function emit(event, payload) {
  try {
    await activeProvider.emit(event, payload);
  } catch (err) {
    // Monitoring delivery failure is non-fatal (#229 spec decision).
    console.error(`[monitoring] ${event} delivery failed:`, err.message);
  }
}
