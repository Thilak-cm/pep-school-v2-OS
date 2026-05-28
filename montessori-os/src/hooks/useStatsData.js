/**
 * useStatsData — client hook for reading pre-computed stats cache docs (PEP-285).
 *
 * Reads `statsCache/classroom_{id}` docs the user has access to (Firestore
 * rules enforce role scoping). If the cache is stale (> TTL), auto-triggers
 * recomputeStats CF for admins. Teachers see stale data with an indicator.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, getDocs, getDoc, query, where, documentId } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes — matches CF

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
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const isAdmin = role === 'superadmin' || role === 'classroomadmin';

  // Stable key for manageableClassrooms to avoid unnecessary re-renders
  const classroomKey = (manageableClassrooms || []).sort().join(',');
  const teacherClassroomIds = (userClassrooms || []).map(c => c.id || c).filter(Boolean);
  const teacherKey = teacherClassroomIds.sort().join(',');

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
          const cachedAt = metaSnap.data()?.cachedAt;
          const cachedMs = cachedAt?.toDate ? cachedAt.toDate().getTime()
            : cachedAt?.seconds ? cachedAt.seconds * 1000 : 0;
          const isStale = Date.now() - cachedMs > CACHE_TTL_MS;
          if (mountedRef.current) setStale(isStale);

          if (isStale && isAdmin && triggerIfStale) {
            triggerRecompute(false);
          }
        } else if (isAdmin && triggerIfStale) {
          if (mountedRef.current) setStale(true);
          triggerRecompute(true);
        } else {
          if (mountedRef.current) setStale(true);
        }
      } catch (_metaErr) {
        // _meta read failed — non-critical
        if (mountedRef.current) setStale(true);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e?.message || 'Failed to load stats');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, role, classroomKey, teacherKey, isAdmin]);

  // Trigger the CF to recompute stats
  const triggerRecompute = useCallback(async (forceRefresh = false) => {
    if (!isAdmin) return;
    try {
      setRefreshing(true);
      const callFn = httpsCallable(cloudFunctions, 'recomputeStats', { timeout: 120_000 });
      const result = await callFn({ forceRefresh });

      if (!result.data?.fresh) {
        // CF recomputed — re-fetch docs without triggering another recompute
        await fetchDocs({ triggerIfStale: false, silent: true });
      }
      if (mountedRef.current) {
        setStale(false);
        setRefreshing(false);
      }
    } catch (e) {
      if (mountedRef.current) {
        setRefreshing(false);
        if (import.meta.env.DEV) console.warn('[useStatsData] recompute failed', e);
      }
    }
  }, [isAdmin, fetchDocs]);

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

  return { classroomDocs, loading, error, stale, refreshing, refresh };
};
