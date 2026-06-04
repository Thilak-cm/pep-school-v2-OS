// DynamicIslandPill.jsx — Rotating alert pill for Home page (PEP-213)
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { keyframes } from '@emotion/react';
import { Box, Typography, ButtonBase } from '@mui/material';
import { Flag } from '../icons';
import { collectionGroup, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getIstIsoWeekKey } from '../utils/weekKey';

// ── Constants ──────────────────────────────────────────────────────────────────

const ROTATION_MS = 4000;

const CACHE_KEY_PREFIX = 'notificationsPageCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Alert type color map (extensible for future alert types)
const ALERT_COLORS = {
  redFlag: { label: 'var(--color-error)', cta: 'var(--color-error)', ctaBg: 'var(--color-error)', dot: 'var(--color-error)' },
  broadcast: { label: 'var(--color-primary)', cta: 'var(--color-primary)', ctaBg: 'var(--color-primary)', dot: 'var(--color-primary)' },
  interview: { label: 'var(--color-secondary)', cta: 'var(--color-secondary)', ctaBg: 'var(--color-secondary)', dot: 'var(--color-secondary)' },
};

// ── Progress bar animation ─────────────────────────────────────────────────────

const progressFill = keyframes`
  from { width: 0%; }
  to   { width: 100%; }
`;

// ── Cache helpers (read from NotificationsPage cache) ──────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────────

