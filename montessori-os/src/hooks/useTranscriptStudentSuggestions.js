import { useMemo } from 'react';
import Fuse from 'fuse.js';

// Extract likely student matches from a transcript using fuzzy matching.
export default function useTranscriptStudentSuggestions(transcript, students) {
  return useMemo(() => {
    if (!transcript || !Array.isArray(students) || students.length === 0) return [];

    // Bias toward tighter matches; 0.25 keeps obvious misspellings while avoiding loose noise.
    const THRESHOLD = 0.25;
    const fuse = new Fuse(students, {
      includeScore: true,
      threshold: THRESHOLD,
      distance: 40,
      // Only match against first names to reduce false positives from partial last names.
      keys: [{ name: 'firstName', weight: 1 }],
      useExtendedSearch: false,
    });

    const tokens = String(transcript)
      .split(/[\s,.;:!?()\[\]{}<>"]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1);

    const bestById = new Map();

    tokens.forEach((token) => {
      const results = fuse.search(token);
      results.forEach((res) => {
        // Only keep results under the threshold to avoid noisy matches.
        if (typeof res.score !== 'number' || res.score > THRESHOLD) return;
        const prev = bestById.get(res.item.id);
        if (!prev || res.score < prev.score) {
          bestById.set(res.item.id, { ...res.item, score: res.score });
        }
      });
    });

    const sorted = Array.from(bestById.values()).sort((a, b) => a.score - b.score);
    // Keep the top 3 strongest matches to avoid flooding the UI.
    return sorted.slice(0, 3);
  }, [transcript, students]);
}
