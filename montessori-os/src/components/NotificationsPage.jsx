import React, { useEffect, useState, useRef, useCallback } from 'react';
import { keyframes } from '@emotion/react';
import {
  Box,
  Typography,
  Stack,
  CircularProgress,
  Dialog,
  DialogContent,
  Button,
  IconButton,
  Tooltip,
  Popover,
  InputBase,
  Select,
  MenuItem
} from '@mui/material';
import { Flag as FlagRounded, TriangleAlert as WarningIcon, RefreshCw as Refresh, CircleCheck as CheckCircle, Info as InfoOutlined, Search, ChevronRight, X as CloseIcon } from '../icons';
import MiniTangram from './ui/MiniTangram';
import { collectionGroup, collection, query, where, getDocs, doc, getDoc, documentId, Timestamp, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, cloudFunctions } from '../firebase';
import { prepareNotificationsFeature } from '../utils/notificationsFeature';
import { getIstIsoWeekKey, getPastWeekKeys, weekKeyToMonday } from '../utils/weekKey';
import { BASEBALL_CARD_DEFAULTS } from '../../../scripts/config/baseballCardConstants';
import SnapshotCard from './SnapshotCard';
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { friendlyFunctionError } from '../utils/cloudFunctionErrors';
import { FLAG_SORT_ORDER, flagSortValue, severityToFlag } from '../utils/heatmapUtils.js';
import { useHeatmapCache } from '../hooks/useHeatmapCache.js';
import { transformForDisplay, ALERT_COLORS } from '../utils/alertTransforms';
import { dismissAlert } from '../utils/alertService';

// ── Week label helper ───────────────────────────────────────────────────────

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const weekKeyToLabel = (weekKey) => {
  // Parse "2026-W23" → find the Monday of that ISO week, then derive "MAY W4"
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return weekKey;
  const year = Number(match[1]);
  const week = Number(match[2]);
  // ISO week 1 contains Jan 4; find Monday of week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = (jan4.getUTCDay() + 6) % 7; // Monday=0
  const week1Monday = new Date(jan4.getTime() - dayOfWeek * 86400000);
  const targetMonday = new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
  const month = targetMonday.getUTCMonth();
  // Week of month: which week of this month does this Monday fall in?
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const firstMonday = new Date(firstOfMonth.getTime() + ((8 - firstOfMonth.getUTCDay()) % 7) * 86400000);
  // If firstMonday is after the 7th, the first partial week counts as W1
  let weekOfMonth;
  if (targetMonday < firstMonday) {
    weekOfMonth = 1;
  } else {
    weekOfMonth = Math.floor((targetMonday.getTime() - firstMonday.getTime()) / (7 * 86400000)) + (firstOfMonth.getUTCDay() === 1 ? 1 : 2);
  }
  return `${MONTH_ABBR[month]} W${weekOfMonth}`;
};

// ── Flag palette ────────────────────────────────────────────────────────────

const FLAG_PALETTE = {
  'g': { color: 'var(--color-secondary-light)', label: 'Clear' },
  'b': { color: 'var(--color-info)', label: 'Low' },
  'y': { color: 'var(--color-warning)', label: 'Medium' },
  'r': { color: 'var(--color-error)', label: 'Critical' },
};


// ── Confetti (kept for coverage celebration) ────────────────────────────────

const confettiFallSmall = keyframes`
  0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(200px) rotate(360deg); opacity: 0; }
`;

const confettiColors = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-warning)', 'var(--color-pink-dark)', 'var(--color-info)', 'var(--color-violet)'];

function ConfettiAnimation({ count = 50 }) {
  const particles = React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const isWide = Math.random() > 0.5;
        const width = isWide ? 12 + Math.random() * 8 : 6 + Math.random() * 4;
        const height = isWide ? 6 + Math.random() * 4 : 12 + Math.random() * 8;
        return {
          id: i,
          left: `${Math.random() * 100}%`,
          delay: Math.random() * 2.5,
          duration: 2.5 + Math.random() * 0.5,
          color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
          width, height,
          rotation: Math.random() * 360,
        };
      }),
    [count]
  );

  return (
    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}>
      {particles.map((p) => (
        <Box key={p.id} sx={{
          position: 'absolute', left: p.left, top: '-10px',
          width: p.width, height: p.height, backgroundColor: p.color,
          borderRadius: '2px', transform: `rotate(${p.rotation}deg)`,
          animation: `${confettiFallSmall} ${p.duration}s ease-out ${p.delay}s forwards`,
        }} />
      ))}
    </Box>
  );
}

// ── Cache helpers ───────────────────────────────────────────────────────────

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
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      window.localStorage.removeItem(cacheKey);
      return null;
    }
    return parsed.payload;
  } catch { return null; }
};

const setCachedData = (key, dataType, payload) => {
  if (typeof window === 'undefined' || !window?.localStorage || !key) return;
  try {
    const cacheKey = `${key}:${dataType}`;
    window.localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), payload }));
  } catch (error) {
    if (error && (error.name === 'QuotaExceededError' || error.code === 22)) {
      try {
        Object.keys(window.localStorage).forEach(k => {
          if (k.startsWith(CACHE_KEY_PREFIX)) window.localStorage.removeItem(k);
        });
      } catch (_) { reportCaughtError(_, 'NotificationsPage', 'cache quota cleanup'); }
    }
  }
};

// eslint-disable-next-line react-refresh/only-export-components
export const clearNotificationsCache = () => {
  if (typeof window === 'undefined' || !window?.localStorage) return;
  try {
    Object.keys(window.localStorage).forEach(k => {
      if (k.startsWith(CACHE_KEY_PREFIX)) window.localStorage.removeItem(k);
    });
  } catch (_err) { reportCaughtError(_err, 'NotificationsPage', 'clearNotificationsCache'); }
};

// ── SVG trend glyphs ────────────────────────────────────────────────────────

