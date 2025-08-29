// OpenAI Text Cleanup utility for refining teacher text notes
// Uses a dedicated API key if provided, otherwise falls back to speech-to-text key

const CLEANUP_API_KEY = import.meta.env.VITE_OPENAI_TEXT_CLEANUP_API_KEY || import.meta.env.VITE_OPENAI_SPEECH_TO_TEXT_API_KEY;
const CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * Clean up and refine a free-form text note using OpenAI
 * @param {string} text Raw input text from teacher
 * @param {object} options Optional controls
 * @param {('concise'|'standard'|'detailed')} [options.tone='standard'] Output density preference
 * @returns {Promise<string>} Cleaned up note
 */
export async function cleanUpText(text, options = {}) {
  if (!CLEANUP_API_KEY) {
    throw new Error('OpenAI API key not configured. Set VITE_OPENAI_TEXT_CLEANUP_API_KEY or VITE_OPENAI_SPEECH_TO_TEXT_API_KEY');
  }

  const tone = options.tone || 'standard';

  // System prompt tailored for Montessori observation notes
  const systemPrompt = `You are an assistant helping teachers refine Montessori observation notes.
Keep all factual content and names intact. Improve grammar, clarity, and structure.
Do not invent details. Keep the teacher's observational voice and neutrality.
Prefer clear sentences; optionally use short bullet points if it reads better.
Avoid clinical jargon; keep it parent- and teacher-friendly.
Return only the refined note text, no preamble or explanation.`;

  const userPrompt = `Please clean up the following observation. Density: ${tone}.

---
${text}
---`;

  // Prefer a small, capable model for cost/speed; the server may map aliases
  const model = 'gpt-4o-mini';

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    max_tokens: 600,
  };

  const res = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLEANUP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI cleanup error: ${res.status} ${res.statusText} ${errText}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI returned no content');
  }
  return content;
}

/**
 * Lightweight heuristic fallback if API is unavailable
 * @param {string} text 
 * @returns {string}
 */
export function localCleanupFallback(text) {
  // Normalize whitespace and fix basic spacing around punctuation
  const cleaned = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*([.,;:!?])/g, '$1 ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned;
}

