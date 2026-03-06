// Text Cleanup via Cloud Function (no client-side OpenAI key)
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
import { MINI_MODEL } from '../../scripts/config/modelConstants';

/**
 * Clean up and refine a free-form text note using OpenAI.
 * Targets: capitalization, grammar, paragraphing, and light structure.
 * @param {string} text Raw input text from teacher
 * @param {object} options Optional controls
 * @param {('concise'|'standard'|'detailed')} [options.tone='standard'] Output density preference
 * @returns {Promise<string>} Cleaned up note
 */
export const CLEANUP_MODEL_INFO = { model: MINI_MODEL, temperature: 0.2, max_tokens: 1000 };

export async function cleanUpText(text, options = {}) {
  const tone = options.tone || 'standard';
  const call = httpsCallable(cloudFunctions, 'aiTextCleanup');
  const res = await call({ text, tone, forceRefresh: true });
  const cleaned = res?.data?.cleanedText;
  if (!cleaned) {
    throw new Error('Cleanup failed');
  }
  return String(cleaned);
}
