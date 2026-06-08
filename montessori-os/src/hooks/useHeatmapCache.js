/**
 * useHeatmapCache — client hook for reading pre-computed heatmap cache docs (PEP-303).
 *
 * Reads `statsCache/heatmap_{classroomId}` docs the user has access to (Firestore
 * rules enforce role scoping via classroomId field). Mirrors the useStatsData
 * pattern for role-scoped reads.
 *
 * Returns roster data ready for the NotificationsPage heatmap grid.
 */

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * @param {Object} params
 * @param {string} params.role - 'superadmin' | 'classroomadmin' | 'teacher'
 * @param {string[]} params.accessibleClassrooms - classroom IDs the user can access
 * @param {boolean} params.accessLoaded - whether role/classroom data has been resolved
 */
export function useHeatmapCache({ role, accessibleClassrooms, accessLoaded }) {
  const [heatmapDocs, setHeatmapDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  // Stable key to avoid re-fetches on reference-only changes
  const classroomKey = Array.isArray(accessibleClassrooms)
    ? accessibleClassrooms.slice().sort().join(',') : '';

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!accessLoaded) return;

    let cancelled = false;
    const fetchHeatmap = async () => {
      try {
        setError(null);
        setLoading(true);
        const statsCacheRef = collection(db, 'statsCache');
        let docs = [];

        if (role === 'superadmin') {
          // Read all heatmap docs — filter by doc ID prefix
          const snap = await getDocs(
            query(statsCacheRef, where('classroomId', '!=', null))
          );
          docs = snap.docs
            .filter((d) => d.id.startsWith('heatmap_') && d.id !== 'heatmap_meta')
            .map((d) => ({ id: d.id, ...d.data() }));
        } else {
          // Classroomadmin or teacher — read specific classroom heatmap docs
          const ids = (accessibleClassrooms || []).filter(Boolean);
          if (ids.length === 0) {
            if (!cancelled) { setHeatmapDocs([]); setLoading(false); }
            return;
          }
          // Batch in groups of 10 (Firestore 'in' limit)
          for (let i = 0; i < ids.length; i += 10) {
            const batch = ids.slice(i, i + 10);
            const docIds = batch.map((id) => `heatmap_${id}`);
            const snap = await getDocs(
              query(statsCacheRef, where(documentId(), 'in', docIds))
            );
            snap.docs.forEach((d) => docs.push({ id: d.id, ...d.data() }));
          }
        }

        if (cancelled) return;
        setHeatmapDocs(docs);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load heatmap cache');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchHeatmap();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessLoaded, role, classroomKey]);

  return { heatmapDocs, loading, error };
}
