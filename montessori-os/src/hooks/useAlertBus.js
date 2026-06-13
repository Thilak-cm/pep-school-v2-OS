// useAlertBus.js — Dual-source alert subscriber hook (PEP-296)
// Source 1: weekly_snapshot red flags (one-shot, cached)
// Source 2: alerts collection via onSnapshot (realtime)
// Both sources merged, sorted by priority then createdAt.

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  collection, collectionGroup, query, where, getDocs, getDoc, doc, onSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getIstIsoWeekKey } from '../utils/weekKey';
import { transformForDisplay, transformRedFlag } from '../utils/alertTransforms';
import { fetchHeatmapDocs } from '../utils/heatmapFetch';

// ── Cache helpers (read from NotificationsPage cache) ──────────────────────────

const CACHE_KEY_PREFIX = 'notificationsPageCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const buildCacheKey = (uid, weekKey, role, accessibleClassrooms = []) => {
  const scopeKey = Array.isArray(accessibleClassrooms) && accessibleClassrooms.length
    ? accessibleClassrooms.slice().sort().join('|')
    : 'all';
  return `${CACHE_KEY_PREFIX}:${uid || 'anonymous'}:${weekKey || 'current'}:${role || 'unknown'}:${scopeKey}`;
};

const getCachedData = (key, dataType) => {
  if (typeof window === 'undefined' || !window?.localStorage || !key) return null;
  try {
    const cacheKey = `${key}:${dataType}`;
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || parsed.payload === undefined) return null;
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    return parsed.payload;
  } catch { return null; }
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAlertBus(classrooms = []) {
  const [redFlagAlerts, setRedFlagAlerts] = useState([]);
  const [busAlerts, setBusAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  // Role + classroom refs populated by fetchRedFlags; used by the alert filter effect
  const userRoleRef = useRef(null);
  const accessibleClassroomsRef = useRef([]);
  // Raw snapshot docs stored for re-filtering when role/classroom refs are populated
  const rawSnapshotDocsRef = useRef([]);
  const [refVersion, setRefVersion] = useState(0);
  // Stable key to avoid re-fetches on reference-only changes to classrooms array
  const classroomsKey = classrooms.map((c) => c.id).sort().join(',');

  // ── Source 1: weekly_snapshot red flags (one-shot, cached) ──────────────

  const fetchRedFlags = useCallback(async () => {
    try {
      const uid = auth?.currentUser?.uid;
      if (!uid) return;

      const weekKey = getIstIsoWeekKey();

      // Determine role + accessible classrooms
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) return;
      const userData = userSnap.data() || {};
      const role = userData.role || 'teacher';

      let accessibleClassrooms = [];
      if (role === 'superadmin') {
        accessibleClassrooms = [];
      } else if (role === 'classroomadmin') {
        accessibleClassrooms = Array.isArray(userData.manageableClassrooms)
          ? userData.manageableClassrooms.filter(Boolean) : [];
      } else {
        const classroomsFromProps = classrooms
          .filter((c) => Array.isArray(c.teacherIds) && c.teacherIds.includes(uid))
          .map((c) => c.id);
        accessibleClassrooms = classroomsFromProps.length > 0
          ? classroomsFromProps
          : classrooms.map((c) => c.id);
      }

      // Store role + accessible classrooms for targeting filter in onSnapshot
      userRoleRef.current = role;
      accessibleClassroomsRef.current = accessibleClassrooms;
      setRefVersion((v) => v + 1);

      let signals = [];
      let studentInfo = {};

      // ── Fast path: read from heatmap cache docs (PEP-303) ─────────────
      let heatmapDocs = [];

      try {
        heatmapDocs = await fetchHeatmapDocs({ role, accessibleClassrooms });
        // Discard stale cache from a previous week
        heatmapDocs = heatmapDocs.filter((d) => d.weekKey === weekKey);
      } catch {
        // Cache read failed — fall through to legacy path
      }

      if (heatmapDocs.length > 0) {
        // Build signals + studentInfo from cache
        for (const cacheDoc of heatmapDocs) {
          const roster = Array.isArray(cacheDoc.roster) ? cacheDoc.roster : [];
          for (const row of roster) {
            const currentSeverity = Array.isArray(row.weeks)
              ? row.weeks[row.weeks.length - 1] : null;
            if (!currentSeverity) continue;
            studentInfo[row.studentId] = {
              name: row.displayName, classroomId: row.classroomId, status: 'active',
            };
            signals.push({
              studentId: row.studentId,
              severity: currentSeverity,
              redFlag: currentSeverity === 'high' ? { severity: 'high' } : null,
              escalatedThisWeek: !!row.escalatedThisWeek,
              improvedThisWeek: !!row.improvedThisWeek,
            });
          }
        }
      } else {
        // ── Legacy path: direct Firestore reads ─────────────────────────
        const cacheKey = buildCacheKey(uid, weekKey, role, accessibleClassrooms);
        const cachedSignals = getCachedData(cacheKey, 'signals');
        const cachedStudentInfo = getCachedData(cacheKey, 'studentInfo');

        if (cachedSignals && cachedStudentInfo) {
          signals = cachedSignals;
          studentInfo = cachedStudentInfo;
        } else if (role === 'superadmin' || role === 'classroomadmin') {
          const snap = await getDocs(
            query(collectionGroup(db, 'ai_summaries'), where('weekKey', '==', weekKey))
          );
          const rows = [];
          const studentIds = new Set();
          snap.forEach((d) => {
            if (d.id !== 'weekly_snapshot') return;
            const data = d.data() || {};
            const studentId = d.ref.parent?.parent?.id;
            if (!studentId) return;
            rows.push({ studentId, ...data });
            studentIds.add(studentId);
          });

          const studentSnaps = await Promise.all(
            Array.from(studentIds).map(async (sid) => {
              try {
                const s = await getDoc(doc(db, 'students', sid));
                if (!s.exists()) return null;
                const d = s.data() || {};
                return { id: sid, name: d.displayName || d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim() || sid, classroomId: d.classroomId || '', status: d.status || 'active' };
              } catch { return null; }
            })
          );
          studentSnaps.filter(Boolean).forEach((s) => { studentInfo[s.id] = s; });

          signals = role === 'superadmin' ? rows : rows.filter((r) => {
            const cid = studentInfo[r.studentId]?.classroomId;
            return cid && accessibleClassrooms.includes(cid);
          });
          signals = signals.filter((r) => (studentInfo[r.studentId]?.status || 'active') === 'active');
        } else {
          const scopedClassrooms = accessibleClassrooms.length > 0 ? accessibleClassrooms : [];
          if (scopedClassrooms.length === 0) return;

          const studentSnaps = await Promise.all(
            scopedClassrooms.map((cid) =>
              getDocs(query(collection(db, 'students'), where('classroomId', '==', cid), where('status', '==', 'active')))
            )
          );

          const studentIds = [];
          studentSnaps.forEach((snap) => {
            snap.docs.forEach((sDoc) => {
              const s = sDoc.data() || {};
              const label = s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || sDoc.id;
              studentInfo[sDoc.id] = { name: label, classroomId: s.classroomId || '', status: s.status || 'active' };
              studentIds.push(sDoc.id);
            });
          });

          const rows = await Promise.all(studentIds.map(async (sid) => {
            try {
              const snapRef = doc(db, 'students', sid, 'ai_summaries', 'weekly_snapshot');
              const snap = await getDoc(snapRef);
              if (!snap.exists()) return null;
              const data = snap.data() || {};
              if (data.weekKey !== weekKey) return null;
              return { studentId: sid, ...data };
            } catch { return null; }
          }));

          signals = rows.filter(Boolean);
        }
      }

      // Transform to DIP display shape
      const transformed = signals
        .map((s) => transformRedFlag(s, studentInfo))
        .filter(Boolean);

      if (mountedRef.current) setRedFlagAlerts(transformed);
    } catch {
      // Silently fail — pill shows empty state
    }
  // classroomsKey is a stable string derived from classrooms — avoids re-fetch on reference-only changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomsKey]);

  // ── Source 2: alerts collection (realtime via onSnapshot) ──────────────

  // Store raw snapshot docs; filtering happens in a separate effect so it
  // re-runs when userRoleRef / accessibleClassroomsRef are populated (race fix).
  useEffect(() => {
    const uid = auth?.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    const alertsQuery = query(
      collection(db, 'alerts'),
      where('dip', '==', true),
    );

    let cancelled = false;
    const unsub = onSnapshot(alertsQuery, (snapshot) => {
      if (cancelled) return;
      const docs = [];
      snapshot.forEach((d) => {
        docs.push({ id: d.id, ...(d.data() || {}) });
      });
      rawSnapshotDocsRef.current = docs;
      // Bump version to trigger re-filter
      setRefVersion((v) => v + 1);
    }, () => {
      // onSnapshot error — silently degrade
      if (cancelled) return;
      rawSnapshotDocsRef.current = [];
      setBusAlerts([]);
    });

    return () => {
      cancelled = true;
      // Defer unsubscribe to next microtask so Firestore's internal watch
      // stream finishes its state transition before we tear down the listener.
      // Prevents "Unexpected state" assertion in SDK 11.x under StrictMode.
      queueMicrotask(() => unsub());
    };
  }, []);

  // Re-filter raw snapshot docs whenever refs or snapshot data change
  useEffect(() => {
    const uid = auth?.currentUser?.uid;
    if (!uid) return;

    const userRole = userRoleRef.current;
    const userClassrooms = accessibleClassroomsRef.current;
    const alerts = [];

    for (const data of rawSnapshotDocsRef.current) {
      // Client-side dismissedBy filtering
      if (data.dismissedBy && data.dismissedBy[uid]) continue;
      // expiresAt filtering (belt-and-suspenders with cleanup CF)
      if (data.expiresAt && data.expiresAt.toDate && data.expiresAt.toDate() < new Date()) continue;
      // Skip scheduled broadcasts that haven't started yet (only applies to broadcast type)
      if (data.type === 'broadcast' && data.startsAt && data.startsAt.toDate && data.startsAt.toDate() > new Date()) continue;

      // Client-side targeting filter — empty arrays mean "all" (no filtering)
      if (Array.isArray(data.targetRoles) && data.targetRoles.length > 0) {
        if (!userRole || !data.targetRoles.includes(userRole)) continue;
      }
      if (Array.isArray(data.targetClassrooms) && data.targetClassrooms.length > 0) {
        if (!userClassrooms.length || !data.targetClassrooms.some((c) => userClassrooms.includes(c))) continue;
      }
      if (Array.isArray(data.targetTeachers) && data.targetTeachers.length > 0) {
        if (!data.targetTeachers.includes(uid)) continue;
      }

      const display = transformForDisplay({ id: data.id, ...data });
      alerts.push({
        ...display,
        id: data.id,
        priority: data.priority ?? 99,
        createdAt: data.createdAt,
        _source: 'alerts',
      });
    }
    setBusAlerts(alerts);
  // refVersion changes when either fetchRedFlags populates refs or onSnapshot delivers new data
  }, [refVersion]);

  // ── Fetch red flags on mount ────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try { await fetchRedFlags(); } finally { if (mountedRef.current) setLoading(false); }
    })();
    return () => { mountedRef.current = false; };
  }, [fetchRedFlags]);

  // ── Merge and sort both sources ─────────────────────────────────────────

  const alerts = [...redFlagAlerts, ...busAlerts].sort((a, b) => {
    const pa = a.priority ?? 99;
    const pb = b.priority ?? 99;
    if (pa !== pb) return pa - pb;
    // Then by createdAt descending (newer first)
    const ta = a.createdAt?.seconds ?? a.createdAt?.toDate?.()?.getTime() ?? 0;
    const tb = b.createdAt?.seconds ?? b.createdAt?.toDate?.()?.getTime() ?? 0;
    return tb - ta;
  });

  return { alerts, loading };
}