function DynamicIslandPill({ onNavigateToStudent, classrooms = [] }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const timerRef = useRef(null);

  // ── Fetch red flag alerts ────────────────────────────────────────────────────

  const fetchRedFlags = useCallback(async () => {
    try {
      const uid = auth?.currentUser?.uid;
      if (!uid) { setLoading(false); return; }

      const weekKey = getIstIsoWeekKey();

      // 1. Determine role + accessible classrooms
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) { setLoading(false); return; }
      const userData = userSnap.data() || {};
      const role = userData.role || 'teacher';

      let accessibleClassrooms = [];
      if (role === 'superadmin') {
        accessibleClassrooms = [];
      } else if (role === 'classroomadmin') {
        accessibleClassrooms = Array.isArray(userData.manageableClassrooms)
          ? userData.manageableClassrooms.filter(Boolean) : [];
      } else {
        // Teacher: find classrooms where teacherIds includes uid
        const classroomsFromProps = classrooms
          .filter((c) => Array.isArray(c.teacherIds) && c.teacherIds.includes(uid))
          .map((c) => c.id);
        accessibleClassrooms = classroomsFromProps.length > 0
          ? classroomsFromProps
          : classrooms.map((c) => c.id);
      }

      // 2. Try NotificationsPage cache first
      const cacheKey = buildCacheKey(uid, weekKey, role, accessibleClassrooms);
      const cachedSignals = getCachedData(cacheKey, 'signals');
      const cachedStudentInfo = getCachedData(cacheKey, 'studentInfo');

      let signals = [];
      let studentInfo = {};

      if (cachedSignals && cachedStudentInfo) {
        signals = cachedSignals;
        studentInfo = cachedStudentInfo;
      } else if (role === 'superadmin' || role === 'classroomadmin') {
        // Admin path: collectionGroup query
        const snap = await getDocs(
          query(collectionGroup(db, 'ai_summaries'), where('weekKey', '==', weekKey))
        );
        const rows = [];
        const studentIds = new Set();
        snap.forEach((d) => {
          if (d.id !== 'weekly_snapshot') return;
          const data = d.data() || {};
          const pathParts = d.ref.path.split('/');
          const studentId = pathParts[1]; // students/{studentId}/ai_summaries/weekly_snapshot
          rows.push({ studentId, ...data });
          studentIds.add(studentId);
        });

        // Fetch student info for names + classroom scoping
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

        // Scope classroomadmins to their classrooms
        signals = role === 'superadmin' ? rows : rows.filter((r) => {
          const cid = studentInfo[r.studentId]?.classroomId;
          return cid && accessibleClassrooms.includes(cid);
        });

        // Exclude inactive students
        signals = signals.filter((r) => (studentInfo[r.studentId]?.status || 'active') === 'active');
      } else {
        // Teacher path: direct doc reads per student
        const scopedClassrooms = accessibleClassrooms.length > 0 ? accessibleClassrooms : [];
        if (scopedClassrooms.length === 0) { setLoading(false); return; }

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

      // 3. Filter to red flags only
      const redFlagAlerts = signals
        .filter((s) => s.redFlag?.severity === 'high')
        .map((s) => ({
          type: 'redFlag',
          label: 'RED FLAG',
          title: studentInfo[s.studentId]?.name || s.studentId,
          subtitle: s.redFlag?.reason || 'Flagged this week',
          ctaLabel: 'Read note',
          ctaIcon: <Flag size={16} />,
          color: ALERT_COLORS.redFlag,
          data: { studentId: s.studentId, studentName: studentInfo[s.studentId]?.name, classroomId: studentInfo[s.studentId]?.classroomId },
        }));

      setAlerts(redFlagAlerts);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [classrooms]);

  useEffect(() => {
    fetchRedFlags();
  }, [fetchRedFlags]);

  // ── Rotation timer ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (alerts.length <= 1 || paused) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % alerts.length);
      setAnimKey((k) => k + 1);
    }, ROTATION_MS);
    return () => clearInterval(timerRef.current);
  }, [alerts.length, paused]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handlePillTap = () => {
    if (alerts.length <= 1) return;
    setPaused((p) => !p);
  };

  const handleCtaTap = (e, alert) => {
    e.stopPropagation();
    if (alert.data?.studentId) {
      onNavigateToStudent?.(alert.data);
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) return null;

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (alerts.length === 0) {
    return (
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 64, borderRadius: '22px',
        background: 'var(--color-surface-dark, #1a1a2e)',
        px: 2.5,
      }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontWeight: 500 }}>
          All clear this week
        </Typography>
      </Box>
    );
  }

  const current = alerts[activeIndex] || alerts[0];
  const alertColor = current.color || ALERT_COLORS.redFlag;

  return (
    <ButtonBase
      onClick={handlePillTap}
      disableRipple
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', height: 64, borderRadius: '22px',
        background: 'var(--color-surface-dark, #1a1a2e)',
        px: 2.5, py: 1.5,
        position: 'relative', overflow: 'hidden',
        textAlign: 'left',
      }}
    >
      {/* ── Text content ── */}
      <Box sx={{ flex: 1, minWidth: 0, mr: 1.5 }}>
        <Typography sx={{
          fontSize: '0.65rem', fontWeight: 800, letterSpacing: 1.2,
          textTransform: 'uppercase', color: alertColor.label,
          lineHeight: 1,
        }}>
          {current.label}
        </Typography>
        <Typography sx={{
          fontSize: '0.9rem', fontWeight: 700, color: '#fff',
          lineHeight: 1.3, mt: 0.25,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {current.title}
        </Typography>
        <Typography sx={{
          fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)',
          lineHeight: 1.2, mt: 0.15,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {current.subtitle}
        </Typography>
      </Box>

      {/* ── CTA button ── */}
      <ButtonBase
        onClick={(e) => handleCtaTap(e, current)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          px: 2, py: 0.75, borderRadius: '14px',
          backgroundColor: alertColor.ctaBg,
          color: '#fff', fontSize: '0.8rem', fontWeight: 700,
          flexShrink: 0,
          '&:hover': { opacity: 0.9 },
        }}
      >
        {current.ctaIcon}
        {current.ctaLabel}
      </ButtonBase>

      {/* ── Dot indicators ── */}
      {alerts.length > 1 && (
        <Box sx={{
          position: 'absolute', bottom: 8, right: 16,
          display: 'flex', gap: 0.5, alignItems: 'center',
        }}>
          {alerts.map((alert, i) => (
            <Box
              key={i}
              sx={{
                width: 6, height: 6, borderRadius: '50%',
                backgroundColor: i === activeIndex
                  ? (alert.color?.dot || 'var(--color-error)')
                  : 'rgba(255,255,255,0.25)',
                transition: 'background-color 0.3s ease',
              }}
            />
          ))}
        </Box>
      )}

      {/* ── Progress bar ── */}
      {alerts.length > 1 && !paused && (
        <Box sx={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 2, backgroundColor: 'rgba(255,255,255,0.08)',
        }}>
          <Box
            key={animKey}
            sx={{
              height: '100%',
              backgroundColor: alertColor.dot,
              animation: `${progressFill} ${ROTATION_MS}ms linear`,
              opacity: 0.6,
            }}
          />
        </Box>
      )}
    </ButtonBase>
  );
}

export default DynamicIslandPill;
