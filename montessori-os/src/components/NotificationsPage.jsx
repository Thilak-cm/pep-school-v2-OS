import React, { useEffect, useState, useRef } from 'react';
import { keyframes } from '@emotion/react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  CircularProgress,
  Divider,
  Avatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Dialog,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  Button,
  Skeleton,
  IconButton,
  Tooltip,
  Popover
} from '@mui/material';
import {
  ErrorOutline,
  CheckCircleOutline,
  ExpandMore as ExpandMoreIcon,
  AutoAwesome,
  FlagRounded,
  WarningAmber as WarningIcon,
  CheckCircle,
  InfoOutlined,
  TrendingUp,
  RemoveCircleOutline,
  TrendingDown
} from '@mui/icons-material';
import { collectionGroup, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, cloudFunctions } from '../firebase';
import { prepareNotificationsFeature } from '../utils/notificationsFeature';
import { getIstIsoWeekKey } from '../utils/weekKey';
import { BASEBALL_CARD_DEFAULTS } from '../../../config/baseballCardConstants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

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

function ConfettiAnimation({ count = 50, small = false }) {
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
  } catch (err) {
    console.warn(`Failed to read ${dataType} cache`, err);
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
        // Ignore secondary failures
      }
      console.warn('Notifications cache disabled: storage quota exceeded');
      return;
    }
    console.error(`Failed to write ${dataType} cache`, error);
  }
};

