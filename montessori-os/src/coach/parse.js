// Coach response parser with strict sanitization and safe fallback.
// Does not depend on external libraries.

import { NUDGE_IDS, CHIPS, MICROCOPY_KEYS, MAX_NUDGES, chipsFor } from './constants';

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
  const chips = Array.isArray(n.chips)
    ? n.chips.filter((c) => allowedChips.includes(c))
    : [];
  const reason = isString(n.reason) ? n.reason : '';
  const confidence = clamp01(n.confidence);
  const microcopyKeyExpected = MICROCOPY_KEYS[id];
  const microcopy_key = n.microcopy_key === microcopyKeyExpected ? n.microcopy_key : microcopyKeyExpected;
  const append_line = isString(n.append_line) ? n.append_line : '';
  const metadata = sanitizeMetadataById(id, n.metadata);
  // Subjective must have no chips
  const finalChips = id === NUDGE_IDS.SUBJECTIVE ? [] : chips;
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
      if (seen.has(s.id)) continue; // de-dupe by id
      seen.add(s.id);
      out.push(s);
      if (out.length >= MAX_NUDGES) break;
    }
    return { nudges: out };
  } catch (e) {
    return { nudges: [] };
  }
}

// Prepare a request payload (redaction handled elsewhere in Milestone 2)
export function makeCoachRequest(noteText, context) {
  const safeText = isString(noteText) ? noteText : '';
  const ctx = isObject(context) ? context : {};
  const subject_tags = Array.isArray(ctx.subject_tags) ? ctx.subject_tags.filter(isString) : [];
  return {
    note_text: safeText,
    context: {
      student_age_band: isString(ctx.student_age_band) ? ctx.student_age_band : null,
      subject_tags,
      teacher_first_name_token: isString(ctx.teacher_first_name_token) ? ctx.teacher_first_name_token : null,
      class_name: isString(ctx.class_name) ? ctx.class_name : null,
    },
  };
}

// Simple validators (optional): check if object looks like a coach response (after parse)
export function isValidCoachResponse(obj) {
  if (!isObject(obj) || !Array.isArray(obj.nudges)) return false;
  if (obj.nudges.length > MAX_NUDGES) return false;
  for (const n of obj.nudges) {
    if (!isObject(n)) return false;
    if (!ID_VALUES.has(n.id)) return false;
    if (typeof n.confidence !== 'number') return false;
    if (n.microcopy_key !== MICROCOPY_KEYS[n.id]) return false;
    if (!Array.isArray(n.chips)) return false;
  }
  return true;
}

