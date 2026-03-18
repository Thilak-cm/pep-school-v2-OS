import React, { useEffect, useState, useRef } from 'react';
import { keyframes } from '@emotion/react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  CircularProgress,
  Avatar,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Tooltip,
  Popover
} from '@mui/material';
import {
  ErrorOutline,
  CheckCircleOutline,
  ExpandMore as ExpandMoreIcon,
  FlagRounded,
  WarningAmber as WarningIcon,
  Refresh,
  CheckCircle,
  InfoOutlined,
  TrendingUp,
  RemoveCircleOutline,
  TrendingDown
} from '@mui/icons-material';
import { collectionGroup, collection, query, where, orderBy, limit, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, cloudFunctions } from '../firebase';
import { prepareNotificationsFeature } from '../utils/notificationsFeature';
import { getIstIsoWeekKey } from '../utils/weekKey';
import { BASEBALL_CARD_DEFAULTS } from '../../../scripts/config/baseballCardConstants';
import BaseballCardSnapshotCard from './BaseballCardSnapshotCard';
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { friendlyFunctionError } from '../utils/cloudFunctionErrors';

// Confetti animation for coverage celebration
const confettiFallSmall = keyframes`
  0% {
    transform: translateY(-20px) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(200px) rotate(360deg);
    opacity: 0;
  }
`;

const confettiColors = ['#4f46e5', '#059669', '#f59e0b', '#db2777', '#3b82f6', '#8b5cf6'];

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
          width,
          height,
          rotation: Math.random() * 360,
        };
      }),
    [count]
  );

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      {particles.map((particle) => (
        <Box
          key={particle.id}
          sx={{
            position: 'absolute',
            left: particle.left,
            top: '-10px',
            width: particle.width,
            height: particle.height,
            backgroundColor: particle.color,
            borderRadius: '2px',
            transform: `rotate(${particle.rotation}deg)`,
            animation: `${confettiFallSmall} ${particle.duration}s ease-out ${particle.delay}s forwards`,
          }}
        />
      ))}
    </Box>
  );
}

// Cache configuration
const CACHE_KEY_PREFIX = 'notificationsPageCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Build cache key for user
const buildCacheKey = (uid, weekKey, role, accessibleClassrooms = []) => {
  const scopeKey = Array.isArray(accessibleClassrooms) && accessibleClassrooms.length
    ? accessibleClassrooms.slice().sort().join('|')
    : 'all';
  return `${CACHE_KEY_PREFIX}:${uid || 'anonymous'}:${weekKey || 'current'}:${role || 'unknown'}:${scopeKey}`;
};

// Read cached data
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
  } catch {
    return null;
  }
};

// Write cached data
const setCachedData = (key, dataType, payload) => {
  if (typeof window === 'undefined' || !window?.localStorage || !key) return;
  try {
    const cacheKey = `${key}:${dataType}`;
    const value = JSON.stringify({ timestamp: Date.now(), payload });
    window.localStorage.setItem(cacheKey, value);
  } catch (error) {
    // Handle quota exceeded errors gracefully
    if (error && (error.name === 'QuotaExceededError' || error.code === 22)) {
      try {
        // Try to clear old cache entries
        Object.keys(window.localStorage).forEach(k => {
          if (k.startsWith(CACHE_KEY_PREFIX)) {
            window.localStorage.removeItem(k);
          }
        });
      } catch (_) {
        reportCaughtError(_, 'NotificationsPage', 'swallow-only try/catch at L162');
      }
      return;
    }
  }
};

// Clear all notifications cache (for logout/login invalidation)
// eslint-disable-next-line react-refresh/only-export-components
export const clearNotificationsCache = () => {
  if (typeof window === 'undefined' || !window?.localStorage) return;
  try {
    Object.keys(window.localStorage).forEach(k => {
      if (k.startsWith(CACHE_KEY_PREFIX)) {
        window.localStorage.removeItem(k);
      }
    });
  } catch (_err) {
    reportCaughtError(_err, 'NotificationsPage', 'swallow-only try/catch at L179');
  }
};