// Clear all notifications cache (for logout/login invalidation)
export const clearNotificationsCache = () => {
  if (typeof window === 'undefined' || !window?.localStorage) return;
  try {
    Object.keys(window.localStorage).forEach(k => {
      if (k.startsWith(CACHE_KEY_PREFIX)) {
        window.localStorage.removeItem(k);
      }
    });
  } catch (err) {
    console.warn('Failed to clear notifications cache', err);
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
  const isSuperAdmin = currentRole === 'superadmin';

  // Baseball card expansion state
  const [expandedStudentId, setExpandedStudentId] = useState(null);
  const [baseballCardData, setBaseballCardData] = useState({});
  const [baseballCardLoading, setBaseballCardLoading] = useState({});
  const [baseballCardError, setBaseballCardError] = useState({});
  const [baseballCardConfig, setBaseballCardConfig] = useState({ ...BASEBALL_CARD_DEFAULTS });
  const [signalsDataMap, setSignalsDataMap] = useState({});
  const [regenRunning, setRegenRunning] = useState({});
  const [regenError, setRegenError] = useState({});
  const [reloadKeys, setReloadKeys] = useState({});
  const [flagAnchorEl, setFlagAnchorEl] = useState(null);
  const [missingDomainsAnchorEl, setMissingDomainsAnchorEl] = useState(null);
  const [showCoverageConfetti, setShowCoverageConfetti] = useState(false);
  const coverageConfettiTimerRef = useRef(null);
  const summaryScrollRef = useRef(null);
  const [showScrollFade, setShowScrollFade] = useState(false);
  const [expandedClassrooms, setExpandedClassrooms] = useState(new Set());
  const [expandedFlagTypes, setExpandedFlagTypes] = useState(new Set());

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
      } catch (err) {
        console.warn('Failed to load baseball card config', err);
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
        const classroomsSnap = await getDocs(query(collection(db, 'classrooms')));
        if (!active) return;
        const teacherClassrooms = classroomsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .filter((c) => (c.status || 'active') !== 'archived')
          .filter((c) => Array.isArray(c.teacherIds) && c.teacherIds.includes(uid))
          .map((c) => c.id);

        setAccessibleClassrooms(teacherClassrooms);
        setAccessLoaded(true);
      } catch (err) {
        console.warn('Failed to load access scope', err);
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
          } catch (e) {
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
      } catch (err) {
        console.error('Failed to load signals', err);
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
    } catch (err) {
      console.error(`Error loading baseball card for student ${studentId}`, err);
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

  const isLoading = !accessLoaded || loading;

  const sortBySeverityEvidence = (a, b) => {
    const sevDiff = (b.severityScore || 0) - (a.severityScore || 0);
    if (sevDiff !== 0) return sevDiff;
    return (b.evidenceCount || 0) - (a.evidenceCount || 0);
  };

  const escalatedList = signals.filter((s) => s.escalatedThisWeek).sort(sortBySeverityEvidence);
  const improvedList = signals.filter((s) => s.improvedThisWeek).sort(sortBySeverityEvidence);
  const stillOpenList = signals
    .filter((s) => !s.escalatedThisWeek && !s.improvedThisWeek && (s.severityScore || 0) > 0)
    .sort(sortBySeverityEvidence);

  const severityCounts = escalatedList.reduce((acc, s) => {
    const key = s.severity || 'clear';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { low: 0, medium: 0, high: 0, clear: 0 });

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
    const coverageTone = coverageCount === 0 ? 'balanced' : coverageCount > 4 ? 'alert' : 'warning';
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
        aria-label={
          coverageTone === 'balanced'
            ? 'View coverage details'
            : `View ${coverageCount} missing domains`
        }
      >
        {coverageTone === 'balanced' ? 'Coverage balanced' : `Missing domains: ${coverageCount}`}
      </Button>
    );
  };

  // Render baseball card body for a student
  const renderBaseballCardBody = (studentId) => {
    const cardData = baseballCardData[studentId];
    const cardLoading = baseballCardLoading[studentId];
    const cardError = baseballCardError[studentId];
    const cardWindowDays = Number.isFinite(baseballCardConfig?.windowDays) ? baseballCardConfig.windowDays : BASEBALL_CARD_DEFAULTS.windowDays;
    const cardWindowWeeks = Math.max(1, Math.round(cardWindowDays / 7));
    const cardNoteCount = cardData?.noteCount;
    const cardStatus = cardData?.status || null;
    const isNoNotes = cardStatus === 'no_notes' || cardNoteCount === 0;
    const studentLabel = getStudentName(studentId);

    if (cardLoading) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            py: 4,
            mt: 1
          }}
        >
          <CircularProgress
            size={40}
            sx={{
              color: '#4f46e5',
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
              }
            }}
          />
          <Typography variant="body1" sx={{ color: '#64748b', textAlign: 'center' }}>
            Coach Pepper is preparing {studentLabel}'s snapshot...
          </Typography>
        </Box>
      );
    }

    if (cardError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ErrorOutline fontSize="small" color="error" />
            <Typography variant="body2" color="error">
              {cardError}
            </Typography>
          </Stack>
        </Box>
      );
    }

    if (!cardData) {
      return (
        <Typography variant="body2" color="text.secondary">
          No summary available yet. The nightly job will generate it automatically.
        </Typography>
      );
    }

    if (isNoNotes) {
      return (
        <Typography variant="body2" color="error">
          No notes have been logged for {studentLabel} in the past {cardWindowWeeks} weeks.
        </Typography>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
        {cardData.summary ? (
          <Typography
            variant="body2"
            sx={{
              color: '#334155',
              whiteSpace: 'pre-line',
            }}
          >
            {cardData.summary}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No summary returned.
          </Typography>
        )}
      </Box>
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

  // Render baseball card modal
  const renderBaseballCardModal = () => {
    if (!expandedStudentId) return null;

    const studentId = expandedStudentId;
    const studentName = getStudentName(studentId);
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
        const call = httpsCallable(cloudFunctions, 'regenerateBaseballCardForStudent');
        await call({ studentId });
        setReloadKeys(prev => ({ ...prev, [studentId]: (prev[studentId] || 0) + 1 }));
        // Reload the data with force reload
        await loadBaseballCardForStudent(studentId, true);
      } catch (e) {
        console.error('Regenerate failed', e);
        setRegenError(prev => ({ ...prev, [studentId]: e?.message || 'Failed to regenerate.' }));
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
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 2,
              maxHeight: '90vh',
              m: { xs: 1, sm: 2 },
              display: 'flex',
              flexDirection: 'column'
            }
          }}
        >
          <DialogContent sx={{ pt: 3, pb: 2, position: 'relative', flex: 1, overflow: 'auto' }}>
            <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}>
              {getSeverityChip(studentId)}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap', position: 'relative' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                  <Avatar sx={{ bgcolor: '#6366f1', width: 48, height: 48 }}>
                    <AutoAwesome />
                  </Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 700 }}>
                      {studentName}'s
                    </Typography>
                    <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 700 }}>
                      Snapshot
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                      {Number.isFinite(cardNoteCount) ? cardNoteCount : '—'} notes over last {cardWindowDays} days
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      {renderCoverageRow(studentId)}
                    </Box>
                  </Box>
                </Box>
              </Box>

              <Box sx={{ position: 'relative', minHeight: 200, flex: 1 }}>
                <Box
                  ref={summaryScrollRef}
                  onScroll={updateScrollFade}
                  sx={{ overflowY: 'auto', pr: 1, pb: 6, maxHeight: '50vh' }}
                  aria-label="Student summary (scroll for more)"
                >
                  {renderBaseballCardBody(studentId)}
                </Box>
                {showScrollFade && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 56,
                      pointerEvents: 'none',
                      background:
                        'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 55%, rgba(255,255,255,1) 100%)',
                    }}
                  />
                )}
              </Box>

              {isSuperAdmin && regenError[studentId] && (
                <Typography variant="body2" color="error">
                  {regenError[studentId]}
                </Typography>
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ flexDirection: 'column', gap: 1, p: 2, pt: 1 }}>
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
                  console.error('Failed to navigate to student dashboard', err);
                }
                setExpandedStudentId(null);
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              View Dashboard
            </Button>
            {isSuperAdmin && (
              <Button
                variant="outlined"
                fullWidth
                disabled={regenRunning[studentId] || !studentId}
                onClick={handleRegenerate}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                {regenRunning[studentId] ? 'Regenerating…' : 'Regenerate'}
              </Button>
            )}
            <Button
              variant="text"
              fullWidth
              onClick={() => setExpandedStudentId(null)}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Close
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
            <Stack spacing={1.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1e293b' }}>
                Coach Pepper's Weekly Report
              </Typography>
              
              {/* Compact Severity Breakdown */}
              <Card sx={{ borderRadius: 1.5, border: '1px solid #e2e8f0', backgroundColor: 'white' }}>
                <CardContent sx={{ p: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5, color: '#1e293b', fontSize: '0.875rem' }}>
                    Severity Breakdown
                  </Typography>
                  <Stack direction="row" spacing={2} alignItems="center">
                    {/* Compact Donut Chart */}
                    <Box sx={{ width: 120, height: 120, flexShrink: 0, position: 'relative' }}>
                      {(() => {
                        const chartData = [
                          { name: 'High', value: severityCounts.high || 0, color: '#dc2626' },
                          { name: 'Medium', value: severityCounts.medium || 0, color: '#f59e0b' },
                          { name: 'Low', value: severityCounts.low || 0, color: '#94a3b8' },
                          { name: 'Clear', value: severityCounts.clear || 0, color: '#22c55e' },
                        ];
                        const filteredData = chartData.filter(item => item.value > 0);
                        const total = chartData.reduce((sum, item) => sum + item.value, 0);

                        if (total === 0) {
                          return (
                            <Box sx={{ 
                              width: '100%', 
                              height: '100%', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              flexDirection: 'column',
                              gap: 0.5
                            }}>
                              <CheckCircleOutline sx={{ fontSize: 32, color: '#e2e8f0' }} />
                              <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                                No escalations
                              </Typography>
                            </Box>
                          );
                        }

                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={filteredData}
                                cx="50%"
                                cy="50%"
                                innerRadius={35}
                                outerRadius={50}
                                paddingAngle={filteredData.length > 1 ? 2 : 0}
                                dataKey="value"
                                startAngle={90}
                                endAngle={-270}
                              >
                                {filteredData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 6,
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                  padding: '8px 12px'
                                }}
                                formatter={(value) => [value, 'Students']}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        );
                      })()}
                    </Box>

                    {/* Compact Legend */}
                    <Stack spacing={1} sx={{ flex: 1 }}>
                      {[
                        { key: 'high', label: 'High', color: '#dc2626', count: severityCounts.high || 0 },
                        { key: 'medium', label: 'Medium', color: '#f59e0b', count: severityCounts.medium || 0 },
                        { key: 'low', label: 'Low', color: '#94a3b8', count: severityCounts.low || 0 },
                        { key: 'clear', label: 'Clear', color: '#22c55e', count: severityCounts.clear || 0 },
                      ].map(({ key, label, color, count }) => (
                        <Stack key={key} direction="row" alignItems="center" spacing={1}>
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '2px',
                              backgroundColor: color,
                              flexShrink: 0
                            }}
                          />
                          <Typography variant="caption" sx={{ color: '#64748b', flex: 1, fontSize: '0.75rem' }}>
                            {label}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#1e293b', fontWeight: 600, fontSize: '0.75rem' }}>
                            {count}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>

            <Divider />

            <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem' }}>
              Behavioral Flag Breakdown
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
                      Still Open
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
      )}
    </Box>
  );
}

export default NotificationsPage;
