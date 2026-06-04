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
const PILL_HEIGHT = 72;
const SWIPE_THRESHOLD = 30;
const PEEK_AMOUNT = 10; // px of adjacent card to show during drag

const CACHE_KEY_PREFIX = 'notificationsPageCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Set to true to show fake alerts for design testing
const DEV_MOCK_ALERTS = true;

const MOCK_ALERTS = [
  {
    type: 'redFlag', label: 'RED FLAG',
    title: 'Maya S. — second incident this week',
    subtitle: 'Flagged by Ms. Devi \u00b7 2 days ago',
    ctaLabel: 'Read note', ctaIcon: <Flag size={16} />,
    color: { label: 'var(--color-error)', cta: 'var(--color-error)', ctaBg: 'var(--color-error)', dot: 'var(--color-error)' },
    data: { studentId: 'mock-1', studentName: 'Maya S.' },
  },
  {
    type: 'redFlag', label: 'RED FLAG',
    title: 'Arjun K. — aggressive behaviour noted',
    subtitle: 'Flagged by Ms. Rao \u00b7 today',
    ctaLabel: 'Read note', ctaIcon: <Flag size={16} />,
    color: { label: 'var(--color-error)', cta: 'var(--color-error)', ctaBg: 'var(--color-error)', dot: 'var(--color-error)' },
    data: { studentId: 'mock-2', studentName: 'Arjun K.' },
  },
  {
    type: 'redFlag', label: 'RED FLAG',
    title: 'Priya M. — withdrawal from group activities',
    subtitle: 'Flagged by Ms. Sharma \u00b7 1 day ago',
    ctaLabel: 'Read note', ctaIcon: <Flag size={16} />,
    color: { label: 'var(--color-error)', cta: 'var(--color-error)', ctaBg: 'var(--color-error)', dot: 'var(--color-error)' },
    data: { studentId: 'mock-3', studentName: 'Priya M.' },
  },
  {
    type: 'redFlag', label: 'RED FLAG',
    title: 'Rohan D. — repeated conflicts at lunch',
    subtitle: 'Flagged by Ms. Anita \u00b7 3 days ago',
    ctaLabel: 'Read note', ctaIcon: <Flag size={16} />,
    color: { label: 'var(--color-error)', cta: 'var(--color-error)', ctaBg: 'var(--color-error)', dot: 'var(--color-error)' },
    data: { studentId: 'mock-4', studentName: 'Rohan D.' },
  },
];

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

  // Swipe state
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartRef = useRef({ y: 0, time: 0 });
  const containerRef = useRef(null);

  // ── Fetch red flag alerts ────────────────────────────────────────────────────

  const fetchRedFlags = useCallback(async () => {
    // Dev mock mode
    if (DEV_MOCK_ALERTS) {
      setAlerts(MOCK_ALERTS);
      setLoading(false);
      return;
    }

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
    if (alerts.length <= 1 || paused || isDragging) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % alerts.length);
      setAnimKey((k) => k + 1);
    }, ROTATION_MS);
    return () => clearInterval(timerRef.current);
  }, [alerts.length, paused, isDragging]);

  // ── Touch/swipe handlers (iOS widget stack style) ────────────────────────────

  const handleTouchStart = useCallback((e) => {
    if (alerts.length <= 1) return;
    const touch = e.touches[0];
    touchStartRef.current = { y: touch.clientY, time: Date.now() };
    setIsDragging(true);
    setPaused(true);
  }, [alerts.length]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging || alerts.length <= 1) return;
    const touch = e.touches[0];
    const delta = touchStartRef.current.y - touch.clientY;
    // Clamp drag offset — allow overscroll with rubber-band effect
    const maxDrag = PILL_HEIGHT * 0.6;
    const clamped = Math.sign(delta) * Math.min(Math.abs(delta), maxDrag * 1.5);
    setDragOffset(clamped);
    e.preventDefault();
  }, [isDragging, alerts.length]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    const elapsed = Date.now() - touchStartRef.current.time;
    const velocity = Math.abs(dragOffset) / Math.max(elapsed, 1);

    // Determine if we should switch — either threshold or fast flick
    if (Math.abs(dragOffset) > SWIPE_THRESHOLD || velocity > 0.3) {
      if (dragOffset > 0) {
        // Swiped up → next
        setActiveIndex((prev) => (prev + 1) % alerts.length);
      } else {
        // Swiped down → previous
        setActiveIndex((prev) => (prev - 1 + alerts.length) % alerts.length);
      }
      setAnimKey((k) => k + 1);
    }

    setDragOffset(0);
    setIsDragging(false);
    // Resume auto-rotation after a delay
    setTimeout(() => setPaused(false), 2000);
  }, [isDragging, dragOffset, alerts.length]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleCtaTap = (e, alert) => {
    e.stopPropagation();
    if (alert.data?.studentId) {
      onNavigateToStudent?.(alert.data);
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) return null;

  // ── Empty state — plain text, no pill ────────────────────────────────────────

  if (alerts.length === 0) {
    return (
      <Box>
        <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--color-text)', letterSpacing: 1, mb: 0.5, display: 'block' }}>
          Quick alerts
        </Typography>
        <Typography sx={{ color: 'var(--color-text-soft)', fontSize: '0.85rem' }}>
          All clear this week
        </Typography>
      </Box>
    );
  }

  const current = alerts[activeIndex] || alerts[0];
  const alertColor = current.color || ALERT_COLORS.redFlag;
  const prevIndex = (activeIndex - 1 + alerts.length) % alerts.length;
  const nextIndex = (activeIndex + 1) % alerts.length;
  const hasPeek = alerts.length > 1 && isDragging && Math.abs(dragOffset) > 5;

  // Peek visibility: how much of adjacent card to reveal based on drag distance
  const peekProgress = Math.min(Math.abs(dragOffset) / (PILL_HEIGHT * 0.5), 1);
  const currentScale = 1 - peekProgress * 0.04;
  const currentTranslateY = isDragging ? -dragOffset * 0.3 : 0;

  return (
    <Box>
      <Typography variant="overline" sx={{ fontWeight: 700, color: 'var(--color-text)', letterSpacing: 1, mb: 1, display: 'block' }}>
        Quick alerts
      </Typography>

      {/* ── Pill stack container ── */}
      <Box
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        sx={{
          position: 'relative',
          height: PILL_HEIGHT,
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {/* ── Peek: previous card (above) ── */}
        {hasPeek && dragOffset < 0 && (
          <Box sx={{
            position: 'absolute', left: 0, right: 0,
            bottom: '100%', mb: '-4px',
            height: PEEK_AMOUNT * peekProgress,
            overflow: 'hidden',
            display: 'flex', alignItems: 'flex-end',
          }}>
            <AlertCard
              alert={alerts[prevIndex]}
              onCtaTap={handleCtaTap}
              sx={{ opacity: 0.5 * peekProgress, transform: 'scale(0.97)' }}
            />
          </Box>
        )}

        {/* ── Current card ── */}
        <Box sx={{
          position: 'absolute', inset: 0,
          transform: `translateY(${currentTranslateY}px) scale(${currentScale})`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 2,
        }}>
          <AlertCard
            alert={current}
            onCtaTap={handleCtaTap}
            alerts={alerts}
            activeIndex={activeIndex}
            animKey={animKey}
            paused={paused || isDragging}
          />
        </Box>

        {/* ── Peek: next card (below) ── */}
        {hasPeek && dragOffset > 0 && (
          <Box sx={{
            position: 'absolute', left: 0, right: 0,
            top: '100%', mt: '-4px',
            height: PEEK_AMOUNT * peekProgress,
            overflow: 'hidden',
          }}>
            <AlertCard
              alert={alerts[nextIndex]}
              onCtaTap={handleCtaTap}
              sx={{ opacity: 0.5 * peekProgress, transform: 'scale(0.97)' }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ── AlertCard sub-component ──────────────────────────────────────────────────

function AlertCard({ alert, onCtaTap, alerts, activeIndex, animKey, paused, sx = {} }) {
  const alertColor = alert.color || ALERT_COLORS.redFlag;
  const showIndicators = alerts && alerts.length > 1;

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', height: PILL_HEIGHT, borderRadius: '22px',
        background: 'var(--color-surface-dark, #1a1a2e)',
        px: 2.5, py: 1.5,
        position: 'relative', overflow: 'hidden',
        boxSizing: 'border-box',
        ...sx,
      }}
    >
      {/* ── Text content ── */}
      <Box sx={{ flex: 1, minWidth: 0, mr: 1.5 }}>
        <Typography sx={{
          fontSize: '0.65rem', fontWeight: 800, letterSpacing: 1.2,
          textTransform: 'uppercase', color: alertColor.label,
          lineHeight: 1,
        }}>
          {alert.label}
        </Typography>
        <Typography sx={{
          fontSize: '0.9rem', fontWeight: 700, color: '#fff',
          lineHeight: 1.3, mt: 0.25,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {alert.title}
        </Typography>
        <Typography sx={{
          fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)',
          lineHeight: 1.2, mt: 0.15,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {alert.subtitle}
        </Typography>
      </Box>

      {/* ── CTA button ── */}
      <ButtonBase
        onClick={(e) => onCtaTap(e, alert)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          px: 2, py: 0.75, borderRadius: '14px',
          backgroundColor: alertColor.ctaBg,
          color: '#fff', fontSize: '0.8rem', fontWeight: 700,
          flexShrink: 0,
          '&:hover': { opacity: 0.9 },
        }}
      >
        {alert.ctaIcon}
        {alert.ctaLabel}
      </ButtonBase>

      {/* ── Dot indicators (elongated active dot) ── */}
      {showIndicators && (
        <Box sx={{
          position: 'absolute', bottom: 10, right: 16,
          display: 'flex', gap: '5px', alignItems: 'center',
        }}>
          {alerts.map((a, i) => (
            <Box
              key={i}
              sx={{
                height: 6,
                width: i === activeIndex ? 18 : 6,
                borderRadius: i === activeIndex ? '3px' : '50%',
                backgroundColor: i === activeIndex
                  ? (a.color?.dot || 'var(--color-error)')
                  : 'rgba(255,255,255,0.25)',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          ))}
        </Box>
      )}

      {/* ── Progress bar ── */}
      {showIndicators && !paused && (
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
    </Box>
  );
}

export default DynamicIslandPill;
