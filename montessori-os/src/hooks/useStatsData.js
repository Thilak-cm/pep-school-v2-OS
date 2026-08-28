/**
 * useStatsData — client hook for reading pre-computed stats cache docs (PEP-285).
 *
 * Reads `statsCache/classroom_{id}` docs the user has access to (Firestore
 * rules enforce role scoping). Exposes cachedAt timestamp and a manual refresh
 * trigger. Cache initialization is performed by the scheduled reconciliation;
 * this hook never silently starts an expensive full rebuild.
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
        docs = snap.docs
          .filter(d => d.id.startsWith('classroom_'))
          .map(d => ({ id: d.id, ...d.data() }));
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
          const metaData = metaSnap.data();
          if (!metaData?.deltaCursor && mountedRef.current) {
            setError('Stats are not initialized yet. Please try again after reconciliation.');
          }
          const metaCachedAt = metaData?.cachedAt;
          const cachedMs = metaCachedAt?.toDate ? metaCachedAt.toDate().getTime()
            : metaCachedAt?.seconds ? metaCachedAt.seconds * 1000 : 0;
          if (mountedRef.current) setCachedAt(cachedMs || null);
        } else if (canTrigger && triggerIfStale) {
          // A missing checkpoint is a deployment/operations state, not a reason
          // to let a teacher accidentally start a full-database computation.
          if (mountedRef.current) setError('Stats are not initialized yet. Please try again after reconciliation.');
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
  const triggerRecompute = useCallback(async () => {
    if (!canTrigger) return;
    try {
      setRefreshing(true);
      // Keep the client deadline beyond the function's 120s runtime so the
      // server can return its own bounded-wait error instead of a client timeout.
      const callFn = httpsCallable(cloudFunctions, 'updateStatsDelta', { timeout: 135_000 });
      const result = await callFn();

      // Owners and waiting/fenced callers all re-read the generation that the
      // server actually published.
      await fetchDocs({ triggerIfStale: false, silent: true });
      if (mountedRef.current) {
        setRefreshing(false);
        if (result.data?.cachedAt) setCachedAt(result.data.cachedAt);
      }
    } catch (e) {
      if (mountedRef.current) {
        setRefreshing(false);
        setError('Stats refresh failed. Showing last successful stats. Please try again.');
        if (import.meta.env.DEV) console.warn('[useStatsData] delta refresh failed', e);
      }
    }
  }, [canTrigger, fetchDocs]);

  // Manual refresh (exposed to UI)
  const refresh = useCallback(() => {
    triggerRecompute();
  }, [triggerRecompute]);

  // Load on mount
  useEffect(() => {
    mountedRef.current = true;
    fetchDocs();
    return () => { mountedRef.current = false; };
  }, [fetchDocs]);

  return { classroomDocs, loading, error, refreshing, refresh, cachedAt };
};
