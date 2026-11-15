// #331 - Typesense full-text search hook for observations

import { useState, useEffect, useRef, useCallback } from 'react';

const TYPESENSE_COLLECTION = 'observations';
const DEBOUNCE_MS = 300;
const KEY_TTL_BUFFER_MS = 60_000; // re-mint 1 min before expiry

/**
 * Build a Typesense filter_by string from committedFilters.
 * Returns '' for null/empty filters (browse mode).
 */
export function buildTypesenseFilterBy(committedFilters) {
  if (!committedFilters) return '';

  const parts = [];

  if (committedFilters.types?.length) {
    parts.push(`type:[${committedFilters.types.join(',')}]`);
  }

  if (committedFilters.authors?.length) {
    // authors may be objects (with .id) or plain uid strings
    const ids = committedFilters.authors.map((a) => (typeof a === 'object' ? a.id : a));
    parts.push(`createdBy:[${ids.join(',')}]`);
  }

  if (committedFilters.dateFrom) {
    const ts = Math.floor(new Date(committedFilters.dateFrom).getTime() / 1000);
    parts.push(`observedAt:>=${ts}`);
  }

  if (committedFilters.dateTo) {
    // End of day for dateTo
    const d = new Date(committedFilters.dateTo);
    d.setHours(23, 59, 59, 999);
    const ts = Math.floor(d.getTime() / 1000);
    parts.push(`observedAt:<=${ts}`);
  }

  return parts.join(' && ');
}

/**
 * Normalize a Typesense search hit into an observation-shaped object
 * with an optional highlightSnippet.
 */
export function normalizeTypesenseHit(hit) {
  const doc = hit.document || {};
  const highlights = hit.highlights || [];

  const result = { ...doc };

  if (highlights.length > 0 && highlights[0].snippet) {
    result.highlightSnippet = highlights[0].snippet;
  }

  return result;
}

/**
 * React hook: owns Typesense client, debounce, key fetch/cache, query,
 * and highlight extraction.
 *
 * @param {Object} opts
 * @param {string} opts.query - search query string
 * @param {string} [opts.classroomId] - scope to classroom
 * @param {string} [opts.studentId] - scope to student
 * @param {Object} [opts.committedFilters] - FilterPanel committed filters
 * @returns {{ results: Array, loading: boolean, error: string|null, searchActive: boolean }}
 */
export function useTypesenseSearch({ query, classroomId, studentId, committedFilters } = {}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Scoped API key cache (memory-only, re-mint on TTL expiry)
  const keyRef = useRef({ key: null, expiresAt: 0 });
  const clientRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(0); // monotonic counter to discard stale responses

  const searchActive = Boolean(query?.trim());

  // Lazy-loaded Firebase/Typesense refs - avoids module-level firebase init
  // that breaks Node test runner (no VITE env vars in test)
  const depsRef = useRef(null);
  const getDeps = useCallback(async () => {
    if (depsRef.current) return depsRef.current;
    const [{ httpsCallable }, { cloudFunctions }, Typesense] = await Promise.all([
      import('firebase/functions'),
      import('../firebase'),
      import('typesense'),
    ]);
    depsRef.current = { httpsCallable, cloudFunctions, Typesense: Typesense.default || Typesense };
    return depsRef.current;
  }, []);

  const mintTypesenseKey = useCallback(async () => {
    const cached = keyRef.current;
    if (cached.key && Date.now() < cached.expiresAt - KEY_TTL_BUFFER_MS) {
      return cached.key;
    }
    const { httpsCallable, cloudFunctions } = await getDeps();
    const mint = httpsCallable(cloudFunctions, 'mintTypesenseKey');
    const { data } = await mint();
    keyRef.current = { key: data.key, expiresAt: data.expiresAt };
    // Reset client so it picks up the new key
    clientRef.current = null;
    return data.key;
  }, [getDeps]);

  const getClient = useCallback(async () => {
    if (clientRef.current) return clientRef.current;
    const { Typesense } = await getDeps();
    const key = await mintTypesenseKey();
    clientRef.current = new Typesense.Client({
      nodes: [{ host: import.meta.env.VITE_TYPESENSE_HOST, port: 443, protocol: 'https' }],
      apiKey: key,
      connectionTimeoutSeconds: 5,
    });
    return clientRef.current;
  }, [mintTypesenseKey, getDeps]);

  useEffect(() => {
    // Clear results when query is cleared
    if (!searchActive) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Debounce the search
    clearTimeout(debounceRef.current);
    setLoading(true);

    const seq = ++abortRef.current;

    debounceRef.current = setTimeout(async () => {
      try {
        const client = await getClient();

        const filterParts = [];

        // Scope filter
        if (studentId) {
          filterParts.push(`studentId:=${studentId}`);
        } else if (classroomId) {
          filterParts.push(`classroomId:=${classroomId}`);
        }

        // User-applied filters from FilterPanel
        const userFilter = buildTypesenseFilterBy(committedFilters);
        if (userFilter) filterParts.push(userFilter);

        const searchParams = {
          q: query.trim(),
          query_by: 'text,lessonTitle,lessonDescription,groupComment,studentComment,teacherComment,curriculumArea,materialsIdentified,pdfTitle,essence_text,studentName',
          filter_by: filterParts.join(' && ') || undefined,
          highlight_full_fields: 'text,lessonTitle,lessonDescription,groupComment,studentComment,teacherComment',
          per_page: 50,
          sort_by: '_text_match:desc,observedAt:desc',
        };

        const response = await client.collections(TYPESENSE_COLLECTION).documents().search(searchParams);

        // Discard if a newer search was fired
        if (seq !== abortRef.current) return;

        const normalized = (response.hits || []).map(normalizeTypesenseHit);
        setResults(normalized);
        setError(null);
      } catch (err) {
        if (seq !== abortRef.current) return;
        console.error('[useTypesenseSearch] search failed:', err);
        setError(err.message || 'Search unavailable');
        setResults([]);
      } finally {
        if (seq === abortRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query, classroomId, studentId, committedFilters, searchActive, getClient]);

  return { results, loading, error, searchActive };
}
