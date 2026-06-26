/**
 * #136: Session persistence for test bench
 *
 * Lightweight sessionStorage-backed persistence for variant state.
 * Survives in-app navigation, dies on tab close.
 * All functions accept an optional `storage` parameter for testability
 * (defaults to window.sessionStorage in browser).
 */

const PREFIX = "tb_report_";

export function buildSessionKey(programId, reportType) {
  return `${PREFIX}${programId}_${reportType}`;
}

export function saveToSession(programId, reportType, variants, sessionName, storage) {
  const store = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  if (!store) return;
  const key = buildSessionKey(programId, reportType);
  const data = {
    programId,
    reportType,
    sessionName: sessionName || "",
    variants,
    savedAt: Date.now(),
  };
  store.setItem(key, JSON.stringify(data));
}

export function loadFromSession(programId, reportType, storage) {
  const store = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  if (!store) return null;
  const key = buildSessionKey(programId, reportType);
  const raw = store.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession(programId, reportType, storage) {
  const store = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  if (!store) return;
  const key = buildSessionKey(programId, reportType);
  store.removeItem(key);
}
