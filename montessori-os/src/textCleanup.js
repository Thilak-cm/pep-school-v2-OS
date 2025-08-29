// OpenAI Text Cleanup utility for refining teacher text notes
// Uses a dedicated API key if provided, otherwise falls back to speech-to-text key

const CLEANUP_API_KEY = import.meta.env.VITE_OPENAI_TEXT_CLEANUP_API_KEY || import.meta.env.VITE_OPENAI_SPEECH_TO_TEXT_API_KEY;
const CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * Clean up and refine a free-form text note using OpenAI.
 * Targets: capitalization, grammar, paragraphing, and light structure.
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
  const systemPrompt = `You are an assistant that cleans up Montessori observation notes.
Goals: fix capitalization, grammar, and punctuation; group into clear short paragraphs (1–3 sentences each);
use succinct hyphen bullets only when listing actions or next steps; keep tone neutral and observational.
Rules:
- Preserve all factual content, names, and dates; do not add or infer details.
- Sentence case capitalization; correct accidental ALL CAPS (keep acronyms like IEP, ESL).
- Ensure consistent spacing and final punctuation for sentences.
- Keep it parent- and teacher-friendly; avoid clinical jargon.
- Output plain text with line breaks (no headings, no markdown formatting beyond simple "- " bullets).
- Return only the refined note text, with clean, readable structure.`;

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
  if (!text) return '';

  // Normalize whitespace
  let out = text
    .replace(/[ \t]+/g, ' ')            // collapse spaces
    .replace(/\s*([.,;:!?])/g, '$1 ')   // spacing around punctuation
    .replace(/\s+\n/g, '\n')          // trim spaces before newlines
    .replace(/\n{3,}/g, '\n\n')       // max one blank line
    .trim();

  // Sentence-level capitalization/punctuation within each paragraph (basic heuristic)
  const punctuate = (s) => {
    return s
      .split(/([.!?]+)\s+/)
      .reduce((acc, part, idx, arr) => {
        if (!part) return acc;
        // Combine sentence + punctuation tokens
        if (idx % 2 === 0) {
          let sentence = part.trim();
          if (!sentence) return acc;
          // Capitalize first alphabetic character
          sentence = sentence.replace(/^[\s]*([a-z])/, (m, c) => c.toUpperCase());
          // If next token isn't punctuation, add period
          const next = arr[idx + 1];
          if (!next || !/[.!?]+/.test(next)) sentence += '.';
          acc.push(sentence);
        } else {
          // punctuation token already handled by the even branch
        }
        return acc;
      }, [])
      .join(' ');
  };

  out = out
    .split(/\n\n+/)
    .map((para) => {
      // Skip bullet lists from punctuation changes
      if (/^\s*[-*]\s/m.test(para)) return para.trim();
      return punctuate(para.trim());
    })
    .join('\n\n');

  return out;
}
