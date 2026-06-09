/**
 * useHeatmapCache — client hook for reading pre-computed heatmap cache docs (PEP-303).
 *
 * Reads `statsCache/heatmap_{classroomId}` docs the user has access to (Firestore
 * rules enforce role scoping via classroomId field). Mirrors the useStatsData
 * pattern for role-scoped reads.
 *
 * Returns roster data ready for the NotificationsPage heatmap grid.
 */

import { useState, useEffect } from 'react';
import { getIstIsoWeekKey } from '../utils/weekKey';
import { fetchHeatmapDocs } from '../utils/heatmapFetch';

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

  // Stable key to avoid re-fetches on reference-only changes
  const classroomKey = Array.isArray(accessibleClassrooms)
    ? accessibleClassrooms.slice().sort().join(',') : '';

  useEffect(() => {
    if (!accessLoaded) return;

    let cancelled = false;
    const fetchHeatmap = async () => {
      try {
        setError(null);
        setLoading(true);

        const docs = await fetchHeatmapDocs({ role, accessibleClassrooms });

        if (cancelled) return;

        // Freshness check: discard stale cache docs from a previous week
        const currentWeekKey = getIstIsoWeekKey();
        const freshDocs = docs.filter((d) => d.weekKey === currentWeekKey);

        setHeatmapDocs(freshDocs);
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
