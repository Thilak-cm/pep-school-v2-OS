// Explicit production tester allowlist for #220. Role checks are intentionally
// not sufficient while the chat is being rebuilt; keep this list small and UID-based.
export const CHAT_ALLOWED_UIDS = Object.freeze([
  'T1iLA2qjTqMvgS4hamw2PEtNsov1', // Thilak Mohan
  'HA1TiA1xbkRJ8n1MPaBi1PdGlo92', // Rahul Raghavan
]);

export const isChatAllowed = (uid) => Boolean(uid && CHAT_ALLOWED_UIDS.includes(uid));
