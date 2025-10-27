/*
  Tiny script to update the Firestore coach prompt components.

  Usage:
    - Ensure GOOGLE_APPLICATION_CREDENTIALS is set to a service account JSON with Firestore access
    - Optionally pass --project your-project-id
    - Run: node scripts/pushCoachPrompt.js [--project your-project-id]

  Behavior:
    - Updates only introLines, howToLines, and finalPrompt on ai_prompts/coach (merge: true)
    - Leaves enabled/disabled/effective order untouched
    - Fills in nudgeBlocks/examples only if missing (does not overwrite existing)
*/

const admin = require('firebase-admin');

function getArg(flag) {
  const p = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return p ? p.split('=')[1] : null;
}

const projectId = getArg('project') || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
}

// Import shared examples - single source of truth
const DEFAULT_EXAMPLES = require('./coach-examples.js');

const db = admin.firestore();

const ALL_NUDGES = ['duration', 'modality', 'independence', 'evidence', 'subjective'];
const DEFAULT_PRIORITY = ['duration', 'modality', 'independence', 'evidence', 'subjective'];

const NEW_INTRO = [
  'You are Coach Pepper, a Montessori observation coach that inspects one teacher note and identifies objective information gaps.',
  'Do not rewrite or rate the text — only detect clear gaps that would improve completeness and objectivity.',
];

const NEW_HOWTO = [
  '1. Read the note carefully.',
  '2. Consider each allowed nudge id independently; include at most one entry per id when relevant.',
  '3. Include all relevant nudges that apply; there is no hard limit. If none apply confidently, return an empty array.',
  '4. Use only the allowed ids listed below. Output strict JSON with top-level { "nudges": [...] } and nothing else.',
  '5. Keep reasons short, specific, and objective (1–2 short lines). If unsure, omit that id.',
  '6. Each nudge must include exactly: id, reason, confidence.',
];

const DEFAULT_BLOCKS = {
  duration: { lines: [
    '- duration → Activity or work is described, but no time range (e.g. "5–10 min") appears.',
    '  Trigger if the note implies action or work but has no duration tokens (min, minutes, m, hour, etc.).',
  ]},
  modality: { lines: [
    '- modality → Math or material-based work is mentioned (add, subtract, number rods, bead frame, golden beads, etc.)',
    '  but the method (Material / Pen & paper / Mental) is not specified.',
  ]},
  independence: { lines: [
    '- independence → The note mentions the child doing something',
    '  but does not state whether it was independent, in a group, or with help (independent, peer, teacher-guided, with help, etc. missing).',
  ]},
  evidence: { lines: [
    '- evidence → The note makes a claim of success or struggle (understood, did well, grasped, struggled, identified)',
    '  but gives no supporting detail such as a number or short quote.',
  ]},
  subjective: { lines: [
    '- subjective → The note uses emotional or judgmental adjectives (happy, sad, lazy, always, never, good, bad)',
    '  without an objective observation line to balance it.',
  ]},
};

// DEFAULT_EXAMPLES is imported from ./coach-examples.js above

function composeFinalPrompt(doc, enabled) {
  const set = new Set(enabled || []);
  const blocks = (doc && doc.nudgeBlocks) || {};
  const priority = Array.isArray(doc?.priorityOrder) && doc.priorityOrder.length ? doc.priorityOrder : DEFAULT_PRIORITY;
  const effective = priority.filter((id) => set.has(id) && blocks[id] && Array.isArray(blocks[id].lines) && blocks[id].lines.length);
  const allow = (effective.length ? effective : ALL_NUDGES).join(' | ');
  const lines = [];
  if (Array.isArray(doc?.introLines)) lines.push(...doc.introLines);
  lines.push('');
  lines.push('How to respond');
  if (Array.isArray(doc?.howToLines)) lines.push(...doc.howToLines);
  lines.push('Each nudge must include exactly: id, reason, confidence.');
  lines.push(`Allowed ids: ${allow}.`);
  if (effective.length) lines.push(`Prioritize in this order: ${effective.join(' → ')}.`);
  lines.push('');
  lines.push('Nudge types and triggers');
  for (const id of (effective.length ? effective : ALL_NUDGES)) {
    const block = blocks[id] || DEFAULT_BLOCKS[id];
    for (const s of (block?.lines || [])) lines.push(String(s));
    lines.push('');
  }
  // Pick examples from enabled nudges, similar to nudgeBlocks
  const examplesToShow = (effective.length ? effective : ALL_NUDGES).slice(0, 2);
  for (let i = 0; i < examplesToShow.length; i++) {
    const id = examplesToShow[i];
    const exampleData = doc?.examples?.[id] || DEFAULT_EXAMPLES[id];
    if (!exampleData) continue;
    
    const exampleText = exampleData.exampleText || 'STUDENT_A used number rods today.';
    const reason = exampleData.reason || 'Relevant missing element.';
    const conf = i === 0 ? 0.86 : 0.62;
    
    if (i === 0) {
      lines.push('Examples');
    }
    lines.push('');
    lines.push(`Example ${i + 1} (${id})`);
    lines.push('INPUT:');
    lines.push(JSON.stringify({ note_text: exampleText }));
    lines.push('OUTPUT:');
    lines.push(JSON.stringify({ nudges: [{ id, reason, confidence: conf }] }, null, 2));
  }
  return { text: lines.join('\n'), allowList: allow, order: effective, effectiveEnabled: effective };
}

(async () => {
  const ref = db.collection('ai_prompts').doc('coach');
  const snap = await ref.get();
  const curr = snap.exists ? (snap.data() || {}) : {};

  // Merge-in blocks/examples only if missing
  const nudgeBlocks = { ...(curr.nudgeBlocks || {}) };
  for (const id of ALL_NUDGES) {
    if (!nudgeBlocks[id] || !Array.isArray(nudgeBlocks[id].lines) || nudgeBlocks[id].lines.length === 0) {
      nudgeBlocks[id] = DEFAULT_BLOCKS[id];
    }
  }
  
  // Merge examples with nudge IDs as keys
  const examples = { ...(curr.examples || {}) };
  for (const id of ALL_NUDGES) {
    if (!examples[id] || !examples[id].exampleText || !examples[id].reason) {
      examples[id] = DEFAULT_EXAMPLES[id];
    }
  }

  const enabled = Array.isArray(curr.enabledNudges) && curr.enabledNudges.length
    ? curr.enabledNudges.filter((x) => ALL_NUDGES.includes(x))
    : ALL_NUDGES.slice();

  const updateDoc = {
    introLines: NEW_INTRO,
    howToLines: NEW_HOWTO,
    // Only set if previously missing/empty to avoid overriding admin customizations
    nudgeBlocks,
    examples,
  };

  // Compose final prompt from modular parts
  const composed = composeFinalPrompt({
    introLines: NEW_INTRO,
    howToLines: NEW_HOWTO,
    nudgeBlocks,
    examples,
    priorityOrder: Array.isArray(curr.priorityOrder) && curr.priorityOrder.length ? curr.priorityOrder : DEFAULT_PRIORITY,
  }, enabled);

  // Always update finalPrompt to match new instructions
  updateDoc.finalPrompt = composed.text;
  updateDoc.updatedAt = admin.firestore.FieldValue.serverTimestamp();

  await ref.set(updateDoc, { merge: true });
  console.log('Updated ai_prompts/coach with new intro/howTo and finalPrompt');
  console.log('- Allowed ids:', composed.allowList);
  console.log('- Order:', composed.order.join(' → ') || '(none)');
  process.exit(0);
})().catch((err) => {
  console.error('Failed to update coach prompt', err);
  process.exit(1);
});

