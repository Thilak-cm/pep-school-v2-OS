/**
 * useStatsData — client hook for reading pre-computed stats cache docs (PEP-285).
 *
 * Reads `statsCache/classroom_{id}` docs the user has access to (Firestore
 * rules enforce role scoping). Exposes cachedAt timestamp and a manual refresh
 * trigger. Auto-triggers recomputeStats CF only when no cache exists at all.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, getDocs, getDoc, query, where, documentId } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';

/**
 * @param {Object} params
 * @param {Object} params.user - Firebase auth user ({ uid })
 * @param {string} params.role - 'superadmin' | 'classroomadmin' | 'teacher'
 * @param {string[]} [params.manageableClassrooms] - classroom IDs (classroomadmin)
 * @param {Object[]} [params.userClassrooms] - classrooms where teacher is assigned
 */
export const useStatsData = ({ user, role, manageableClassrooms = [], userClassrooms = [] }) => {
  const [classroomDocs, setClassroomDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cachedAt, setCachedAt] = useState(null); // ms timestamp of last recompute
  const mountedRef = useRef(true);

  // Any authenticated user can trigger recompute — CF validates role server-side
  const canTrigger = !!user?.uid;

  // Stable key for manageableClassrooms to avoid unnecessary re-renders
  const classroomKey = [...(manageableClassrooms || [])].sort().join(',');
  const teacherClassroomIds = (userClassrooms || []).map(c => c.id || c).filter(Boolean);
  const teacherKey = [...teacherClassroomIds].sort().join(',');

  // Fetch stats cache docs based on role
  const fetchDocs = useCallback(async (opts = {}) => {
    if (!user?.uid) return;
    const { triggerIfStale = true } = opts;

    try {
      setError(null);
      if (!opts.silent) setLoading(true);
      const statsCacheRef = collection(db, 'statsCache');
      let docs = [];

      if (role === 'superadmin') {
        const snap = await getDocs(
          query(statsCacheRef, where('classroomId', '!=', null))
        );
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } else if (role === 'classroomadmin') {
        const ids = (manageableClassrooms || []).filter(Boolean);
        if (ids.length === 0) {
          if (mountedRef.current) { setClassroomDocs([]); setLoading(false); }
          return;
        }
        const batchSize = 10;
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const docIds = batch.map(id => `classroom_${id}`);
          const snap = await getDocs(
            query(statsCacheRef, where(documentId(), 'in', docIds))
          );
          snap.docs.forEach(d => docs.push({ id: d.id, ...d.data() }));
        }
      } else if (role === 'teacher') {
        if (teacherClassroomIds.length === 0) {
          if (mountedRef.current) { setClassroomDocs([]); setLoading(false); }
          return;
        }
        const batchSize = 10;
        for (let i = 0; i < teacherClassroomIds.length; i += batchSize) {
          const batch = teacherClassroomIds.slice(i, i + batchSize);
          const docIds = batch.map(id => `classroom_${id}`);
          const snap = await getDocs(
            query(statsCacheRef, where(documentId(), 'in', docIds))
          );
          snap.docs.forEach(d => docs.push({ id: d.id, ...d.data() }));
        }
      }

      if (!mountedRef.current) return;
      setClassroomDocs(docs);

      // Check staleness from _meta doc
      try {
        const metaSnap = await getDoc(doc(statsCacheRef, '_meta'));
        if (metaSnap.exists()) {
          const metaCachedAt = metaSnap.data()?.cachedAt;
          const cachedMs = metaCachedAt?.toDate ? metaCachedAt.toDate().getTime()
            : metaCachedAt?.seconds ? metaCachedAt.seconds * 1000 : 0;
          if (mountedRef.current) setCachedAt(cachedMs || null);
        } else if (canTrigger && triggerIfStale) {
          // No cache at all — auto-trigger first compute (global recompute regardless of caller role)
          triggerRecompute(true);
        }
      } catch (_metaErr) {
        // _meta read failed — non-critical, cachedAt stays null
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e?.message || 'Failed to load stats');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  // triggerRecompute omitted: circular dep with fetchDocs. Safe because uid is stable after mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, role, classroomKey, teacherKey, canTrigger]);

  // Trigger the CF to recompute stats
  const triggerRecompute = useCallback(async (forceRefresh = false) => {
    if (!canTrigger) return;
    try {
      setRefreshing(true);
      const callFn = httpsCallable(cloudFunctions, 'recomputeStats', { timeout: 120_000 });
      const result = await callFn({ forceRefresh });

      if (!result.data?.fresh) {
        // CF recomputed — re-fetch docs without triggering another recompute
        await fetchDocs({ triggerIfStale: false, silent: true });
      }
      if (mountedRef.current) {
        setRefreshing(false);
        // Use server-provided timestamp when cache was already fresh; otherwise now
        setCachedAt(result.data?.fresh ? (result.data.cachedAt || Date.now()) : Date.now());
      }
    } catch (e) {
      if (mountedRef.current) {
        setRefreshing(false);
        setError(e?.message || 'Stats refresh failed');
        if (import.meta.env.DEV) console.warn('[useStatsData] recompute failed', e);
      }
    }
  }, [canTrigger, fetchDocs]);

  // Manual refresh (exposed to UI)
  const refresh = useCallback(() => {
    triggerRecompute(true);
  }, [triggerRecompute]);

  // Load on mount
  useEffect(() => {
    mountedRef.current = true;
    fetchDocs();
    return () => { mountedRef.current = false; };
  }, [fetchDocs]);

  return { classroomDocs, loading, error, refreshing, refresh, cachedAt };
};