function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signals, setSignals] = useState([]);
  const [studentInfo, setStudentInfo] = useState({});
  const [currentRole, setCurrentRole] = useState(null);
  const [accessibleClassrooms, setAccessibleClassrooms] = useState([]);
  const [accessLoaded, setAccessLoaded] = useState(false);
  const weekKey = getIstIsoWeekKey();

  // Baseball card expansion state
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
  const [expandedClassrooms, setExpandedClassrooms] = useState(new Set());
  const [expandedFlagTypes, setExpandedFlagTypes] = useState(new Set());
  const [studentDobMap, setStudentDobMap] = useState({});

  useEffect(() => {
    prepareNotificationsFeature();
  }, []);

  // Load baseball card config
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
      } catch {
        setBaseballCardConfig({ ...BASEBALL_CARD_DEFAULTS });
      }
    };
    loadConfig();
    return () => { active = false; };
  }, []);

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
            ? userSnap.data().manageableClassrooms.filter(Boolean)
            : [];
          setAccessibleClassrooms(scope);
          setAccessLoaded(true);
          return;
        }

        // Teacher or other roles: derive classrooms by teacher assignment
        const classroomsSnap = await getDocs(query(
          collection(db, 'classrooms'),
          where('teacherIds', 'array-contains', uid)
        ));
        if (!active) return;
        const teacherClassrooms = classroomsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .filter((c) => (c.status || 'active') !== 'archived')
          .map((c) => c.id);

        setAccessibleClassrooms(teacherClassrooms);
        setAccessLoaded(true);
      } catch {
        if (active) {
          setCurrentRole(null);
          setAccessibleClassrooms([]);
          setAccessLoaded(true);
        }
      }
    };

    loadAccessScope();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchDob = async () => {
      if (!expandedStudentId) return;
      try {
        const snap = await getDoc(doc(db, 'students', expandedStudentId));
        if (!active) return;
        const data = snap.exists() ? (snap.data() || {}) : {};
        setStudentDobMap(prev => ({
          ...prev,
          [expandedStudentId]: data.dateOfBirth || data.dob || null
        }));
      } catch {
        if (!active) return;
        setStudentDobMap(prev => ({
          ...prev,
          [expandedStudentId]: null
        }));
      }
    };
    fetchDob();
    return () => { active = false; };
  }, [expandedStudentId]);


  useEffect(() => {
    let active = true;
    const fetchSignals = async () => {
      try {
        const uid = auth?.currentUser?.uid;
        if (!uid) {
          setLoading(false);
          return;
        }
        if (!accessLoaded) return;
        setLoading(true);
        setError('');

        const cacheKey = buildCacheKey(uid, weekKey, currentRole, accessibleClassrooms);
        
        // Try to load from cache first
        const cachedSignals = getCachedData(cacheKey, 'signals');
        const cachedStudentInfo = getCachedData(cacheKey, 'studentInfo');
        
        if (cachedSignals && cachedStudentInfo) {
          setSignals(cachedSignals);
          setStudentInfo(cachedStudentInfo);
          if (active) setLoading(false);
          return;
        }

        // Fetch fresh data
        const signalsQuery = query(
          collectionGroup(db, 'ai_summaries'),
          where('weekKey', '==', weekKey)
        );
        const snapshot = await getDocs(signalsQuery);
        if (!active) return;

        const rows = snapshot.docs
          .filter((d) => d.id === 'signals')
          .map((d) => {
            const studentId = d.ref.parent?.parent?.id || null;
            const data = d.data() || {};
            return {
              id: d.id,
              studentId,
              ...data,
              severity: data.severity || 'clear',
              severityScore: Number.isFinite(data.severityScore) ? data.severityScore : 0,
              evidenceCount: Number.isFinite(data.evidenceCount) ? data.evidenceCount : (Number.isFinite(data.noteCount) ? data.noteCount : 0),
            };
          });
        
        // Fetch student info for display and scoping
        const ids = rows.map((r) => r.studentId).filter(Boolean);
        const uniqueIds = Array.from(new Set(ids));
        const nameEntries = await Promise.all(uniqueIds.map(async (sid) => {
          try {
            const sSnap = await getDoc(doc(db, 'students', sid));
            if (!sSnap.exists()) return [sid, { name: sid, classroomId: '' }];
            const s = sSnap.data() || {};
            const label = s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || sid;
            return [sid, { name: label, classroomId: s.classroomId || '' }];
          } catch {
            return [sid, { name: sid, classroomId: '' }];
          }
        }));
        const studentInfoMap = Object.fromEntries(nameEntries);
        
        // Apply classroom scoping for non-superadmin roles
        const isSuperAdmin = currentRole === 'superadmin';
        let filteredSignals = rows;
        if (!isSuperAdmin) {
          const scopedClassrooms = Array.isArray(accessibleClassrooms) ? accessibleClassrooms : [];
          if (scopedClassrooms.length === 0) {
            filteredSignals = [];
          } else {
            filteredSignals = rows.filter((r) => {
              const classroomId = studentInfoMap[r.studentId]?.classroomId;
              return classroomId && scopedClassrooms.includes(classroomId);
            });
          }
        }

        // Limit student info to filtered signals to keep cache smaller
        const allowedIds = new Set(filteredSignals.map((s) => s.studentId).filter(Boolean));
        const filteredStudentInfo = Object.fromEntries(
          Object.entries(studentInfoMap).filter(([sid]) => allowedIds.has(sid))
        );

        // Cache scoped results
        setCachedData(cacheKey, 'signals', filteredSignals);
        setCachedData(cacheKey, 'studentInfo', filteredStudentInfo);

        setSignals(filteredSignals);
        setStudentInfo(filteredStudentInfo);
      } catch {
        setError('Failed to load notifications.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchSignals();
    return () => { active = false; };
  }, [weekKey, accessLoaded, currentRole, accessibleClassrooms]);

  // Load baseball card data for a student
  const loadBaseballCardForStudent = React.useCallback(async (studentId, forceReload = false) => {
    if (!studentId) return;
    
    // Skip if already loaded and not forcing reload, unless currently loading
    if (!forceReload && baseballCardData[studentId] !== undefined && !baseballCardLoading[studentId]) {
      return;
    }

    // Skip if already loading
    if (baseballCardLoading[studentId]) {
      return;
    }

    setBaseballCardLoading(prev => ({ ...prev, [studentId]: true }));
    setBaseballCardError(prev => ({ ...prev, [studentId]: '' }));

    try {
      const cardRef = doc(db, 'students', studentId, 'ai_summaries', 'baseball_card');
      const signalsRef = doc(db, 'students', studentId, 'ai_summaries', 'signals');
      const [cardSnap, signalsSnap] = await Promise.all([getDoc(cardRef), getDoc(signalsRef)]);

      setBaseballCardData(prev => ({
        ...prev,
        [studentId]: cardSnap.exists() ? { id: cardSnap.id, ...cardSnap.data() } : null
      }));

      setSignalsDataMap(prev => ({
        ...prev,
        [studentId]: signalsSnap.exists() ? { id: signalsSnap.id, ...signalsSnap.data() } : null
      }));
    } catch {
      setBaseballCardError(prev => ({ ...prev, [studentId]: 'Failed to load the baseball card.' }));
    } finally {
      setBaseballCardLoading(prev => ({ ...prev, [studentId]: false }));
    }
  }, [baseballCardData, baseballCardLoading]);

  // Load data when a card is expanded
  useEffect(() => {
    if (expandedStudentId) {
      const reloadKey = reloadKeys[expandedStudentId] || 0;
      loadBaseballCardForStudent(expandedStudentId, reloadKey > 0);
    }
  }, [expandedStudentId, reloadKeys, loadBaseballCardForStudent]);

  // Cleanup confetti timer on unmount
  useEffect(() => {
    return () => {
      if (coverageConfettiTimerRef.current) {
        clearTimeout(coverageConfettiTimerRef.current);
      }
    };
  }, []);

  // Update scroll fade effect
  const updateScrollFade = React.useCallback(() => {
    const el = summaryScrollRef.current;
    if (!el) return;
    const canScroll = el.scrollHeight - el.clientHeight > 4;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setShowScrollFade(canScroll && !atBottom);
  }, []);

  useEffect(() => {
    if (expandedStudentId) {
      // Small delay to ensure DOM is updated
      const timer = setTimeout(() => {
        updateScrollFade();
      }, 100);
      window.addEventListener('resize', updateScrollFade);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateScrollFade);
      };
    }
  }, [expandedStudentId, updateScrollFade, baseballCardData, baseballCardLoading]);

  useEffect(() => {
    if (!expandedStudentId) {
      setRegenDialogOpen(false);
    }
  }, [expandedStudentId]);

  useEffect(() => {
    let active = true;
    const fetchNotesSinceGenerated = async () => {
      if (!regenDialogOpen || !expandedStudentId) {
        if (active) {
          setNotesSinceGenerated(null);
          setNotesSinceGeneratedLoading(false);
        }
        return;
      }

      const cardData = baseballCardData[expandedStudentId];
      const generatedAtDate = toDate(cardData?.generatedAt);
      if (!generatedAtDate) {
        if (active) {
          setNotesSinceGenerated(null);
          setNotesSinceGeneratedLoading(false);
        }
        return;
      }

      if (active) {
        setNotesSinceGeneratedLoading(true);
      }

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
          } catch {
            if (active) setNotesSinceGenerated(null);
          }
        } else if (active) {
          setNotesSinceGenerated(null);
        }
      } finally {
        if (active) setNotesSinceGeneratedLoading(false);
      }
    };

    fetchNotesSinceGenerated();
    return () => { active = false; };
  }, [expandedStudentId, baseballCardData, regenDialogOpen]);

  const isLoading = !accessLoaded || loading;

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
    if (minutes >= 30) {
      rounded.setHours(rounded.getHours() + 1);
    }
    rounded.setMinutes(0, 0, 0);
    const formatted = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    }).format(rounded);
    return formatted.replace(/\b(am|pm)\b/, (match) => match.toUpperCase());
  };

  const sortBySeverityEvidence = (a, b) => {
    const sevDiff = (b.severityScore || 0) - (a.severityScore || 0);
    if (sevDiff !== 0) return sevDiff;
    return (b.evidenceCount || 0) - (a.evidenceCount || 0);
  };

  const highFlaggedList = signals.filter((s) => s.severity === 'high').sort(sortBySeverityEvidence);
  const escalatedList = signals.filter((s) => s.escalatedThisWeek).sort(sortBySeverityEvidence);
  const improvedList = signals.filter((s) => s.improvedThisWeek).sort(sortBySeverityEvidence);
  const stillOpenList = signals
    .filter((s) => !s.escalatedThisWeek && !s.improvedThisWeek && (s.severityScore || 0) > 0)
    .sort(sortBySeverityEvidence);

  // Helper function to get student name
  const getStudentName = (studentId) => {
    if (!studentId) return 'Student';
    const info = studentInfo[studentId] || {};
    return info.name || studentId;
  };

  // Get severity chip component for a student
  const getSeverityChip = (studentId) => {
    const signalsData = signalsDataMap[studentId];
    const signalsLoading = baseballCardLoading[studentId];
    const signalsStatus = signalsData?.status || null;
    const severity = signalsStatus === 'ok' ? (signalsData?.redFlag?.severity || null) : null;

    if (signalsLoading || signalsStatus !== 'ok') return null;

    const colorMap = {
      high: '#dc2626',
      medium: '#f59e0b',
      med: '#f59e0b',
      low: '#94a3b8',
      none: '#22c55e'
    };

    const paletteColor = colorMap[severity] || colorMap.none;
    const getSeverityLabel = (sev) => {
      if (!sev) return 'No flag';
      if (sev === 'med') return 'Flag: Medium';
      return `Flag: ${sev.charAt(0).toUpperCase()}${sev.slice(1)}`;
    };
    const label = getSeverityLabel(severity);
    const IconComponent = FlagRounded;

    return (
      <Tooltip title={label} arrow>
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            setFlagAnchorEl({ el: e.currentTarget, studentId });
          }}
          sx={{
            width: 40,
            height: 40,
            border: `1px solid ${paletteColor}`,
            color: paletteColor,
            backgroundColor: 'rgba(15, 23, 42, 0.04)',
            '&:hover': {
              backgroundColor: 'rgba(15, 23, 42, 0.08)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }
          }}
          aria-label="View flag details"
        >
          <IconComponent sx={{ fontSize: 22 }} />
        </IconButton>
      </Tooltip>
    );
  };

  // Render coverage row for a student
  const renderCoverageRow = (studentId) => {
    const signalsData = signalsDataMap[studentId];
    const signalsLoading = baseballCardLoading[studentId];
    const signalsStatus = signalsData?.status || null;
    const coverageGaps = Array.isArray(signalsData?.coverageGaps) ? signalsData.coverageGaps : [];
    const coverageCount = coverageGaps.length;
    const hasLanguageGap = coverageGaps.some((gap) => {
      const label = String(gap || '').toLowerCase();
      return label.includes('language') || label.includes('literacy');
    });
    const hasMathGap = coverageGaps.some((gap) => {
      const label = String(gap || '').toLowerCase();
      return label.includes('math') || label.includes('numeracy');
    });
    const coverageTone = coverageCount === 0 ? 'balanced' : (hasLanguageGap || hasMathGap) ? 'alert' : 'warning';
    const coverageButtonLabel = (() => {
      if (coverageCount === 0) return 'Coverage balanced';
      if (hasLanguageGap || hasMathGap) {
        const critical = [];
        if (hasLanguageGap) critical.push('Language');
        if (hasMathGap) critical.push('Math');
        const extraCount = Math.max(0, coverageCount - critical.length);
        if (extraCount > 0) {
          return `${critical.join(', ')} + ${extraCount} more`;
        }
        return `${critical.join(', ')}`;
      }
      return `Missing: ${coverageCount} ${coverageCount === 1 ? 'domain' : 'domains'}`;
    })();
    const cardWindowDays = Number.isFinite(baseballCardConfig?.windowDays) ? baseballCardConfig.windowDays : BASEBALL_CARD_DEFAULTS.windowDays;

    const coveragePalette = {
      balanced: {
        borderColor: '#22c55e',
        hoverBorderColor: '#16a34a',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        hoverBackground: 'rgba(22, 163, 74, 0.12)',
        textColor: '#166534',
        iconColor: '#22c55e',
        title: 'Coverage balanced',
      },
      warning: {
        borderColor: '#f59e0b',
        hoverBorderColor: '#d97706',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        hoverBackground: 'rgba(245, 158, 11, 0.14)',
        textColor: '#92400e',
        iconColor: '#f59e0b',
        title: 'Missing domains',
      },
      alert: {
        borderColor: '#dc2626',
        hoverBorderColor: '#b91c1c',
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
        hoverBackground: 'rgba(220, 38, 38, 0.14)',
        textColor: '#991b1b',
        iconColor: '#dc2626',
        title: 'Missing domains',
      },
    };
    const coverageStyles = coveragePalette[coverageTone];

    if (signalsLoading) {
      return (
        <Typography variant="body2" sx={{ color: '#94a3b8' }}>
          Checking coverage…
        </Typography>
      );
    }
    if (signalsStatus !== 'ok') {
      return (
        <Stack direction="row" alignItems="center" spacing={1}>
          <InfoOutlined sx={{ fontSize: 18, color: '#94a3b8' }} />
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            Coverage pending
          </Typography>
        </Stack>
      );
    }

    const buttonIcon =
      coverageTone === 'balanced' ? (
        <CheckCircle sx={{ fontSize: 18, color: coverageStyles.iconColor }} />
      ) : (
        <WarningIcon sx={{ fontSize: 18, color: coverageStyles.iconColor }} />
      );

    const handleCoverageClick = (e) => {
      e.stopPropagation();
      setMissingDomainsAnchorEl({ el: e.currentTarget, studentId, coverageGaps, coverageTone, coverageStyles, cardWindowDays });
      if (coverageTone === 'balanced') {
        if (coverageConfettiTimerRef.current) {
          clearTimeout(coverageConfettiTimerRef.current);
        }
        setShowCoverageConfetti(true);
        coverageConfettiTimerRef.current = setTimeout(() => setShowCoverageConfetti(false), 2600);
      }
    };

    return (
      <Button
        size="small"
        variant="outlined"
        startIcon={buttonIcon}
        onClick={handleCoverageClick}
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 2,
          borderColor: coverageStyles.borderColor,
          color: coverageStyles.textColor,
          backgroundColor: coverageStyles.backgroundColor,
          px: 1.5,
          '&:hover': {
            borderColor: coverageStyles.hoverBorderColor,
            backgroundColor: coverageStyles.hoverBackground
          }
        }}
        aria-label={coverageButtonLabel}
      >
        {coverageButtonLabel}
      </Button>
    );
  };

  const groupByClassroomAndSeverity = (items) => {
    const grouped = {};
    items.forEach((item) => {
      const info = studentInfo[item.studentId] || {};
      const classroomId = info.classroomId || 'unassigned';
      const severity = item.severity || 'clear';
      if (!grouped[classroomId]) grouped[classroomId] = {};
      if (!grouped[classroomId][severity]) grouped[classroomId][severity] = [];
      grouped[classroomId][severity].push(item);
    });
    return Object.entries(grouped).map(([classroomId, severityGroups]) => ({
      classroomId,
      severityGroups: Object.entries(severityGroups).map(([severity, entries]) => ({
        severity,
        items: entries.sort(sortBySeverityEvidence)
      })).sort((a, b) => {
        // Sort severity: high > medium > low > clear
        const order = { high: 0, medium: 1, med: 1, low: 2, clear: 3 };
        return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
      })
    }));
  };

  const renderGroupedList = (items, emptyMessage) => {
    const groups = groupByClassroomAndSeverity(items);
    if (!groups.length) {
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <CheckCircleOutline sx={{ color: '#22c55e' }} />
          <Typography variant="body2" color="text.secondary">
            {emptyMessage}
          </Typography>
        </Stack>
      );
    }

    const severityColor = (severity) => {
      if (severity === 'high') return 'error';
      if (severity === 'medium') return 'warning';
      if (severity === 'low') return 'default';
      // Treat null/clear as the baseline green flag
      if (severity === 'clear' || !severity) return 'success';
      return 'default';
    };

    const getSeverityLabel = (severity) => {
      if (!severity || severity === 'clear') return 'Clear';
      if (severity === 'med') return 'Medium';
      return severity.charAt(0).toUpperCase() + severity.slice(1);
    };

    const toggleClassroom = (classroomId) => {
      setExpandedClassrooms(prev => {
        const next = new Set(prev);
        if (next.has(classroomId)) {
          next.delete(classroomId);
        } else {
          next.add(classroomId);
        }
        return next;
      });
    };

    const toggleFlagType = (classroomId, severity) => {
      const key = `${classroomId}:${severity}`;
      setExpandedFlagTypes(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    };

    return (
      <Stack spacing={1}>
        {groups.map((group) => {
          const isClassroomExpanded = expandedClassrooms.has(group.classroomId);
          const totalStudents = group.severityGroups.reduce((sum, sg) => sum + sg.items.length, 0);
          
          return (
            <Accordion
              key={group.classroomId}
              expanded={isClassroomExpanded}
              onChange={() => toggleClassroom(group.classroomId)}
              disableGutters
              elevation={0}
              sx={{
                border: '1px solid #e2e8f0',
                borderRadius: 2,
                '&:before': { display: 'none' },
                '&.Mui-expanded': {
                  borderColor: '#cbd5e1',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                }
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 2,
                  py: 1.5,
                  '& .MuiAccordionSummary-content': {
                    m: 0,
                    alignItems: 'center'
                  }
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    Classroom: {group.classroomId}
                  </Typography>
                  <Chip
                    label={totalStudents}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      backgroundColor: '#f1f5f9',
                      color: '#475569'
                    }}
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 2, pb: 2 }}>
                <Stack spacing={1}>
                  {group.severityGroups.map((severityGroup) => {
                    const flagKey = `${group.classroomId}:${severityGroup.severity}`;
                    const isFlagExpanded = expandedFlagTypes.has(flagKey);
                    const severity = severityGroup.severity;
                    
                    return (
                      <Accordion
                        key={flagKey}
                        expanded={isFlagExpanded}
                        onChange={() => toggleFlagType(group.classroomId, severity)}
                        disableGutters
                        elevation={0}
                        sx={{
                          border: '1px solid #e2e8f0',
                          borderRadius: 1.5,
                          '&:before': { display: 'none' },
                          backgroundColor: '#f8fafc'
                        }}
                      >
                        <AccordionSummary
                          expandIcon={<ExpandMoreIcon />}
                          sx={{
                            px: 1.5,
                            py: 1,
                            minHeight: 40,
                            '& .MuiAccordionSummary-content': {
                              m: 0,
                              alignItems: 'center'
                            }
                          }}
                        >
                          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1 }}>
                            <Chip
                              label={`Flag: ${getSeverityLabel(severity)}`}
                              size="small"
                              color={severityColor(severity)}
                              sx={{ fontWeight: 600 }}
                            />
                            <Chip
                              label={severityGroup.items.length}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                backgroundColor: 'white',
                                color: '#475569'
                              }}
                            />
                          </Stack>
                        </AccordionSummary>
                        <AccordionDetails sx={{ px: 1.5, pb: 1.5 }}>
                          <Stack spacing={1}>
                            {severityGroup.items.map((item) => {
                              const info = studentInfo[item.studentId] || {};
                              const displayName = info.name || item.studentId;
                              const isExpanded = expandedStudentId === item.studentId;
                              const handleCardClick = () => {
                                if (isExpanded) {
                                  setExpandedStudentId(null);
                                } else {
                                  setExpandedStudentId(item.studentId);
                                }
                              };
                              return (
                                <Paper
                                  key={`${item.studentId}-${item.generatedAt || item.id}`}
                                  variant="outlined"
                                  onClick={handleCardClick}
                                  sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    borderColor: '#e2e8f0',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-in-out',
                                    '&:hover': {
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                      borderColor: '#cbd5e1',
                                      transform: 'translateY(-1px)'
                                    },
                                    ...(isExpanded && {
                                      borderColor: '#6366f1',
                                      boxShadow: '0 4px 12px rgba(99, 102, 241, 0.15)'
                                    })
                                  }}
                                >
                                  <Stack direction="row" alignItems="center" spacing={1.5}>
                                    <Avatar sx={{ width: 36, height: 36, bgcolor: '#6366f1' }}>
                                      {displayName?.[0]?.toUpperCase?.() || '?'}
                                    </Avatar>
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                                        {displayName}
                                      </Typography>
                                    </Box>
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCardClick();
                                      }}
                                      sx={{
                                        color: '#64748b',
                                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.2s ease-in-out',
                                        flexShrink: 0
                                      }}
                                      aria-label={isExpanded ? 'Collapse card' : 'Expand card'}
                                    >
                                      <ExpandMoreIcon />
                                    </IconButton>
                                  </Stack>
                                </Paper>
                              );
                            })}
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    );
                  })}
                </Stack>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
    );
  };

  const renderHighFlagList = (items) => {
    if (!items.length) {
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <CheckCircleOutline sx={{ color: '#22c55e' }} />
          <Typography variant="body2" color="text.secondary">
            No alerts currently!
          </Typography>
        </Stack>
      );
    }

    return (
      <Stack spacing={1}>
        {items.map((item) => {
          const displayName = getStudentName(item.studentId);
          const reason =
            signalsDataMap[item.studentId]?.redFlag?.reason
            || item?.redFlag?.reason
            || 'High severity flag - review required.';
          const isExpanded = expandedStudentId === item.studentId;
          const handleCardClick = () => {
            if (isExpanded) {
              setExpandedStudentId(null);
            } else {
              setExpandedStudentId(item.studentId);
            }
          };

          return (
            <Paper
              key={`${item.studentId}-${item.generatedAt || item.id}`}
              variant="outlined"
              onClick={handleCardClick}
              sx={{
                p: 1.5,
                borderRadius: 2,
                borderColor: '#e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  borderColor: '#cbd5e1',
                  transform: 'translateY(-1px)'
                },
                ...(isExpanded && {
                  borderColor: '#dc2626',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.15)'
                })
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: '#dc2626' }}>
                  {displayName?.[0]?.toUpperCase?.() || '?'}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                    {displayName}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {reason}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCardClick();
                  }}
                  sx={{
                    color: '#64748b',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease-in-out',
                    flexShrink: 0
                  }}
                  aria-label={isExpanded ? 'Collapse card' : 'Expand card'}
                >
                  <ExpandMoreIcon />
                </IconButton>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    );
  };

  // Render baseball card modal
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
    const severityColor = severity === 'high'
      ? '#dc2626'
      : severity === 'medium' || severity === 'med'
        ? '#f59e0b'
        : severity === 'low'
          ? '#94a3b8'
          : '#22c55e';

    const handleRegenerate = async () => {
      try {
        setRegenError(prev => ({ ...prev, [studentId]: '' }));
        setRegenRunning(prev => ({ ...prev, [studentId]: true }));
        const call = httpsCallable(cloudFunctions, 'regenerateBaseballCardForStudent', { timeout: 300_000 });
        await call({ studentId });
        setReloadKeys(prev => ({ ...prev, [studentId]: (prev[studentId] || 0) + 1 }));
        // Reload the data with force reload
        await loadBaseballCardForStudent(studentId, true);
      } catch (e) {
        setRegenError(prev => ({ ...prev, [studentId]: friendlyFunctionError(e) }));
      } finally {
        setRegenRunning(prev => ({ ...prev, [studentId]: false }));
      }
    };

    const currentFlagAnchor = flagAnchorEl?.studentId === studentId ? flagAnchorEl.el : null;
    const currentMissingDomainsAnchor = missingDomainsAnchorEl?.studentId === studentId ? missingDomainsAnchorEl.el : null;
    const currentCoverageGaps = missingDomainsAnchorEl?.studentId === studentId ? missingDomainsAnchorEl.coverageGaps : [];
    const currentCoverageTone = missingDomainsAnchorEl?.studentId === studentId ? missingDomainsAnchorEl.coverageTone : null;
    const currentCoverageStyles = missingDomainsAnchorEl?.studentId === studentId ? missingDomainsAnchorEl.coverageStyles : null;
    const currentCardWindowDays = missingDomainsAnchorEl?.studentId === studentId ? missingDomainsAnchorEl.cardWindowDays : cardWindowDays;

    return (
      <>
        <Dialog
          open={true}
          onClose={() => setExpandedStudentId(null)}
          maxWidth="sm"
          fullWidth={false}
          PaperProps={{
            sx: {
              backgroundColor: 'transparent',
              boxShadow: 'none',
              border: 'none',
              m: { xs: 1, sm: 2 },
              display: 'flex',
              flexDirection: 'column',
              overflow: 'visible'
            }
          }}
        >
          <DialogContent sx={{ p: 0, position: 'relative', flex: 1, overflow: 'visible' }}>
            <Stack spacing={2} sx={{ width: 'min(560px, 100%)', mx: 'auto' }}>
              <BaseballCardSnapshotCard
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
                minHeight="72vh"
                maxHeight="88vh"
                summaryScrollRef={summaryScrollRef}
                onSummaryScroll={updateScrollFade}
                showScrollFade={showScrollFade}
                footer={(
                  <Stack spacing={1}>
                    <Button
                      variant="contained"
                      fullWidth
                      onClick={() => {
                        try {
                          const info = studentInfo[studentId] || {};
                          window.dispatchEvent(new CustomEvent('navigateToStudentNotes', {
                            detail: {
                              studentId,
                              student: { id: studentId, name: info.name, classroomId: info.classroomId },
                              noteTypeFilter: 'textVoice'
                            }
                          }));
                        } catch (err) {
                          reportCaughtError(err, 'NotificationsPage', 'swallow-only try/catch at L1472');
                        }
                        setExpandedStudentId(null);
                      }}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      View Dashboard
                    </Button>
                    <Button
                      variant="text"
                      fullWidth
                      onClick={() => setExpandedStudentId(null)}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      Close
                    </Button>
                  </Stack>
                )}
              />

              {regenError[studentId] && (
                <Typography variant="body2" color="error">
                  {regenError[studentId]}
                </Typography>
              )}
            </Stack>
          </DialogContent>
        </Dialog>

        <Dialog
          open={regenDialogOpen}
          onClose={() => setRegenDialogOpen(false)}
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 3,
              background: 'linear-gradient(180deg, #eef2ff 0%, #ffffff 55%)',
              border: '1px solid #e2e8f0',
              boxShadow: '0 18px 50px rgba(15, 23, 42, 0.18)'
            }
          }}
        >
          <DialogContent sx={{ pt: 3 }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.08) 70%)',
                    border: '1px solid rgba(99,102,241,0.35)'
                  }}
                >
                  <Refresh sx={{ fontSize: 22, color: '#4f46e5' }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f172a' }}>
                    Regenerate weekly snapshot?
                  </Typography>
                </Box>
              </Stack>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  backgroundColor: '#eef2ff',
                  border: '1px solid rgba(79, 70, 229, 0.2)'
                }}
              >
                <Typography variant="body2" sx={{ color: '#3730a3', fontWeight: 600 }}>
                  Last generated: {formatGeneratedAt(cardData?.generatedAt)}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: '#475569' }}>
                {notesSinceGeneratedLoading
                  ? 'Checking for notes added after this snapshot...'
                  : Number.isFinite(notesSinceGenerated)
                    ? `Regenerating will include ${notesSinceGenerated} new note${notesSinceGenerated === 1 ? '' : 's'} added after this snapshot.`
                    : 'Unable to check for new notes right now.'}
              </Typography>
              {!notesSinceGeneratedLoading && Number.isFinite(notesSinceGenerated) && (
                <Typography variant="body2" sx={{ color: notesSinceGenerated === 0 ? '#dc2626' : '#059669', fontStyle: 'italic' }}>
                  {notesSinceGenerated === 0
                    ? 'Regeneration will not include any additional information, so it may not be necessary.'
                    : 'This will refresh the snapshot with the latest observations and may provide updated insights.'}
                </Typography>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button
              onClick={() => setRegenDialogOpen(false)}
              disabled={regenRunning[studentId]}
              sx={{ textTransform: 'none', color: '#475569' }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={async () => {
                setRegenDialogOpen(false);
                await handleRegenerate();
              }}
              disabled={regenRunning[studentId] || !studentId}
              sx={{
                textTransform: 'none',
                borderRadius: 999,
                px: 3,
                boxShadow: '0 10px 20px rgba(79, 70, 229, 0.25)'
              }}
            >
              {regenRunning[studentId] ? 'Regenerating…' : 'Regenerate'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Flag details popover */}
        <Popover
          open={Boolean(currentFlagAnchor)}
          anchorEl={currentFlagAnchor}
          onClose={() => setFlagAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{ sx: { p: 2, maxWidth: 320 } }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <FlagRounded sx={{ fontSize: 22, color: severityColor }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: severityColor }}>
              {severity ? (severity === 'med' ? 'Flag: Medium' : `Flag: ${severity.charAt(0).toUpperCase()}${severity.slice(1)}`) : 'No active flag'}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: '#334155' }}>
            {severityReason || (severity ? 'No reason provided.' : 'This student currently has no concerns flagged.')}
          </Typography>
        </Popover>

        {/* Coverage details popover */}
        {currentMissingDomainsAnchor && currentCoverageStyles && (
          <Popover
            open={Boolean(currentMissingDomainsAnchor)}
            anchorEl={currentMissingDomainsAnchor}
            onClose={() => {
              setMissingDomainsAnchorEl(null);
              setShowCoverageConfetti(false);
            }}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            PaperProps={{
              sx: {
                p: 2,
                maxWidth: 340,
                border: `1px solid ${currentCoverageStyles.borderColor}`,
              }
            }}
          >
            <Box sx={{ position: 'relative', overflow: 'hidden' }}>
              {currentCoverageTone === 'balanced' && showCoverageConfetti && (
                <ConfettiAnimation count={35} small />
              )}
              <Stack spacing={1.25} sx={{ position: 'relative', zIndex: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  {currentCoverageTone === 'balanced' ? (
                    <CheckCircle sx={{ fontSize: 20, color: currentCoverageStyles.iconColor }} />
                  ) : (
                    <WarningIcon sx={{ fontSize: 20, color: currentCoverageStyles.iconColor }} />
                  )}
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: currentCoverageStyles.textColor }}>
                    {currentCoverageStyles.title}
                  </Typography>
                </Stack>
                {currentCoverageTone === 'balanced' ? (
                  <>
                    <Typography variant="body2" sx={{ color: '#0f172a' }}>
                      Notes in the past {currentCardWindowDays} days have been balanced. Great job keeping coverage even!
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Keep rotating through domains to maintain this streak.
                    </Typography>
                  </>
                ) : (
                  <>
                    <Typography
                      variant="body2"
                      sx={{ color: currentCoverageTone === 'alert' ? '#b91c1c' : '#92400e' }}
                    >
                      {currentCoverageTone === 'warning'
                        ? 'A few domains need attention. Try adding observations in these areas soon.'
                        : 'Many domains are missing. Prioritize observations in these areas this week.'}
                    </Typography>
                    {currentCoverageGaps.length > 0 ? (
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        {currentCoverageGaps.map((gap, idx) => (
                          <Chip key={`missing-domain-${idx}`} label={gap} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Domains list unavailable right now.
                      </Typography>
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {renderBaseballCardModal()}
      {isLoading ? (
        <Box sx={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 'calc(100vh - 220px)',
          flexDirection: 'column',
          gap: 2
        }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">
            Coach Pepper is gathering notifications...
          </Typography>
        </Box>
      ) : (
        <Stack spacing={2}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              backgroundColor: 'white',
              borderRadius: 2,
              border: '1px solid #e2e8f0'
            }}
          >
            {!isLoading && !error && (
              <Stack spacing={2}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem' }}>
                  Red Flag Alerts!
                </Typography>

                {highFlaggedList.length > 0 ? (
                  <Accordion disableGutters elevation={0} sx={{ '&::before': { display: 'none' } }}>
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      sx={{
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        border: '1px solid #fecaca',
                        backgroundColor: '#fef2f2',
                        minHeight: 'auto',
                        '& .MuiAccordionSummary-content': { m: 0 },
                        '& .MuiAccordionSummary-expandIconWrapper': { color: '#b91c1c' }
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%', justifyContent: 'space-between' }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <WarningIcon sx={{ color: '#b91c1c', fontSize: 22 }} />
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#b91c1c' }}>
                            High flags
                          </Typography>
                        </Stack>
                        <Chip
                          size="small"
                          label={`${highFlaggedList.length} students`}
                          sx={{ backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: 600 }}
                        />
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 0 }}>
                      {renderHighFlagList(highFlaggedList)}
                    </AccordionDetails>
                  </Accordion>
                ) : (
                  renderHighFlagList(highFlaggedList)
                )}
              </Stack>
            )}
          </Paper>

          <Paper
            elevation={0}
            sx={{
              p: 3,
              backgroundColor: 'white',
              borderRadius: 2,
              border: '1px solid #e2e8f0'
            }}
          >
            {!isLoading && error && (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                <ErrorOutline color="error" fontSize="small" />
                <Typography variant="body2" color="error">{error}</Typography>
              </Stack>
            )}

            {!isLoading && !error && (
              <Stack spacing={2}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem' }}>
                  Weekly Student Signals Breakdown
                </Typography>

                <Accordion disableGutters elevation={0} sx={{ '&::before': { display: 'none' } }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  border: '1px solid #fecaca',
                  backgroundColor: '#fef2f2',
                  minHeight: 'auto',
                  '& .MuiAccordionSummary-content': { m: 0 },
                  '& .MuiAccordionSummary-expandIconWrapper': { color: '#b91c1c' }
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%', justifyContent: 'space-between' }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <TrendingUp sx={{ color: '#b91c1c', fontSize: 22 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#b91c1c' }}>
                      Escalated
                    </Typography>
                  </Stack>
                  <Chip
                    size="small"
                    label={`${escalatedList.length} students`}
                    sx={{ backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: 600 }}
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                {renderGroupedList(escalatedList, 'No escalations detected this week.')}
              </AccordionDetails>
            </Accordion>

                <Accordion disableGutters elevation={0} sx={{ '&::before': { display: 'none' } }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  border: '1px solid #fde68a',
                  backgroundColor: '#fffbeb',
                  minHeight: 'auto',
                  '& .MuiAccordionSummary-content': { m: 0 },
                  '& .MuiAccordionSummary-expandIconWrapper': { color: '#b45309' }
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%', justifyContent: 'space-between' }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <RemoveCircleOutline sx={{ color: '#b45309', fontSize: 22 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#b45309' }}>
                      No Change
                    </Typography>
                  </Stack>
                  <Chip
                    size="small"
                    label={`${stillOpenList.length} students`}
                    sx={{ backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 600 }}
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                {renderGroupedList(stillOpenList, 'No unchanged flags this week.')}
              </AccordionDetails>
            </Accordion>

                <Accordion disableGutters elevation={0} sx={{ '&::before': { display: 'none' } }}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  border: '1px solid #bbf7d0',
                  backgroundColor: '#f0fdf4',
                  minHeight: 'auto',
                  '& .MuiAccordionSummary-content': { m: 0 },
                  '& .MuiAccordionSummary-expandIconWrapper': { color: '#166534' }
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%', justifyContent: 'space-between' }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <TrendingDown sx={{ color: '#166534', fontSize: 22 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#166534' }}>
                      Improved
                    </Typography>
                  </Stack>
                  <Chip
                    size="small"
                    label={`${improvedList.length} students`}
                    sx={{ backgroundColor: '#dcfce7', color: '#166534', fontWeight: 600 }}
                  />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                {renderGroupedList(improvedList, 'No improvements recorded this week.')}
              </AccordionDetails>
            </Accordion>
              </Stack>
            )}
          </Paper>

        </Stack>
      )}
    </Box>
  );
}

export default NotificationsPage;
