const TRANSITIONS = {
  persisting: new Set(["running", "failed"]),
  running: new Set(["completed", "interrupted", "failed"]),
  completed: new Set(),
  interrupted: new Set(),
  failed: new Set(),
};

export function canTransitionTurn(from, to) {
  return Boolean(TRANSITIONS[from]?.has(to));
}

export function transitionTurn(turn, status, metadata = {}) {
  if (!turn || !canTransitionTurn(turn.status, status)) {
    throw new Error(`Invalid turn transition: ${turn?.status || "unknown"} -> ${status}`);
  }
  return { ...turn, ...metadata, status };
}

export const TURN_STATUSES = Object.freeze([
  "persisting",
  "running",
  "completed",
  "interrupted",
  "failed",
]);
