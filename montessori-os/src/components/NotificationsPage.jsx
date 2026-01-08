import React, { useEffect, useState } from 'react';
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
  AccordionDetails
} from '@mui/material';
import {
  ErrorOutline,
  CheckCircleOutline,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { collectionGroup, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { prepareNotificationsFeature } from '../utils/notificationsFeature';
import { getIstIsoWeekKey } from '../utils/weekKey';

// Cache configuration
const CACHE_KEY_PREFIX = 'notificationsPageCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Build cache key for user
const buildCacheKey = (uid, weekKey) => {
  return `${CACHE_KEY_PREFIX}:${uid || 'anonymous'}:${weekKey || 'current'}`;
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
  const [currentRole, setCurrentRole] = useState(null);
  const [studentInfo, setStudentInfo] = useState({});
  const weekKey = getIstIsoWeekKey();

  useEffect(() => {
    prepareNotificationsFeature();
  }, []);

  useEffect(() => {
    let active = true;
    const loadRole = async () => {
      try {
        const uid = auth?.currentUser?.uid;
        if (!uid) return;
        const snap = await getDoc(doc(db, 'users', uid));
        if (!active) return;
        setCurrentRole(snap.exists() ? (snap.data()?.role || null) : null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load user role', err);
      }
    };
    loadRole();
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
        if (currentRole === null) return; // wait for role
        if (currentRole !== 'superadmin') {
          setSignals([]);
          setStudentInfo({});
          setLoading(false);
          return;
        }

        const cacheKey = buildCacheKey(uid, weekKey);
        
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
        
        // Cache signals
        setCachedData(cacheKey, 'signals', rows);
        setSignals(rows);

        // Fetch student info (superadmin only) for display
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
        
        // Cache student info
        setCachedData(cacheKey, 'studentInfo', studentInfoMap);
        setStudentInfo(studentInfoMap);
      } catch (err) {
        console.error('Failed to load signals', err);
        setError('Failed to load notifications.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchSignals();
    return () => { active = false; };
  }, [currentRole, weekKey]);

  const isSuperAdmin = currentRole === 'superadmin';

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

  const groupByClassroom = (items) => {
    const grouped = {};
    items.forEach((item) => {
      const info = studentInfo[item.studentId] || {};
      const classroomId = info.classroomId || 'unassigned';
      if (!grouped[classroomId]) grouped[classroomId] = [];
      grouped[classroomId].push(item);
    });
    return Object.entries(grouped).map(([classroomId, entries]) => ({
      classroomId,
      items: entries.sort(sortBySeverityEvidence)
    }));
  };

  const renderGroupedList = (items, emptyMessage) => {
    const groups = groupByClassroom(items);
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
      return 'default';
    };

    return (
      <Stack spacing={1.5}>
        {groups.map((group) => (
          <Stack key={group.classroomId} spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
              Classroom: {group.classroomId}
            </Typography>
            {group.items.map((item) => {
              const info = studentInfo[item.studentId] || {};
              const displayName = info.name || item.studentId;
              return (
                <Paper
                  key={`${item.studentId}-${item.generatedAt || item.id}`}
                  variant="outlined"
                  sx={{ p: 1.5, borderRadius: 2, borderColor: '#e2e8f0' }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
                    <Avatar sx={{ width: 36, height: 36, bgcolor: '#6366f1' }}>
                      {displayName?.[0]?.toUpperCase?.() || '?'}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 180 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                        {displayName}
                      </Typography>
                      {Array.isArray(item.coverageGaps) && item.coverageGaps.length > 0 && (
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          Gaps: {item.coverageGaps.join(', ')}
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        Evidence: {item.evidenceCount ?? 0}
                      </Typography>
                    </Box>
                    {item.severity && item.severity !== 'clear' && (
                      <Chip
                        label={`Flag: ${item.severity}`}
                        size="small"
                        color={severityColor(item.severity)}
                      />
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        ))}
      </Stack>
    );
  };

  // Show loading state while role is being fetched
  if (currentRole === null) {
    return (
      <Box sx={{
        display: 'flex',
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 320,
        flexDirection: 'column',
        gap: 2
      }}>
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary">
          Coach Pepper is gathering notifications...
        </Typography>
      </Box>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Box sx={{
        display: 'flex',
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 320
      }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1.5,
            borderRadius: 2,
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0'
          }}
        >
          <Typography variant="body2" color="text.secondary">
            New notifications page coming soon!
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper
        elevation={0}
        sx={{
          p: 3,
          backgroundColor: 'white',
          borderRadius: 2,
          border: '1px solid #e2e8f0'
        }}
      >
        {loading && (
          <Stack spacing={3} alignItems="center" justifyContent="center" sx={{ py: 6 }}>
            <CircularProgress
              size={40}
              sx={{
                color: '#4f46e5',
                '& .MuiCircularProgress-circle': {
                  strokeLinecap: 'round',
                }
              }}
            />
            <Stack spacing={1} alignItems="center">
              <Typography variant="body1" sx={{ fontWeight: 600, color: '#1e293b' }}>
                Coach Pepper is checking for escalations...
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Analyzing student observations for weekly changes
              </Typography>
            </Stack>
          </Stack>
        )}

        {!loading && error && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
            <ErrorOutline color="error" fontSize="small" />
            <Typography variant="body2" color="error">{error}</Typography>
          </Stack>
        )}

        {!loading && !error && (
          <Stack spacing={3}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                This week
              </Typography>
              <Stack direction="row" spacing={1.5} flexWrap="wrap">
                {[
                  { label: 'Escalated (This Week)', value: escalatedList.length, color: '#ef4444' },
                  { label: 'Still Open', value: stillOpenList.length, color: '#f59e0b' },
                  { label: 'Improved', value: improvedList.length, color: '#22c55e' },
                ].map((stat) => (
                  <Box
                    key={stat.label}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc',
                      minWidth: 180
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {stat.label}
                    </Typography>
                    <Typography variant="h6" sx={{ color: stat.color, fontWeight: 700 }}>
                      {stat.value}
                    </Typography>
                  </Box>
                ))}
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                {['high', 'medium', 'low'].map((key) => (
                  <Chip
                    key={key}
                    label={`${key.toUpperCase()}: ${severityCounts[key] || 0}`}
                    color={key === 'high' ? 'error' : key === 'medium' ? 'warning' : 'default'}
                    size="small"
                  />
                ))}
              </Stack>
            </Stack>

            <Divider />

            <Stack spacing={1.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Escalated (This Week)
              </Typography>
              {renderGroupedList(escalatedList, 'No escalations detected this week.')}
            </Stack>

            <Accordion disableGutters elevation={0}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 0,
                  '& .MuiAccordionSummary-content': { m: 0 }
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Still Open (No Change)
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                {renderGroupedList(stillOpenList, 'No unchanged flags this week.')}
              </AccordionDetails>
            </Accordion>

            <Accordion disableGutters elevation={0}>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 0,
                  '& .MuiAccordionSummary-content': { m: 0 }
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Improved (This Week)
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                {renderGroupedList(improvedList, 'No improvements recorded this week.')}
              </AccordionDetails>
            </Accordion>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}

export default NotificationsPage;
