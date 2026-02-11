// Lightweight prompt provider with 5-minute TTL caching.
// Reads Firestore docs from collection `ai_prompts`.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = {
  text_summarizer: { data: null, ts: 0 },
  voice_transcriber: { data: null, ts: 0 },
};

function isFresh(ts) {
  return ts && (Date.now() - ts < TTL_MS);
}

async function fetchDoc(key) {
  try {
    const ref = doc(db, 'ai_prompts', key);
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
  } catch (e) {
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

export async function getWhisperContextPrompt({ forceRefresh = false } = {}) {
  const entry = cache.voice_transcriber;
  if (!forceRefresh && isFresh(entry.ts) && entry.data) return entry.data;
  const data = await fetchDoc('voice_transcriber');
  cache.voice_transcriber = { data, ts: Date.now() };
  return data;
}

export function forceRefreshPrompts() {
  cache.text_summarizer = { data: null, ts: 0 };
  cache.voice_transcriber = { data: null, ts: 0 };
}

export function forceRefreshKey(key) {
  if (key === 'text_summarizer') cache.text_summarizer = { data: null, ts: 0 };
  if (key === 'voice_transcriber') cache.voice_transcriber = { data: null, ts: 0 };
}

