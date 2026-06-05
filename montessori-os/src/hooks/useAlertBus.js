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
  const unsubRef = useRef(null);

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

      // Try NotificationsPage cache first
      const cacheKey = buildCacheKey(uid, weekKey, role, accessibleClassrooms);
      const cachedSignals = getCachedData(cacheKey, 'signals');
      const cachedStudentInfo = getCachedData(cacheKey, 'studentInfo');

      let signals = [];
      let studentInfo = {};

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

      // Transform to DIP display shape
      const transformed = signals
        .map((s) => transformRedFlag(s, studentInfo))
        .filter(Boolean);

      setRedFlagAlerts(transformed);
    } catch {
      // Silently fail — pill shows empty state
    }
  }, [classrooms]);

  // ── Source 2: alerts collection (realtime via onSnapshot) ──────────────

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

    const unsub = onSnapshot(alertsQuery, (snapshot) => {
      const alerts = [];
      snapshot.forEach((d) => {
        const data = d.data() || {};

        // Client-side role/classroom/dismissedBy filtering
        if (data.dismissedBy && data.dismissedBy[uid]) return;
        // expiresAt filtering (belt-and-suspenders with cleanup CF)
        if (data.expiresAt && data.expiresAt.toDate && data.expiresAt.toDate() < new Date()) return;

        const display = transformForDisplay({ id: d.id, ...data });
        alerts.push({
          ...display,
          id: d.id,
          priority: data.priority ?? 99,
          createdAt: data.createdAt,
          _source: 'alerts',
        });
      });
      setBusAlerts(alerts);
    }, () => {
      // onSnapshot error — silently degrade
      setBusAlerts([]);
    });

    unsubRef.current = unsub;
    return () => { unsub(); };
  }, []);

  // ── Fetch red flags on mount ────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      await fetchRedFlags();
      setLoading(false);
    })();
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
