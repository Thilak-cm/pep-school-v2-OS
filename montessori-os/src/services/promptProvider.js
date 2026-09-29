// Lightweight prompt provider with 5-minute TTL caching.
// Reads Firestore docs from collection `config`.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

// voice_transcriber entry removed in #304: the Whisper context prompt was
// deleted end-to-end (it caused hallucination echo on silent audio).
const cache = {
  text_summarizer: { data: null, ts: 0 },
};

function isFresh(ts) {
  return ts && (Date.now() - ts < TTL_MS);
}

async function fetchDoc(key) {
  try {
    const ref = doc(db, 'config', key);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return {
      key,
      title: data.title || '',
      description: data.description || '',
      systemPrompt: data.systemPrompt || '',
      userPrompt: data.userPrompt || '',
      contextPrompt: data.contextPrompt || '',
      version: data.version || 1,
    };
  } catch (_e) {
    return null;
  }
}

export async function getTextSummarizerPrompts({ forceRefresh = false } = {}) {
  const entry = cache.text_summarizer;
  if (!forceRefresh && isFresh(entry.ts) && entry.data) return entry.data;
  const data = await fetchDoc('text_summarizer');
  cache.text_summarizer = { data, ts: Date.now() };
  return data;
}

export function forceRefreshPrompts() {
  cache.text_summarizer = { data: null, ts: 0 };
}

export function forceRefreshKey(key) {
  if (key === 'text_summarizer') cache.text_summarizer = { data: null, ts: 0 };
}

