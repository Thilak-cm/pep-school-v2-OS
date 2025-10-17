/*
 Seed initial AI prompts into Firestore using firebase-admin.

 Usage:
   node scripts/seed_ai_prompts.mjs /path/to/serviceAccount.json "project-id"

 Notes:
 - Reads current hardcoded prompts from source code comments below.
 - Idempotent: will create docs if missing, or update safely if --force is added later.
*/

import fs from 'fs';
import path from 'path';
import process from 'process';
import admin from 'firebase-admin';

const [,, saPath, projectId] = process.argv;
if (!saPath || !projectId) {
  console.error('Usage: node scripts/seed_ai_prompts.mjs <serviceAccount.json> <projectId>');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(saPath), 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId,
});

const db = admin.firestore();

// Fallback prompts as of initial seeding
const TEXT_SYSTEM = `You are an assistant that cleans up Montessori observation notes.
Goals: fix capitalization, grammar, and punctuation; group into clear short paragraphs (1–3 sentences each);
use succinct hyphen bullets only when listing actions or next steps; keep tone neutral and observational.
Rules:
- Preserve all factual content, names, and dates; do not add or infer details.
- Sentence case capitalization; correct accidental ALL CAPS (keep acronyms like IEP, ESL).
- Ensure consistent spacing and final punctuation for sentences.
- Keep it parent- and teacher-friendly; avoid clinical jargon.
- Output plain text with line breaks (no headings, no markdown formatting beyond simple "- " bullets).
- Return only the refined note text, with clean, readable structure.`;

const TEXT_USER = `Please clean up the following observation. Density: ${'${tone}'}.

---
${'${text}'}
---`;

const VOICE_CONTEXT = `This is a Montessori teacher recording educational observations about student learning and development. Content includes Montessori methodology, curriculum areas, student names, developmental milestones, and classroom activities.`;

async function upsertDoc(ref, data) {
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      ...data,
      version: 1,
      versions: [],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: { seed: true },
    });
    console.log('Created', ref.path);
  } else {
    // Leave existing content; only fill in missing base fields
    const curr = snap.data() || {};
    const patch = {};
    for (const k of Object.keys(data)) {
      if (!curr[k]) patch[k] = data[k];
    }
    if (Object.keys(patch).length > 0) {
      await ref.set(patch, { merge: true });
      console.log('Updated', ref.path, 'with missing fields');
    } else {
      console.log('Skipped', ref.path, '(already seeded)');
    }
  }
}

async function main() {
  const textRef = db.collection('ai_prompts').doc('text_summarizer');
  await upsertDoc(textRef, {
    title: 'Text Cleanup (Observation Notes)',
    description: 'Prompts used to clean up observation notes via AI.',
    systemPrompt: TEXT_SYSTEM,
    userPrompt: TEXT_USER,
  });

  const voiceRef = db.collection('ai_prompts').doc('voice_transcriber');
  await upsertDoc(voiceRef, {
    title: 'Voice Transcriber Context',
    description: 'Context string provided to the STT engine to bias educational content.',
    contextPrompt: VOICE_CONTEXT,
  });
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

