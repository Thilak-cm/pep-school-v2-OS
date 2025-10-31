// Coach response parser and request builder (contract layer between UI and backend)
import { NUDGE_IDS, CHIPS, MICROCOPY_KEYS, chipsFor } from './constants.js';

const ID_VALUES = new Set(Object.values(NUDGE_IDS));

function clamp01(x) {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

function isString(x) { return typeof x === 'string'; }
function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }

function sanitizeMetadataById(id, metadata) {
  const out = {};
  if (!isObject(metadata)) return out;
  switch (id) {
    case NUDGE_IDS.DURATION: {
      const v = metadata.duration_range;
      if (CHIPS[NUDGE_IDS.DURATION].includes(v)) out.duration_range = v;
      break;
    }
    case NUDGE_IDS.MODALITY: {
      const v = metadata.modality;
      if (CHIPS[NUDGE_IDS.MODALITY].includes(v)) out.modality = v;
      break;
    }
    case NUDGE_IDS.INDEPENDENCE: {
      const v = metadata.independence;
      if (CHIPS[NUDGE_IDS.INDEPENDENCE].includes(v)) out.independence = v;
      break;
    }
    case NUDGE_IDS.EVIDENCE: {
      if (Number.isInteger(metadata.evidence_attempts) && metadata.evidence_attempts >= 0) {
        out.evidence_attempts = metadata.evidence_attempts;
      }
      if (Number.isInteger(metadata.evidence_correct) && metadata.evidence_correct >= 0) {
        out.evidence_correct = metadata.evidence_correct;
      }
      if (isString(metadata.evidence_quote)) {
        out.evidence_quote = metadata.evidence_quote;
      }
      break;
    }
    case NUDGE_IDS.SUBJECTIVE: {
      if (isString(metadata.objective_line)) out.objective_line = metadata.objective_line;
      break;
    }
  }
  return out;
}

function sanitizeNudge(n) {
  if (!isObject(n)) return null;
  const id = isString(n.id) && ID_VALUES.has(n.id) ? n.id : null;
  if (!id) return null;
  const allowedChips = chipsFor(id);
  // Minimal GPT output only includes id, reason, confidence. Enrich locally.
  const reason = isString(n.reason) ? n.reason : '';
  const confidence = clamp01(n.confidence);
  const microcopy_key = MICROCOPY_KEYS[id];
  const append_line = '';
  const metadata = {}; // no model-provided metadata; selections populate later
  const finalChips = id === NUDGE_IDS.SUBJECTIVE ? [] : allowedChips;
  return { id, reason, confidence, microcopy_key, chips: finalChips, append_line, metadata };
}

export function parseCoachResponse(raw) {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!isObject(obj)) return { nudges: [] };
    const nudges = Array.isArray(obj.nudges) ? obj.nudges : [];
    const seen = new Set();
    const out = [];
    for (const item of nudges) {
      const s = sanitizeNudge(item);
      if (!s) continue;
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return { nudges: out };
  } catch (_) {
    return { nudges: [] };
  }
}

export function makeCoachRequest(noteText, context = {}) {
  const safeText = isString(noteText) ? noteText : '';
  const payload = { noteText: safeText };
  const programId = isString(context.programId) ? context.programId.trim() : '';
  if (programId) payload.programId = programId;
  if (Array.isArray(context.programIds) && context.programIds.length > 0) {
    payload.programIds = context.programIds.filter(isString).map((s) => s.trim()).filter(Boolean);
  }
  return payload;
}

export function isValidCoachResponse(obj) {
  if (!isObject(obj) || !Array.isArray(obj.nudges)) return false;
  for (const n of obj.nudges) {
    if (!isObject(n)) return false;
    if (!ID_VALUES.has(n.id)) return false;
    if (typeof n.confidence !== 'number') return false;
    if (!isString(n.reason)) return false;
  }
  return true;
}