const TrendGlyph = ({ type }) => {
  const paths = {
    down: 'M2 3.5 L7 6 L11 5 L16 10.5',
    flat: 'M2 7 L6.5 6.4 L11 7.6 L16 7',
    up: 'M2 10.5 L7 8 L11 9 L16 3.5',
  };
  const colors = { down: 'var(--color-error)', flat: 'var(--color-text-faint)', up: 'var(--color-secondary-light)' };
  return (
    <svg viewBox="0 0 18 13" width={15} height={12} style={{ display: 'block', flexShrink: 0 }}>
      <path d={paths[type]} stroke={colors[type]} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
};

// ── Component ───────────────────────────────────────────────────────────────

function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signals, setSignals] = useState([]);
  const [studentInfo, setStudentInfo] = useState({});
  const [currentRole, setCurrentRole] = useState(null);
  const [accessibleClassrooms, setAccessibleClassrooms] = useState([]);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const weekKey = getIstIsoWeekKey();

  // Heatmap cache (PEP-303) — reads from statsCache/heatmap_* docs
  const { heatmapDocs, loading: cacheLoading } = useHeatmapCache({
    role: currentRole, accessibleClassrooms, accessLoaded,
  });

  // Heatmap-specific state
  const [effectiveWeekKey, setEffectiveWeekKey] = useState(weekKey);
  const [weekHistoryMap, setWeekHistoryMap] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredStudentId, setHoveredStudentId] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState('all');
  const [classroomMeta, setClassroomMeta] = useState({});  // { id: { name, color } }

  // Baseball card / modal state
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [baseballCardData, setBaseballCardData] = useState({});
  const [baseballCardLoading, setBaseballCardLoading] = useState({});
  const [baseballCardError, setBaseballCardError] = useState({});
  const [baseballCardConfig, setBaseballCardConfig] = useState({ ...BASEBALL_CARD_DEFAULTS });
  const [signalsDataMap, setSignalsDataMap] = useState({});
  const [regenRunning, setRegenRunning] = useState({});
  const [regenError, setRegenError] = useState({});
  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [notesSinceGenerated, setNotesSinceGenerated] = useState(null);
  const [notesSinceGeneratedLoading, setNotesSinceGeneratedLoading] = useState(false);
  const [reloadKeys, setReloadKeys] = useState({});
  const [flagAnchorEl, setFlagAnchorEl] = useState(null);
  const [missingDomainsAnchorEl, setMissingDomainsAnchorEl] = useState(null);
  const [showCoverageConfetti, setShowCoverageConfetti] = useState(false);
  const coverageConfettiTimerRef = useRef(null);
  const summaryScrollRef = useRef(null);
  const [showScrollFade, setShowScrollFade] = useState(false);
  const [studentDobMap, setStudentDobMap] = useState({});

  // ── Alerts section state ─────────────────────────────────────────────────
  const [alertDocs, setAlertDocs] = useState([]);
  const [alertTab, setAlertTab] = useState('active'); // 'active' | 'history'

  useEffect(() => { prepareNotificationsFeature(); }, []);

  // ── Realtime alerts subscription (all types, not just dip) ──────────────
  useEffect(() => {
    const uid = auth?.currentUser?.uid;
    if (!uid || !accessLoaded) return;

    // Intentionally unscoped: Alerts page shows all types (not just dip=true like useAlertBus).
    // Expired/targeting filters applied client-side. Acceptable while alerts collection is small
    // (~50 docs, weekly cleanup CF). Add server-side filters if collection grows past ~200 docs.
    const alertsQuery = query(collection(db, 'alerts'));
    let cancelled = false;

    const unsub = onSnapshot(alertsQuery, (snapshot) => {
      if (cancelled) return;
      const now = new Date();
      const docs = [];
      snapshot.forEach((d) => {
        const data = { id: d.id, ...(d.data() || {}) };
        // Skip scheduled broadcasts not yet live
        if (data.startsAt && data.startsAt.toDate && data.startsAt.toDate() > now) return;
        // Apply same targeting as DIP
        if (Array.isArray(data.targetRoles) && data.targetRoles.length > 0) {
          if (!currentRole || !data.targetRoles.includes(currentRole)) return;
        }
        if (Array.isArray(data.targetClassrooms) && data.targetClassrooms.length > 0) {
          if (currentRole !== 'superadmin' && (!accessibleClassrooms.length || !data.targetClassrooms.some(c => accessibleClassrooms.includes(c)))) return;
        }
        if (Array.isArray(data.targetTeachers) && data.targetTeachers.length > 0) {
          if (!data.targetTeachers.includes(uid)) return;
        }
        docs.push(data);
      });
      // Sort by priority then createdAt desc
      docs.sort((a, b) => {
        const pa = a.priority ?? 99;
        const pb = b.priority ?? 99;
        if (pa !== pb) return pa - pb;
        const ta = a.createdAt?.seconds || 0;
        const tb = b.createdAt?.seconds || 0;
        return tb - ta;
      });
      setAlertDocs(docs);
    }, () => {
      if (!cancelled) setAlertDocs([]);
    });

    return () => {
      cancelled = true;
      queueMicrotask(() => unsub());
    };
  }, [accessLoaded, currentRole, accessibleClassrooms]);

  // ── Load baseball card config ─────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    const loadConfig = async () => {
      try {
        const ref = doc(db, 'config', 'baseball_card');
        const snap = await getDoc(ref);
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data() || {};
          setBaseballCardConfig({
            model: data.model || BASEBALL_CARD_DEFAULTS.model,
            temperature: Number.isFinite(data.temperature) ? data.temperature : BASEBALL_CARD_DEFAULTS.temperature,
            windowDays: Number.isFinite(data.windowDays) ? data.windowDays : BASEBALL_CARD_DEFAULTS.windowDays,
            timezone: data.timezone || BASEBALL_CARD_DEFAULTS.timezone,
            max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens
          });
        } else {
          setBaseballCardConfig({ ...BASEBALL_CARD_DEFAULTS });
        }
      } catch { setBaseballCardConfig({ ...BASEBALL_CARD_DEFAULTS }); }
    };
    loadConfig();
    return () => { active = false; };
  }, []);

  // ── Load access scope ─────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    const loadAccessScope = async () => {
      try {
        setAccessLoaded(false);
        const uid = auth?.currentUser?.uid;
        if (!uid) {
          setCurrentRole(null);
          setAccessibleClassrooms([]);
          setAccessLoaded(true);
          return;
        }
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (!active) return;
        const role = userSnap.exists() ? (userSnap.data()?.role || null) : null;
        setCurrentRole(role);
        if (role === 'superadmin') {
          setAccessibleClassrooms([]);
          setAccessLoaded(true);
          return;
        }
        if (role === 'classroomadmin') {
          const scope = Array.isArray(userSnap.data()?.manageableClassrooms)
            ? userSnap.data().manageableClassrooms.filter(Boolean) : [];
          setAccessibleClassrooms(scope);
          setAccessLoaded(true);
          return;
        }
        const classroomsSnap = await getDocs(query(collection(db, 'classrooms')));
        if (!active) return;
        const teacherClassrooms = classroomsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .filter((c) => (c.status || 'active') !== 'archived')
          .filter((c) => Array.isArray(c.teacherIds) && c.teacherIds.includes(uid))
          .map((c) => c.id);
        setAccessibleClassrooms(teacherClassrooms);
        setAccessLoaded(true);
      } catch {
        if (active) { setCurrentRole(null); setAccessibleClassrooms([]); setAccessLoaded(true); }
      }
    };
    loadAccessScope();
    return () => { active = false; };
  }, []);

  // ── Fetch classroom metadata (name + color) for the dropdown ──────────────

  useEffect(() => {
    let active = true;
    const loadClassroomMeta = async () => {
      try {
        if (!accessLoaded) return;
        const ids = accessibleClassrooms.length > 0 ? accessibleClassrooms : [];
        let classroomDocs;
        if (ids.length > 0) {
          // Batch fetch in groups of 30 (Firestore 'in' limit)
          const batches = [];
          for (let i = 0; i < ids.length; i += 30) {
            batches.push(getDocs(query(collection(db, 'classrooms'), where(documentId(), 'in', ids.slice(i, i + 30)))));
          }
          const snaps = await Promise.all(batches);
          classroomDocs = snaps.flatMap((s) => s.docs);
        } else if (currentRole === 'superadmin') {
          const snap = await getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active')));
          classroomDocs = snap.docs;
        } else {
          classroomDocs = [];
        }
        if (!active) return;
        const meta = {};
        for (const d of classroomDocs) {
          const data = d.data() || {};
          if ((data.status || 'active') === 'archived') continue;
          meta[d.id] = { name: data.name || d.id, color: data.color || null };
        }
        setClassroomMeta(meta);
      } catch {
        // Non-critical — dropdown will fall back to classroomId strings
      }
    };
    loadClassroomMeta();
    return () => { active = false; };
  }, [accessLoaded, currentRole, accessibleClassrooms]);

  // ── Fetch DOB when modal opens ────────────────────────────────────────────

  useEffect(() => {
    if (!expandedStudentId) return;
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'students', expandedStudentId));
        if (!active) return;
        const data = snap.exists() ? (snap.data() || {}) : {};
        setStudentDobMap(prev => ({ ...prev, [expandedStudentId]: data.dateOfBirth || data.dob || null }));
      } catch {
        if (active) setStudentDobMap(prev => ({ ...prev, [expandedStudentId]: null }));
      }
    })();
    return () => { active = false; };
  }, [expandedStudentId]);

  // ── Build signals + week history from heatmap cache or legacy fetch ───────

  useEffect(() => {
    if (!accessLoaded || cacheLoading) return;

    // ── Fast path: build from heatmap cache docs (PEP-303) ──────────────
    if (heatmapDocs.length > 0) {
      // Use the cache's weekKey (the week it was generated for), not today's
      const cacheWeekKey = heatmapDocs[0].weekKey || weekKey;
      const pastKeys = getPastWeekKeys(5, weekKeyToMonday(cacheWeekKey));
      const allWeekKeys = [...pastKeys, cacheWeekKey];
      const builtSignals = [];
      const builtStudentInfo = {};
      const builtHistoryMap = {};

      for (const cacheDoc of heatmapDocs) {
        const roster = Array.isArray(cacheDoc.roster) ? cacheDoc.roster : [];
        for (const row of roster) {
          const sid = row.studentId;
          builtStudentInfo[sid] = { name: row.displayName, classroomId: row.classroomId };
          builtHistoryMap[sid] = {};
          const weeks = Array.isArray(row.weeks) ? row.weeks : [];
          for (let i = 0; i < allWeekKeys.length; i++) {
            builtHistoryMap[sid][allWeekKeys[i]] = weeks[i] ?? null;
          }
          // Build a minimal signal entry for current-week derived data
          const currentSeverity = weeks[weeks.length - 1] || null;
          if (currentSeverity) {
            builtSignals.push({
              studentId: sid,
              severity: currentSeverity,
              escalatedThisWeek: !!row.escalatedThisWeek,
              improvedThisWeek: !!row.improvedThisWeek,
            });
          }
        }
      }

      setEffectiveWeekKey(cacheWeekKey);
      setSignals(builtSignals);
      setStudentInfo(builtStudentInfo);
      setWeekHistoryMap(builtHistoryMap);
      setLoading(false);
      return;
    }

    // ── Legacy path: direct Firestore reads (fallback when cache empty) ──
    let active = true;
    const fetchSignals = async () => {
      try {
        const uid = auth?.currentUser?.uid;
        if (!uid) { setLoading(false); return; }
        setLoading(true);
        setError('');

        const cacheKey = buildCacheKey(uid, weekKey, currentRole, accessibleClassrooms);

        // Try localStorage cache
        const cachedSignals = getCachedData(cacheKey, 'signals');
        const cachedStudentInfo = getCachedData(cacheKey, 'studentInfo');
        const cachedWeekHistory = getCachedData(cacheKey, 'weekHistory');

        if (cachedSignals && cachedStudentInfo && cachedWeekHistory) {
          setSignals(cachedSignals);
          setStudentInfo(cachedStudentInfo);
          setWeekHistoryMap(cachedWeekHistory);
          if (active) setLoading(false);
          return;
        }

        const isPrivileged = currentRole === 'superadmin' || currentRole === 'classroomadmin';

        let filteredSignals;
        let filteredStudentInfo;

        if (isPrivileged) {
          const signalsQuery = query(
            collectionGroup(db, 'ai_summaries'),
            where('weekKey', '==', weekKey)
          );
          const snapshot = await getDocs(signalsQuery);
          if (!active) return;

          const rows = snapshot.docs
            .filter((d) => d.id === 'weekly_snapshot')
            .map((d) => {
              const studentId = d.ref.parent?.parent?.id || null;
              const data = d.data() || {};
              return {
                id: d.id, studentId, ...data,
                severity: data.severity || 'clear',
                severityScore: Number.isFinite(data.severityScore) ? data.severityScore : 0,
                evidenceCount: Number.isFinite(data.evidenceCount) ? data.evidenceCount : (Number.isFinite(data.noteCount) ? data.noteCount : 0),
              };
            });

          const uniqueIds = Array.from(new Set(rows.map((r) => r.studentId).filter(Boolean)));
          const nameEntries = await Promise.all(uniqueIds.map(async (sid) => {
            try {
              const sSnap = await getDoc(doc(db, 'students', sid));
              if (!sSnap.exists()) return [sid, { name: sid, classroomId: '', status: 'deleted' }];
              const s = sSnap.data() || {};
              const label = s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || sid;
              return [sid, { name: label, classroomId: s.classroomId || '', status: s.status || 'active' }];
            } catch { return [sid, { name: sid, classroomId: '', status: 'active' }]; }
          }));
          const studentInfoMap = Object.fromEntries(nameEntries);

          filteredSignals = currentRole === 'superadmin' ? rows : rows.filter((r) => {
            const cid = studentInfoMap[r.studentId]?.classroomId;
            return cid && accessibleClassrooms.includes(cid);
          });

          filteredSignals = filteredSignals.filter((r) => {
            const info = studentInfoMap[r.studentId];
            return !info || (info.status || 'active') === 'active';
          });

          const coveredClassrooms = Array.from(
            new Set(Object.values(studentInfoMap).map((i) => i.classroomId).filter(Boolean))
          );
          const scopeClassrooms = currentRole === 'classroomadmin'
            ? coveredClassrooms.filter((cid) => accessibleClassrooms.includes(cid))
            : coveredClassrooms;

          if (scopeClassrooms.length > 0) {
            const allStudentSnaps = await Promise.all(
              scopeClassrooms.map((cid) =>
                getDocs(query(collection(db, 'students'), where('classroomId', '==', cid), where('status', '==', 'active')))
              )
            );
            if (!active) return;
            for (const snap of allStudentSnaps) {
              for (const sDoc of snap.docs) {
                if (!studentInfoMap[sDoc.id]) {
                  const s = sDoc.data() || {};
                  const label = s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || sDoc.id;
                  studentInfoMap[sDoc.id] = { name: label, classroomId: s.classroomId || '', status: s.status || 'active' };
                }
              }
            }
          }

          filteredStudentInfo = Object.fromEntries(
            Object.entries(studentInfoMap).filter(([sid]) => {
              const info = studentInfoMap[sid];
              if (!info || (info.status || 'active') !== 'active') return false;
              if (currentRole === 'superadmin') return true;
              return info.classroomId && accessibleClassrooms.includes(info.classroomId);
            })
          );
        } else {
          const scopedClassrooms = Array.isArray(accessibleClassrooms) ? accessibleClassrooms : [];
          if (scopedClassrooms.length === 0) {
            filteredSignals = [];
            filteredStudentInfo = {};
          } else {
            const studentSnaps = await Promise.all(
              scopedClassrooms.map((cid) =>
                getDocs(query(collection(db, 'students'), where('classroomId', '==', cid), where('status', '==', 'active')))
              )
            );
            if (!active) return;

            const studentInfoMap = {};
            const studentIds = [];
            for (const snap of studentSnaps) {
              for (const sDoc of snap.docs) {
                const s = sDoc.data() || {};
                const label = s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || sDoc.id;
                studentInfoMap[sDoc.id] = { name: label, classroomId: s.classroomId || '', status: s.status || 'active' };
                studentIds.push(sDoc.id);
              }
            }

            const rows = await Promise.all(studentIds.map(async (sid) => {
              try {
                const snapRef = doc(db, 'students', sid, 'ai_summaries', 'weekly_snapshot');
                const snap = await getDoc(snapRef);
                if (!snap.exists()) return null;
                const data = snap.data() || {};
                if (data.weekKey !== weekKey) return null;
                return {
                  id: snap.id, studentId: sid, ...data,
                  severity: data.severity || 'clear',
                  severityScore: Number.isFinite(data.severityScore) ? data.severityScore : 0,
                  evidenceCount: Number.isFinite(data.evidenceCount) ? data.evidenceCount : (Number.isFinite(data.noteCount) ? data.noteCount : 0),
                };
              } catch { return null; }
            }));

            filteredSignals = rows.filter(Boolean);
            filteredStudentInfo = studentInfoMap;
          }
        }

        const allowedIds = new Set(Object.keys(filteredStudentInfo));
        const filteredStudentInfoFinal = { ...filteredStudentInfo };

        const pastKeys = getPastWeekKeys(5);
        const historyMap = {};
        for (const sid of allowedIds) {
          historyMap[sid] = {};
        }

        await Promise.all(Array.from(allowedIds).map(async (sid) => {
          try {
            const historyRef = collection(db, 'students', sid, 'ai_summaries', 'weekly_snapshot', 'history');
            const historySnap = await getDocs(query(historyRef, where(documentId(), 'in', pastKeys)));
            for (const hDoc of historySnap.docs) {
              const hData = hDoc.data() || {};
              historyMap[sid][hDoc.id] = hData.status === 'no_notes' ? null : (hData.severity || 'clear');
            }
          } catch {
            // Missing history is expected for new students
          }
        }));

        for (const sig of filteredSignals) {
          if (sig.studentId && historyMap[sig.studentId]) {
            historyMap[sig.studentId][weekKey] = sig.status === 'no_notes' ? null : (sig.severity || 'clear');
          }
        }

        setCachedData(cacheKey, 'signals', filteredSignals);
        setCachedData(cacheKey, 'studentInfo', filteredStudentInfoFinal);
        setCachedData(cacheKey, 'weekHistory', historyMap);

        setSignals(filteredSignals);
        setStudentInfo(filteredStudentInfoFinal);
        setWeekHistoryMap(historyMap);
      } catch (err) {
        reportCaughtError(err, 'NotificationsPage', 'fetchSignals');
        setError('Failed to load alerts.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchSignals();
    return () => { active = false; };
  }, [weekKey, accessLoaded, currentRole, accessibleClassrooms, cacheLoading, heatmapDocs]);

  // ── Load baseball card data for modal ─────────────────────────────────────

  const loadBaseballCardForStudent = useCallback(async (studentId, forceReload = false) => {
    if (!studentId) return;
    if (!forceReload && baseballCardData[studentId] !== undefined && !baseballCardLoading[studentId]) return;
    if (baseballCardLoading[studentId]) return;

    setBaseballCardLoading(prev => ({ ...prev, [studentId]: true }));
    setBaseballCardError(prev => ({ ...prev, [studentId]: '' }));
    try {
      const snapshotRef = doc(db, 'students', studentId, 'ai_summaries', 'weekly_snapshot');
      const snap = await getDoc(snapshotRef);
      const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      setBaseballCardData(prev => ({ ...prev, [studentId]: data }));
      setSignalsDataMap(prev => ({ ...prev, [studentId]: data }));
    } catch {
      setBaseballCardError(prev => ({ ...prev, [studentId]: 'Failed to load the snapshot.' }));
    } finally {
      setBaseballCardLoading(prev => ({ ...prev, [studentId]: false }));
    }
  }, [baseballCardData, baseballCardLoading]);

  useEffect(() => {
    if (expandedStudentId) {
      const reloadKey = reloadKeys[expandedStudentId] || 0;
      loadBaseballCardForStudent(expandedStudentId, reloadKey > 0);
    }
  }, [expandedStudentId, reloadKeys, loadBaseballCardForStudent]);

  // ── Cleanup confetti timer ────────────────────────────────────────────────

  useEffect(() => {
    return () => { if (coverageConfettiTimerRef.current) clearTimeout(coverageConfettiTimerRef.current); };
  }, []);

  // ── Scroll fade for modal ─────────────────────────────────────────────────

  const updateScrollFade = useCallback(() => {
    const el = summaryScrollRef.current;
    if (!el) return;
    const canScroll = el.scrollHeight - el.clientHeight > 4;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setShowScrollFade(canScroll && !atBottom);
  }, []);

  useEffect(() => {
    if (expandedStudentId) {
      const timer = setTimeout(updateScrollFade, 100);
      window.addEventListener('resize', updateScrollFade);
      return () => { clearTimeout(timer); window.removeEventListener('resize', updateScrollFade); };
    }
  }, [expandedStudentId, updateScrollFade, baseballCardData, baseballCardLoading]);

  useEffect(() => {
    if (!expandedStudentId) setRegenDialogOpen(false);
  }, [expandedStudentId]);

  // ── Notes since generated (for regen dialog) ─────────────────────────────

  const toDate = (value) => {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (Number.isFinite(value?.seconds)) return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatGeneratedAt = (value) => {
    const date = toDate(value);
    if (!date) return 'an unknown time';
    const rounded = new Date(date.getTime());
    const minutes = rounded.getMinutes();
    if (minutes >= 30) rounded.setHours(rounded.getHours() + 1);
    rounded.setMinutes(0, 0, 0);
    const formatted = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', hour12: true, timeZone: 'Asia/Kolkata'
    }).format(rounded);
    return formatted.replace(/\b(am|pm)\b/, (match) => match.toUpperCase());
  };

  useEffect(() => {
    let active = true;
    const fetchNotesSinceGenerated = async () => {
      if (!regenDialogOpen || !expandedStudentId) {
        if (active) { setNotesSinceGenerated(null); setNotesSinceGeneratedLoading(false); }
        return;
      }
      const cardData = baseballCardData[expandedStudentId];
      const generatedAtDate = toDate(cardData?.generatedAt);
      if (!generatedAtDate) {
        if (active) { setNotesSinceGenerated(null); setNotesSinceGeneratedLoading(false); }
        return;
      }
      if (active) setNotesSinceGeneratedLoading(true);
      try {
        const observationsQuery = query(
          collectionGroup(db, 'observations'),
          where('studentId', '==', expandedStudentId),
          where('createdAt', '>', Timestamp.fromDate(generatedAtDate)),
          orderBy('createdAt', 'desc'),
          limit(1000)
        );
        const observationsSnap = await getDocs(observationsQuery);
        if (!active) return;
        setNotesSinceGenerated(observationsSnap.docs.length);
      } catch (error) {
        if (error.code === 'failed-precondition' && error.message?.includes('index')) {
          try {
            const fallbackQuery = query(
              collectionGroup(db, 'observations'),
              where('studentId', '==', expandedStudentId),
              orderBy('observedAt', 'desc'),
              limit(200)
            );
            const fallbackSnap = await getDocs(fallbackQuery);
            if (!active) return;
            const count = fallbackSnap.docs.filter((docSnap) => {
              const obs = docSnap.data();
              const obsDate = toDate(obs.observedAt || obs.createdAt || obs.timestamp);
              return obsDate && obsDate > generatedAtDate;
            }).length;
            setNotesSinceGenerated(count);
          } catch { if (active) setNotesSinceGenerated(null); }
        } else if (active) { setNotesSinceGenerated(null); }
      } finally {
        if (active) setNotesSinceGeneratedLoading(false);
      }
    };
    fetchNotesSinceGenerated();
    return () => { active = false; };
  }, [expandedStudentId, baseballCardData, regenDialogOpen]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const isLoading = !accessLoaded || loading;
  const pastKeys = getPastWeekKeys(5, weekKeyToMonday(effectiveWeekKey));
  const allWeekKeys = [...pastKeys, effectiveWeekKey];

  // Trend counts are computed after classroom filter so they reflect the visible set
  const classroomScopedSignals = selectedClassroom === 'all'
    ? signals
    : signals.filter((s) => studentInfo[s.studentId]?.classroomId === selectedClassroom);
  const escalatedCount = classroomScopedSignals.filter((s) => s.escalatedThisWeek).length;
  const improvedCount = classroomScopedSignals.filter((s) => s.improvedThisWeek).length;
  const steadyCount = classroomScopedSignals.length - escalatedCount - improvedCount;

  // Build roster from ALL students (not just those with signals)
  const signalsBySid = {};
  for (const sig of signals) { if (sig.studentId) signalsBySid[sig.studentId] = sig; }

  const rawRoster = Object.keys(studentInfo).map((sid) => {
    const sig = signalsBySid[sid];
    const info = studentInfo[sid] || {};
    const history = weekHistoryMap[sid] || {};
    const weeks = allWeekKeys.map((wk) => {
      const sev = history[wk];
      return sev ? severityToFlag(sev) : null;
    });
    // If current week has no data from history, try the signal
    if (weeks[5] === null && sig && sig.status !== 'no_notes') {
      weeks[5] = severityToFlag(sig.severity);
    }
    const currentFlag = weeks[5] || null;
    return { id: sid, name: info.name || sid, weeks, flag: currentFlag, classroomId: info.classroomId };
  });

  // Hide students with zero data (no history and no current snapshot)
  const activeRoster = rawRoster.filter((s) => s.weeks.some((w) => w !== null));

  // Disambiguate duplicate names by appending classroom
  const nameCounts = {};
  for (const s of activeRoster) { nameCounts[s.name] = (nameCounts[s.name] || 0) + 1; }
  const roster = activeRoster
    .map((s) => nameCounts[s.name] > 1 && s.classroomId
      ? { ...s, displayName: `${s.name} (${s.classroomId})` }
      : { ...s, displayName: s.name }
    )
    .sort((a, b) => {
      // 1. Students with any red flag in past 6 weeks float to top
      const aHasRed = a.weeks.some((w) => w === 'r');
      const bHasRed = b.weeks.some((w) => w === 'r');
      if (aHasRed !== bHasRed) return aHasRed ? -1 : 1;

      // 2. Sort by latest column, then walk backwards through weeks to break ties
      for (let i = 5; i >= 0; i--) {
        const diff = flagSortValue(a.weeks[i]) - flagSortValue(b.weeks[i]);
        if (diff !== 0) return diff;
      }

      return a.displayName.localeCompare(b.displayName);
    });

  const classroomFilteredRoster = selectedClassroom === 'all'
    ? roster
    : roster.filter((s) => s.classroomId === selectedClassroom);

  const filteredRoster = searchQuery.trim()
    ? classroomFilteredRoster.filter((s) => s.displayName.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : classroomFilteredRoster;

  // Derive classroom options from the roster (only classrooms that have students)
  const classroomOptions = (() => {
    const ids = new Set(roster.map((s) => s.classroomId).filter(Boolean));
    return Array.from(ids)
      .map((id) => ({ id, name: classroomMeta[id]?.name || id, color: classroomMeta[id]?.color || null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const getStudentName = (studentId) => (studentInfo[studentId]?.name || studentId);

  // ── Coverage row helper ───────────────────────────────────────────────────

  const renderCoverageRow = (studentId) => {
    const signalsData = signalsDataMap[studentId];
    const signalsLoading = baseballCardLoading[studentId];
    const signalsStatus = signalsData?.status || null;
    const coverageGaps = Array.isArray(signalsData?.coverageGaps) ? signalsData.coverageGaps : [];
    const coverageCount = coverageGaps.length;
    const hasLanguageGap = coverageGaps.some((g) => /language|literacy/i.test(g));
    const hasMathGap = coverageGaps.some((g) => /math|numeracy/i.test(g));
    const coverageTone = coverageCount === 0 ? 'balanced' : (hasLanguageGap || hasMathGap) ? 'alert' : 'warning';
    const coverageButtonLabel = (() => {
      if (coverageCount === 0) return 'Coverage balanced';
      if (hasLanguageGap || hasMathGap) {
        const critical = [];
        if (hasLanguageGap) critical.push('Language');
        if (hasMathGap) critical.push('Math');
        const extraCount = Math.max(0, coverageCount - critical.length);
        return extraCount > 0 ? `${critical.join(', ')} + ${extraCount} more` : critical.join(', ');
      }
      return `Missing: ${coverageCount} ${coverageCount === 1 ? 'domain' : 'domains'}`;
    })();
    const cardWindowDays = Number.isFinite(baseballCardConfig?.windowDays) ? baseballCardConfig.windowDays : BASEBALL_CARD_DEFAULTS.windowDays;
    const palette = {
      balanced: { borderColor: 'var(--color-green-bright)', hoverBorderColor: 'var(--color-green-mid)', backgroundColor: 'rgba(34,197,94,0.1)', hoverBackground: 'rgba(22,163,74,0.12)', textColor: 'var(--color-green-dark)', iconColor: 'var(--color-green-bright)', title: 'Coverage balanced' },
      warning: { borderColor: 'var(--color-warning)', hoverBorderColor: 'var(--color-warning-dark)', backgroundColor: 'rgba(245,158,11,0.1)', hoverBackground: 'rgba(245,158,11,0.14)', textColor: 'var(--color-amber-text)', iconColor: 'var(--color-warning)', title: 'Missing domains' },
      alert: { borderColor: 'var(--color-error)', hoverBorderColor: 'var(--color-error-dark)', backgroundColor: 'rgba(220,38,38,0.1)', hoverBackground: 'rgba(220,38,38,0.14)', textColor: 'var(--color-red-dark)', iconColor: 'var(--color-error)', title: 'Missing domains' },
    };
    const styles = palette[coverageTone];

    if (signalsLoading) return <Typography variant="body2" sx={{ color: 'var(--color-text-faint)' }}>Checking coverage…</Typography>;
    if (signalsStatus !== 'ok') return (
      <Stack direction="row" alignItems="center" spacing={1}>
        <InfoOutlined size={18} style={{ color: 'var(--color-text-faint)' }} />
        <Typography variant="body2" sx={{ color: 'var(--color-text-faint)' }}>Coverage pending</Typography>
      </Stack>
    );

    const buttonIcon = coverageTone === 'balanced'
      ? <CheckCircle size={18} style={{ color: styles.iconColor }} />
      : <WarningIcon size={18} style={{ color: styles.iconColor }} />;

    const handleCoverageClick = (e) => {
      e.stopPropagation();
      setMissingDomainsAnchorEl({ el: e.currentTarget, studentId, coverageGaps, coverageTone, coverageStyles: styles, cardWindowDays });
      if (coverageTone === 'balanced') {
        if (coverageConfettiTimerRef.current) clearTimeout(coverageConfettiTimerRef.current);
        setShowCoverageConfetti(true);
        coverageConfettiTimerRef.current = setTimeout(() => setShowCoverageConfetti(false), 2600);
      }
    };

    return (
      <Button size="small" variant="outlined" startIcon={buttonIcon} onClick={handleCoverageClick}
        sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, borderColor: styles.borderColor, color: styles.textColor, backgroundColor: styles.backgroundColor, px: 1.5, '&:hover': { borderColor: styles.hoverBorderColor, backgroundColor: styles.hoverBackground } }}
        aria-label={coverageButtonLabel}
      >{coverageButtonLabel}</Button>
    );
  };

  // ── Severity chip helper ──────────────────────────────────────────────────

  const getSeverityChip = (studentId) => {
    const signalsData = signalsDataMap[studentId];
    const signalsLoading = baseballCardLoading[studentId];
    const signalsStatus = signalsData?.status || null;
    const severity = signalsStatus === 'ok' ? (signalsData?.redFlag?.severity || null) : null;
    if (signalsLoading || signalsStatus !== 'ok') return null;
    const colorMap = { high: 'var(--color-error)', medium: 'var(--color-warning)', med: 'var(--color-warning)', low: 'var(--color-text-faint)', none: 'var(--color-green-bright)' };
    const paletteColor = colorMap[severity] || colorMap.none;
    const label = severity ? (severity === 'med' ? 'Flag: Medium' : `Flag: ${severity.charAt(0).toUpperCase()}${severity.slice(1)}`) : 'No flag';
    return (
      <Tooltip title={label} arrow>
        <IconButton onClick={(e) => { e.stopPropagation(); setFlagAnchorEl({ el: e.currentTarget, studentId }); }}
          sx={{ width: 40, height: 40, border: `1px solid ${paletteColor}`, color: paletteColor, backgroundColor: 'rgba(15,23,42,0.04)', '&:hover': { backgroundColor: 'rgba(15,23,42,0.08)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}
          aria-label="View flag details"
        ><FlagRounded size={22} /></IconButton>
      </Tooltip>
    );
  };

  // ── Regeneration handler ──────────────────────────────────────────────────

  const handleRegenerate = async (studentId) => {
    try {
      setRegenError(prev => ({ ...prev, [studentId]: '' }));
      setRegenRunning(prev => ({ ...prev, [studentId]: true }));
      const call = httpsCallable(cloudFunctions, 'regenerateBaseballCardForStudent', { timeout: 300_000 });
      await call({ studentId });
      setReloadKeys(prev => ({ ...prev, [studentId]: (prev[studentId] || 0) + 1 }));
      await loadBaseballCardForStudent(studentId, true);
    } catch (e) {
      setRegenError(prev => ({ ...prev, [studentId]: friendlyFunctionError(e) }));
    } finally {
      setRegenRunning(prev => ({ ...prev, [studentId]: false }));
    }
  };

  // ── Render modal ──────────────────────────────────────────────────────────

  const renderBaseballCardModal = () => {
    if (!expandedStudentId) return null;
    const studentId = expandedStudentId;
    const studentName = getStudentName(studentId);
    const studentDob = studentDobMap[studentId] || null;
    const cardData = baseballCardData[studentId];
    const cardLoading = baseballCardLoading[studentId];
    const cardError = baseballCardError[studentId];
    const cardWindowDays = Number.isFinite(baseballCardConfig?.windowDays) ? baseballCardConfig.windowDays : BASEBALL_CARD_DEFAULTS.windowDays;
    const cardNoteCount = cardData?.noteCount;
    const signalsData = signalsDataMap[studentId];
    const signalsStatus = signalsData?.status || null;
    const severity = signalsStatus === 'ok' ? (signalsData?.redFlag?.severity || null) : null;
    const severityReason = signalsStatus === 'ok' ? (signalsData?.redFlag?.reason || null) : null;
    const severityColor = severity === 'high' ? 'var(--color-error)'
      : (severity === 'medium' || severity === 'med') ? 'var(--color-warning)'
      : severity === 'low' ? 'var(--color-text-faint)' : 'var(--color-green-bright)';

    const currentFlagAnchor = flagAnchorEl?.studentId === studentId ? flagAnchorEl.el : null;
    const currentMissingDomainsAnchor = missingDomainsAnchorEl?.studentId === studentId ? missingDomainsAnchorEl.el : null;
    const currentCoverageGaps = missingDomainsAnchorEl?.studentId === studentId ? missingDomainsAnchorEl.coverageGaps : [];
    const currentCoverageTone = missingDomainsAnchorEl?.studentId === studentId ? missingDomainsAnchorEl.coverageTone : null;
    const currentCoverageStyles = missingDomainsAnchorEl?.studentId === studentId ? missingDomainsAnchorEl.coverageStyles : null;
    const currentCardWindowDays = missingDomainsAnchorEl?.studentId === studentId ? missingDomainsAnchorEl.cardWindowDays : cardWindowDays;

    return (
      <>
        {/* Bottom-sheet modal */}
        <Dialog
          open={true}
          onClose={() => setExpandedStudentId(null)}
          maxWidth="sm"
          fullWidth={false}
          PaperProps={{
            sx: {
              m: { xs: 1, sm: 2 },
              width: 'min(560px, calc(100% - 16px))',
              borderRadius: 3,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 18px 50px rgba(15,23,42,0.18)',
            }
          }}
          slotProps={{
            backdrop: { sx: { backgroundColor: 'rgba(15,23,42,0.45)' } }
          }}
        >
          <DialogContent sx={{ p: 0, flex: 1, overflow: 'visible', display: 'flex', flexDirection: 'column' }}>
            <SnapshotCard
              noteCount={cardNoteCount}
              windowDays={cardWindowDays}
              coverage={renderCoverageRow(studentId)}
              topRightActions={getSeverityChip(studentId)}
              onRegenerateClick={() => setRegenDialogOpen(true)}
              regenDisabled={regenRunning[studentId] || !studentId}
              cardData={cardData}
              cardLoading={cardLoading}
              cardError={cardError}
              cardWindowDays={cardWindowDays}
              studentLabel={studentName}
              student={{ id: studentId, dateOfBirth: studentDob }}
              minHeight="60vh"
              maxHeight="88vh"
              summaryScrollRef={summaryScrollRef}
              onSummaryScroll={updateScrollFade}
              showScrollFade={showScrollFade}
              footer={(
                <Stack spacing={1}>
                  <Button variant="contained" fullWidth
                    onClick={() => {
                      try {
                        const info = studentInfo[studentId] || {};
                        window.dispatchEvent(new CustomEvent('navigateToStudentNotes', {
                          detail: { studentId, student: { id: studentId, name: info.name, classroomId: info.classroomId } }
                        }));
                      } catch (err) { reportCaughtError(err, 'NotificationsPage', 'View Dashboard nav'); }
                      setExpandedStudentId(null);
                    }}
                    sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 3, backgroundColor: 'var(--color-primary)', '&:hover': { backgroundColor: 'var(--color-primary-dark)' } }}
                  >View Dashboard</Button>
                  <Button variant="text" fullWidth onClick={() => setExpandedStudentId(null)}
                    sx={{ textTransform: 'none', fontWeight: 600, color: 'var(--color-primary)' }}
                  >Close</Button>
                </Stack>
              )}
            />
            {regenError[studentId] && (
              <Typography variant="body2" color="error" sx={{ px: 2, pb: 1 }}>{regenError[studentId]}</Typography>
            )}
          </DialogContent>
        </Dialog>

        {/* Regeneration confirmation dialog */}
        <Dialog open={regenDialogOpen} onClose={() => setRegenDialogOpen(false)} maxWidth="xs" fullWidth
          PaperProps={{ sx: { borderRadius: 3, background: 'linear-gradient(180deg, var(--color-indigo-bg) 0%, var(--color-paper) 55%)', border: '1px solid var(--color-border)', boxShadow: '0 18px 50px rgba(15,23,42,0.18)' } }}
        >
          <DialogContent sx={{ pt: 3 }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box sx={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.08) 70%)', border: '1px solid rgba(99,102,241,0.35)' }}>
                  <Refresh size={22} style={{ color: 'var(--color-primary)' }} />
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'var(--grey-900)' }}>Regenerate weekly snapshot?</Typography>
              </Stack>
              <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: 'var(--color-indigo-bg)', border: '1px solid rgba(79,70,229,0.2)' }}>
                <Typography variant="body2" sx={{ color: 'var(--color-indigo-deep)', fontWeight: 600 }}>
                  Last generated: {formatGeneratedAt(cardData?.generatedAt)}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: 'var(--grey-600)' }}>
                {notesSinceGeneratedLoading ? 'Checking for notes added after this snapshot...'
                  : Number.isFinite(notesSinceGenerated) ? `Regenerating will include ${notesSinceGenerated} new note${notesSinceGenerated === 1 ? '' : 's'} added after this snapshot.`
                  : 'Unable to check for new notes right now.'}
              </Typography>
              {!notesSinceGeneratedLoading && Number.isFinite(notesSinceGenerated) && (
                <Typography variant="body2" sx={{ color: notesSinceGenerated === 0 ? 'var(--color-error)' : 'var(--color-secondary)', fontStyle: 'italic' }}>
                  {notesSinceGenerated === 0 ? 'Regeneration will not include any additional information, so it may not be necessary.'
                    : 'This will refresh the snapshot with the latest observations and may provide updated insights.'}
                </Typography>
              )}
            </Stack>
          </DialogContent>
          <Box sx={{ px: 3, pb: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={() => setRegenDialogOpen(false)} disabled={regenRunning[studentId]} sx={{ textTransform: 'none', color: 'var(--grey-600)' }}>Cancel</Button>
            <Button variant="contained" disabled={regenRunning[studentId] || !studentId}
              onClick={async () => { setRegenDialogOpen(false); await handleRegenerate(studentId); }}
              sx={{ textTransform: 'none', borderRadius: 999, px: 3, boxShadow: '0 10px 20px rgba(79,70,229,0.25)' }}
            >{regenRunning[studentId] ? 'Regenerating…' : 'Regenerate'}</Button>
          </Box>
        </Dialog>

        {/* Flag details popover */}
        <Popover open={Boolean(currentFlagAnchor)} anchorEl={currentFlagAnchor} onClose={() => setFlagAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ sx: { p: 2, maxWidth: 320 } }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <FlagRounded size={22} style={{ color: severityColor }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: severityColor }}>
              {severity ? (severity === 'med' ? 'Flag: Medium' : `Flag: ${severity.charAt(0).toUpperCase()}${severity.slice(1)}`) : 'No active flag'}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: 'var(--grey-700)' }}>
            {severityReason || (severity ? 'No reason provided.' : 'This student currently has no concerns flagged.')}
          </Typography>
        </Popover>

        {/* Coverage details popover */}
        {currentMissingDomainsAnchor && currentCoverageStyles && (
          <Popover open={Boolean(currentMissingDomainsAnchor)} anchorEl={currentMissingDomainsAnchor}
            onClose={() => { setMissingDomainsAnchorEl(null); setShowCoverageConfetti(false); }}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            PaperProps={{ sx: { p: 2, maxWidth: 340, border: `1px solid ${currentCoverageStyles.borderColor}` } }}
          >
            <Box sx={{ position: 'relative', overflow: 'hidden' }}>
              {currentCoverageTone === 'balanced' && showCoverageConfetti && <ConfettiAnimation count={35} />}
              <Stack spacing={1.25} sx={{ position: 'relative', zIndex: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  {currentCoverageTone === 'balanced'
                    ? <CheckCircle size={20} style={{ color: currentCoverageStyles.iconColor }} />
                    : <WarningIcon size={20} style={{ color: currentCoverageStyles.iconColor }} />}
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: currentCoverageStyles.textColor }}>{currentCoverageStyles.title}</Typography>
                </Stack>
                {currentCoverageTone === 'balanced' ? (
                  <>
                    <Typography variant="body2" sx={{ color: 'var(--grey-900)' }}>
                      Notes in the past {currentCardWindowDays} days have been balanced. Great job keeping coverage even!
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Keep rotating through domains to maintain this streak.</Typography>
                  </>
                ) : (
                  <>
                    <Typography variant="body2" sx={{ color: currentCoverageTone === 'alert' ? 'var(--color-error-dark)' : 'var(--color-amber-text)' }}>
                      {currentCoverageTone === 'warning' ? 'A few domains need attention. Try adding observations in these areas soon.'
                        : 'Many domains are missing. Prioritize observations in these areas this week.'}
                    </Typography>
                    {currentCoverageGaps.length > 0 ? (
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                        {currentCoverageGaps.map((gap, idx) => (
                          <Box key={idx} sx={{ px: 1, py: 0.25, borderRadius: 1, border: '1px solid var(--color-border)', fontSize: '0.75rem', color: 'var(--grey-700)' }}>{gap}</Box>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">Domains list unavailable right now.</Typography>
                    )}
                  </>
                )}
              </Stack>
            </Box>
          </Popover>
        )}
      </>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const WEEK_LABELS = allWeekKeys.map(weekKeyToLabel);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pb: 2 }}>
      {renderBaseballCardModal()}

      {isLoading ? (
        <Box sx={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 220px)', flexDirection: 'column', gap: 2 }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">Loading alerts…</Typography>
        </Box>
      ) : error ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="error">{error}</Typography>
        </Box>
      ) : (
        <>
          {/* ── Search + Classroom filter toolbar ──────────────────────── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Persistent search field */}
            <Box sx={{
              flex: 1,
              display: 'flex', alignItems: 'center', gap: 1,
              backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-border)', borderRadius: '10px',
              px: '11px', py: '8px',
            }}>
              <Search size={14} style={{ color: 'var(--color-text-faint)', flexShrink: 0 }} />
              <InputBase
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Look up a student…"
                fullWidth
                sx={{ fontSize: '12.5px', '& input': { p: 0 } }}
              />
              {searchQuery && (
                <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ p: 0.25 }}>
                  <CloseIcon size={13} />
                </IconButton>
              )}
            </Box>

            {/* Classroom dropdown */}
            {classroomOptions.length > 1 && (
              <Select
                value={selectedClassroom}
                onChange={(e) => setSelectedClassroom(e.target.value)}
                size="small"
                displayEmpty
                renderValue={(value) => {
                  if (value === 'all') return 'All classrooms';
                  const opt = classroomOptions.find((c) => c.id === value);
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {opt?.color && <MiniTangram size={16} color={opt.color} />}
                      <span>{opt?.name || value}</span>
                    </Box>
                  );
                }}
                sx={{
                  minWidth: 160,
                  fontSize: '12.5px',
                  fontWeight: 600,
                  backgroundColor: 'var(--color-paper)',
                  borderRadius: '10px',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--color-border)' },
                  '& .MuiSelect-select': { py: '8px', display: 'flex', alignItems: 'center' },
                }}
              >
                <MenuItem value="all" sx={{ fontSize: '12.5px', fontWeight: 600 }}>
                  All classrooms
                </MenuItem>
                {classroomOptions.map((c) => (
                  <MenuItem key={c.id} value={c.id} sx={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {c.color && <MiniTangram size={16} color={c.color} />}
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            )}
          </Box>

          {/* ── Heatmap card ────────────────────────────────────────────── */}
          <Box sx={{
            backgroundColor: 'var(--color-paper)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            p: '10px',
          }}>
            {/* Card header */}
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
                <Typography sx={{ fontFamily: 'inherit', fontSize: '15px', fontWeight: 700, color: 'var(--grey-900)' }}>
                  Flag pattern
                </Typography>
                <Typography sx={{ fontFamily: 'var(--f-mono, monospace)', fontSize: '9px', letterSpacing: '0.05em', color: 'var(--color-text-faint)', textTransform: 'uppercase' }}>
                  LAST 6 WEEKS
                </Typography>
              </Box>
              <Typography sx={{ fontFamily: 'var(--f-mono, monospace)', fontSize: '9px', color: 'var(--grey-300)' }}>
                {filteredRoster.length}
              </Typography>
            </Box>

            {/* Trend summary */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, mt: 0.5 }}>
              {[
                { count: escalatedCount, label: 'escalated', glyph: 'down' },
                { count: steadyCount, label: 'steady', glyph: 'flat' },
                { count: improvedCount, label: 'improved', glyph: 'up' },
              ].map(({ count, label, glyph }) => (
                <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: '13px', fontWeight: 700, color: 'var(--grey-900)' }}>{count}</Typography>
                  <Typography sx={{ fontSize: '11px', color: 'var(--color-text-soft)' }}>{label}</Typography>
                  <TrendGlyph type={glyph} />
                </Box>
              ))}
            </Box>

            {/* Tap affordance */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, color: 'var(--color-primary-light)' }}>
              <Typography sx={{ fontSize: '10.5px', fontWeight: 600, color: 'var(--color-primary-light)' }}>
                → Tap a student for their weekly snapshot
              </Typography>
            </Box>

            {/* Column headers */}
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: '76px repeat(6, 1fr) 14px',
              gap: '3px',
              mb: 0.5,
            }}>
              <Box />
              {WEEK_LABELS.map((label, idx) => {
                const isLatest = idx === WEEK_LABELS.length - 1;
                return (
                  <Box key={label} sx={{ textAlign: 'center' }}>
                    <Typography sx={{
                      fontFamily: 'var(--f-mono, monospace)', fontSize: '9px',
                      color: isLatest ? 'var(--color-primary)' : 'var(--color-text-faint)',
                      fontWeight: isLatest ? 700 : 400,
                    }}>{label}</Typography>
                  </Box>
                );
              })}
              <Box />
            </Box>

            {/* Roster */}
            <Box sx={{
              display: 'flex', flexDirection: 'column', gap: '2px',
              maxHeight: 188, overflowY: 'auto',
            }}>
              {filteredRoster.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>
                    {searchQuery.trim() ? `No student matches "${searchQuery.trim()}"` : 'No alerts this week.'}
                  </Typography>
                </Box>
              ) : (
                filteredRoster.map((student) => {
                  const isHovered = hoveredStudentId === student.id;
                  return (
                    <Box
                      key={student.id}
                      component="button"
                      onClick={() => setExpandedStudentId(student.id)}
                      onMouseEnter={() => setHoveredStudentId(student.id)}
                      onMouseLeave={() => setHoveredStudentId(null)}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '76px repeat(6, 1fr) 14px',
                        gap: '3px',
                        alignItems: 'center',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderRadius: '6px',
                        p: '3px 2px',
                        backgroundColor: isHovered ? 'var(--color-violet-bg)' : 'transparent',
                        transition: 'background-color 0.15s',
                        width: '100%',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    >
                      {/* Name */}
                      <Typography sx={{
                        fontSize: '11px', fontWeight: 600, color: 'var(--grey-900)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{student.displayName}</Typography>

                      {/* Week cells */}
                      {student.weeks.map((flag, i) => (
                        <Box key={i} sx={{
                          height: 18,
                          borderRadius: '3px',
                          ...(flag ? {
                            backgroundColor: FLAG_PALETTE[flag]?.color || 'var(--color-border)',
                          } : {
                            border: '1px dashed var(--grey-300)',
                            backgroundColor: 'transparent',
                          }),
                        }} />
                      ))}

                      {/* Chevron */}
                      <ChevronRight size={12} style={{
                        color: isHovered ? 'var(--color-primary-light)' : 'var(--grey-300)',
                        transition: 'color 0.15s',
                      }} />
                    </Box>
                  );
                })
              )}
            </Box>

            {/* Legend */}
            <Box sx={{
              display: 'flex', justifyContent: 'space-between', mt: '9px', pt: '9px',
              borderTop: '1px solid var(--color-surface)',
            }}>
              {Object.values(FLAG_PALETTE).map(({ color, label }) => (
                <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 9, height: 9, borderRadius: '2px', backgroundColor: color }} />
                  <Typography sx={{ fontSize: '10px', color: 'var(--grey-900)' }}>{label}</Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* ── Alerts section ──────────────────────────────────────────── */}
          <Box>
            <Typography sx={{ fontFamily: 'inherit', fontSize: '16px', fontWeight: 700, color: 'var(--grey-900)', mb: 1 }}>
              Alerts
            </Typography>

            {/* Tabs (PEP-323c) */}
            {(() => {
              const uid = auth?.currentUser?.uid;
              const now = new Date();
              const isHistory = (doc) => {
                // Expired broadcasts → history
                if (doc.expiresAt && doc.expiresAt.toDate && doc.expiresAt.toDate() < now) return true;
                // Dismissed system/agent alerts → history
                if (['system', 'agent'].includes(doc.type) && uid && doc.dismissedBy?.[uid]) return true;
                return false;
              };
              const activeAlerts = alertDocs.filter(d => !isHistory(d));
              const historyAlerts = alertDocs.filter(d => isHistory(d));
              const filteredAlerts = alertTab === 'active' ? activeAlerts : historyAlerts;

              return (
                <>
                  <Box sx={{
                    display: 'flex', gap: 0,
                    backgroundColor: 'var(--color-surface, #f1f3f7)',
                    borderRadius: '10px', p: '3px', mb: 1.5,
                  }}>
                    {[
                      { key: 'active', label: 'Active', count: activeAlerts.length },
                      { key: 'history', label: 'History', count: historyAlerts.length },
                    ].map(tab => {
                      const isActive = alertTab === tab.key;
                      return (
                        <Box
                          key={tab.key}
                          onClick={() => setAlertTab(tab.key)}
                          sx={{
                            flex: 1, textAlign: 'center', py: 0.7,
                            borderRadius: '8px', cursor: 'pointer',
                            fontSize: '0.8rem', fontWeight: 600,
                            transition: 'all 0.2s ease',
                            ...(isActive
                              ? { backgroundColor: '#fff', color: 'var(--color-text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                              : { color: 'var(--color-text-faint)' }),
                          }}
                        >
                          {tab.label} · {tab.count}
                        </Box>
                      );
                    })}
                  </Box>

                  {filteredAlerts.length === 0 ? (
                    <Box sx={{
                      backgroundColor: 'var(--color-bg)',
                      border: '1px dashed var(--color-border)',
                      borderRadius: '12px',
                      p: '22px 16px',
                      textAlign: 'center',
                    }}>
                      <Typography variant="body2" sx={{ color: 'var(--color-text-faint)' }}>
                        {alertTab === 'active' ? 'All clear — no active alerts' : 'No past alerts'}
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {filteredAlerts.map(alertDoc => {
                  const uid = auth?.currentUser?.uid;
                  const isDismissedByMe = !!(uid && alertDoc.dismissedBy?.[uid]);
                  // Superadmins manage broadcasts — don't show as dismissed even if they acked
                  const isDismissed = isDismissedByMe && !(alertDoc.type === 'broadcast' && currentRole === 'superadmin');
                  const display = transformForDisplay({ id: alertDoc.id, ...alertDoc });
                  const colorSet = ALERT_COLORS[display.colorKey] || ALERT_COLORS.system;
                  const typeBadge = (alertDoc.type || 'alert').toUpperCase();
                  const ackCount = alertDoc.dismissedBy ? Object.keys(alertDoc.dismissedBy).length : 0;
                  const reach = alertDoc.reach || 0;
                  const showAckBar = alertDoc.type === 'broadcast' && currentRole === 'superadmin' && reach > 0;

                  return (
                    <Box
                      key={alertDoc.id}
                      onClick={() => {
                        // System/agent: dismiss on tap
                        if (['system', 'agent'].includes(alertDoc.type) && alertDoc.id && !isDismissed) {
                          dismissAlert(alertDoc.id);
                          // Navigate to broadcast detail if this is a broadcast-complete alert (PEP-323c)
                          if (alertDoc.payload?.broadcastId) {
                            window.dispatchEvent(new CustomEvent('navigateToBroadcastDetail', {
                              detail: { broadcastId: alertDoc.payload.broadcastId },
                            }));
                          }
                        }
                        // Broadcast: superadmins navigate to broadcast detail (PEP-323c)
                        if (alertDoc.type === 'broadcast' && currentRole === 'superadmin' && alertDoc.id) {
                          window.dispatchEvent(new CustomEvent('navigateToBroadcastDetail', {
                            detail: { broadcastId: alertDoc.id },
                          }));
                        }
                      }}
                      sx={{
                        p: 1.5, borderRadius: '12px',
                        border: '1px solid var(--color-border)',
                        backgroundColor: '#fff',
                        opacity: isDismissed ? 0.6 : 1,
                        cursor: (['system', 'agent'].includes(alertDoc.type) && !isDismissed)
                          || (alertDoc.type === 'broadcast' && currentRole === 'superadmin') ? 'pointer' : 'default',
                        '&:active': (['system', 'agent'].includes(alertDoc.type) && !isDismissed)
                          || (alertDoc.type === 'broadcast' && currentRole === 'superadmin') ? { opacity: 0.85 } : {},
                      }}
                    >
                      {/* Meta row */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, flexWrap: 'wrap' }}>
                        <Box sx={{
                          display: 'inline-flex', px: 0.75, py: 0.15, borderRadius: '4px',
                          fontSize: '0.55rem', fontWeight: 800, letterSpacing: 0.8,
                          backgroundColor: `color-mix(in srgb, ${colorSet.label} 12%, transparent)`,
                          color: colorSet.label,
                        }}>
                          {typeBadge}
                        </Box>
                        {isDismissed && (
                          <CheckCircle size={13} style={{ color: 'var(--color-success, #16a34a)' }} />
                        )}
                        <Box sx={{ flex: 1 }} />
                        {alertDoc.expiresAt && (
                          <Typography sx={{ fontSize: '0.6rem', color: 'var(--color-text-faint)' }}>
                            {(() => {
                              const exp = alertDoc.expiresAt.toDate ? alertDoc.expiresAt.toDate() : new Date(alertDoc.expiresAt);
                              const diffMs = exp - new Date();
                              const days = Math.floor(diffMs / 86400000);
                              const hours = Math.floor(diffMs / 3600000);
                              if (days >= 2) return `ends in ${days}d`;
                              if (hours >= 1) return `ends in ${hours}h`;
                              return `ends soon`;
                            })()}
                          </Typography>
                        )}
                      </Box>

                      {/* Title */}
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', mb: 0.15 }}>
                        {display.title}
                      </Typography>

                      {/* Subtitle */}
                      {display.subtitle && (
                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--color-text-soft)', mb: showAckBar ? 0.75 : 0 }}>
                          {display.subtitle}
                        </Typography>
                      )}

                      {/* Ack progress bar (broadcasts, superadmin only) */}
                      {showAckBar && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Box sx={{
                            flex: 1, height: 4, borderRadius: '2px',
                            backgroundColor: 'var(--color-surface, #eef0f4)',
                            overflow: 'hidden',
                          }}>
                            <Box sx={{
                              width: `${Math.min((ackCount / reach) * 100, 100)}%`,
                              height: '100%', borderRadius: '2px',
                              backgroundColor: ackCount >= reach ? 'var(--color-success, #16a34a)' : 'var(--color-primary)',
                            }} />
                          </Box>
                          <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--color-text-soft)', whiteSpace: 'nowrap' }}>
                            {ackCount}/{reach} read
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
                </>
              );
            })()}
          </Box>
        </>
      )}
    </Box>
  );
}

export default NotificationsPage;
