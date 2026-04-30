// StudentDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Button,
  Stack,
  Alert,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Popover,
  Tooltip
} from '@mui/material';
import { StickyNote as NotesIcon, MessageCircle as ChatIcon, CircleCheck as CheckCircleOutline, Info as InfoOutlined, RefreshCw as Refresh, Flag as FlagRounded, CircleCheck as CheckCircle, ClipboardList as ReportsIcon } from '../icons';
import { keyframes } from '@emotion/react';
import { collectionGroup, query, getDocs, where, orderBy, doc, getDoc, Timestamp, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import { trackEvent } from '../utils/analytics';
import { BASEBALL_CARD_DEFAULTS } from '../../../scripts/config/baseballCardConstants';
import BaseballCardSnapshotCard from './BaseballCardSnapshotCard';
import { friendlyFunctionError } from '../utils/cloudFunctionErrors';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';


const confettiFall = keyframes`
  0% {
    transform: translateY(-20px) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(400px) rotate(360deg);
    opacity: 0;
  }
`;

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

const confettiColors = ['var(--color-primary)', 'var(--color-secondary)', 'var(--color-warning)', 'var(--color-pink-dark)', 'var(--color-info)', 'var(--color-violet)'];

function ConfettiAnimation({ count = 50, small = false }) {
  const particles = React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const isWide = Math.random() > 0.5; // Mix of wide and tall rectangles
        const width = isWide ? 12 + Math.random() * 8 : 6 + Math.random() * 4;
        const height = isWide ? 6 + Math.random() * 4 : 12 + Math.random() * 8;
        return {
          id: i,
          left: `${Math.random() * 100}%`,
          delay: Math.random() * 2.5, // Spread over the full 2.5 seconds
          duration: 2.5 + Math.random() * 0.5, // 2.5-3 seconds for smooth fall
          color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
          width,
          height,
          rotation: Math.random() * 360, // Random starting rotation
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
            borderRadius: '2px', // Slight rounding for softer look
            transform: `rotate(${particle.rotation}deg)`,
            animation: `${small ? confettiFallSmall : confettiFall} ${particle.duration}s ease-out ${particle.delay}s forwards`,
          }}
        />
      ))}
    </Box>
  );
}
function StudentDashboard({ student, onOpenTimeline, onOpenFeedback, onOpenChat, onOpenReports, initialNoteType = 'textVoice' }) {
  const [cardLoading, setCardLoading] = useState(true);
  const [cardError, setCardError] = useState('');
  const [cardData, setCardData] = useState(null);
  const [cardConfig, setCardConfig] = useState({ ...BASEBALL_CARD_DEFAULTS });

  const [signalsLoading, setSignalsLoading] = useState(true);
  const [signalsData, setSignalsData] = useState(null);
  const [flagAnchorEl, setFlagAnchorEl] = useState(null);
  const [missingDomainsAnchorEl, setMissingDomainsAnchorEl] = useState(null);
  const [regenRunning, setRegenRunning] = useState(false);
  const [regenError, setRegenError] = useState('');
  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [notesSinceGenerated, setNotesSinceGenerated] = useState(null);
  const [notesSinceGeneratedLoading, setNotesSinceGeneratedLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const summaryScrollRef = useRef(null);
  const [showScrollFade, setShowScrollFade] = useState(false);
  const [showCoverageConfetti, setShowCoverageConfetti] = useState(false);
  const [chartObservations, setChartObservations] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const coverageConfettiTimerRef = useRef(null);
  const [studentDob, setStudentDob] = useState(student?.dateOfBirth || student?.dob || null);

  const getStudentName = (s) => {
    if (!s) return 'Student';
    return s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student';
  };

  const studentId = student?.id || student?.uid || null;
  const studentForCard = student ? { ...student, dateOfBirth: studentDob } : null;

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

  const handleRegenerate = async () => {
    try {
      setRegenError('');
      setRegenRunning(true);
      const call = httpsCallable(cloudFunctions, 'regenerateBaseballCardForStudent', { timeout: 300_000 });
      await call({ studentId });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setRegenError(friendlyFunctionError(e));
    } finally {
      setRegenRunning(false);
    }
  };


  useEffect(() => {
    let active = true;
    const loadStudentDob = async () => {
      if (!studentId) {
        setStudentDob(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'students', studentId));
        if (!active) return;
        const data = snap.exists() ? (snap.data() || {}) : {};
        setStudentDob(data.dateOfBirth || data.dob || null);
      } catch {
        if (!active) return;
        setStudentDob(null);
      }
    };
    loadStudentDob();
    return () => { active = false; };
  }, [studentId]);

  // Load baseball card config (windowDays, model, etc.)
  useEffect(() => {
    let active = true;
    const loadConfig = async () => {
      try {
        const ref = doc(db, 'config', 'baseball_card');
        const snap = await getDoc(ref);
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data() || {};
          setCardConfig({
            model: data.model || BASEBALL_CARD_DEFAULTS.model,
            temperature: Number.isFinite(data.temperature) ? data.temperature : BASEBALL_CARD_DEFAULTS.temperature,
            windowDays: Number.isFinite(data.windowDays) ? data.windowDays : BASEBALL_CARD_DEFAULTS.windowDays,
            timezone: data.timezone || BASEBALL_CARD_DEFAULTS.timezone,
            max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens
          });
        } else {
          setCardConfig({ ...BASEBALL_CARD_DEFAULTS });
        }
      } catch {
        setCardConfig({ ...BASEBALL_CARD_DEFAULTS });
      }
    };
    loadConfig();
    return () => { active = false; };
  }, []);

  // Load baseball card data for the student
  useEffect(() => {
    let active = true;
    if (!studentId) {
      setCardData(null);
      setCardError('');
      setCardLoading(false);
      setSignalsData(null);
      setSignalsLoading(false);
      return () => { active = false; };
    }

    setCardLoading(true);
    setCardError('');
    setSignalsLoading(true);

    const fetchCard = async () => {
      try {
        const ref = doc(db, 'students', studentId, 'ai_summaries', 'baseball_card');
        const signalsRef = doc(db, 'students', studentId, 'ai_summaries', 'signals');
        const [snap, signalsSnap] = await Promise.all([getDoc(ref), getDoc(signalsRef)]);
        if (!active) return;
        setCardData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setSignalsData(signalsSnap.exists() ? { id: signalsSnap.id, ...signalsSnap.data() } : null);
      } catch {
        if (active) setCardError('Failed to load the baseball card.');
      } finally {
        if (active) setCardLoading(false);
        if (active) setSignalsLoading(false);
      }
    };

    fetchCard();
    return () => { active = false; };
  }, [studentId, reloadKey]);

  // Fetch observations for the "Notes Over Time" chart
  useEffect(() => {
    if (!studentId) {
      setChartObservations([]);
      setChartLoading(false);
      return;
    }
    let active = true;
    setChartLoading(true);
    const fetchChartObs = async () => {
      try {
        const windowDays = Number.isFinite(cardConfig?.windowDays) ? cardConfig.windowDays : 42;
        const windowStart = Timestamp.fromDate(new Date(Date.now() - (windowDays + 7) * 24 * 60 * 60 * 1000));
        const obsQuery = query(
          collectionGroup(db, 'observations'),
          where('studentId', '==', studentId),
          where('observedAt', '>=', windowStart),
          orderBy('observedAt', 'desc')
        );
        const snap = await getDocs(obsQuery);
        if (!active) return;
        setChartObservations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        if (active) setChartObservations([]);
      } finally {
        if (active) setChartLoading(false);
      }
    };
    fetchChartObs();
    return () => { active = false; };
  }, [studentId, cardConfig?.windowDays]);

  const getObservationDate = React.useCallback((obs) => {
    if (obs.observedAt?.toDate) return obs.observedAt.toDate();
    if (obs.createdAt?.toDate) return obs.createdAt.toDate();
    if (obs.observedAt?.seconds) return new Date(obs.observedAt.seconds * 1000);
    if (obs.createdAt?.seconds) return new Date(obs.createdAt.seconds * 1000);
    return new Date(0);
  }, []);

  const weeklyChartData = useMemo(() => {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const weekCount = Math.max(1, Math.round((Number.isFinite(cardConfig?.windowDays) ? cardConfig.windowDays : 42) / 7));
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const data = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = weekCount - 1; i >= 0; i--) {
      const weekEnd = new Date(endOfToday.getTime() - i * 7 * dayMs);
      const weekStart = new Date(weekEnd.getTime() - 7 * dayMs);
      const count = chartObservations.filter(obs => {
        const d = getObservationDate(obs);
        return d >= weekStart && d < weekEnd;
      }).length;
      const label = `W${Math.ceil(weekStart.getDate() / 7)} ${monthNames[weekStart.getMonth()]}`;
      data.push({ period: label, count });
    }
    return data;
  }, [chartObservations, cardConfig?.windowDays, getObservationDate]);

  const peakPerWeek = useMemo(() => {
    if (!weeklyChartData.length) return 0;
    return Math.max(...weeklyChartData.map(d => d.count));
  }, [weeklyChartData]);

  useEffect(() => {
    let active = true;
    const fetchNotesSinceGenerated = async () => {
      if (!regenDialogOpen || !studentId) {
        if (active) {
          setNotesSinceGenerated(null);
          setNotesSinceGeneratedLoading(false);
        }
        return;
      }

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
          where('studentId', '==', studentId),
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
              where('studentId', '==', studentId),
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
  }, [studentId, cardData?.generatedAt, regenDialogOpen]);

  const cardWindowDays = Number.isFinite(cardConfig?.windowDays) ? cardConfig.windowDays : BASEBALL_CARD_DEFAULTS.windowDays;
  const cardWindowWeeks = Math.max(1, Math.round(cardWindowDays / 7));
  const cardNoteCount = cardData?.noteCount;
  const signalsStatus = signalsData?.status || null;
  const severity = signalsStatus === 'ok' ? (signalsData?.redFlag?.severity || null) : null;
  const severityReason = signalsStatus === 'ok' ? (signalsData?.redFlag?.reason || null) : null;
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
  const coveragePalette = {
    balanced: {
      borderColor: 'var(--color-green-bright)',
      hoverBorderColor: 'var(--color-green-mid)',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      hoverBackground: 'rgba(22, 163, 74, 0.12)',
      textColor: 'var(--color-green-dark)',
      iconColor: 'var(--color-green-bright)',
      title: 'Coverage balanced',
    },
    warning: {
      borderColor: 'var(--color-warning)',
      hoverBorderColor: 'var(--color-warning-dark)',
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      hoverBackground: 'rgba(245, 158, 11, 0.14)',
      textColor: 'var(--color-amber-text)',
      iconColor: 'var(--color-warning)',
      title: 'Missing domains',
    },
    alert: {
      borderColor: 'var(--color-error)',
      hoverBorderColor: 'var(--color-error-dark)',
      backgroundColor: 'rgba(220, 38, 38, 0.1)',
      hoverBackground: 'rgba(220, 38, 38, 0.14)',
      textColor: 'var(--color-red-dark)',
      iconColor: 'var(--color-error)',
      title: 'Missing domains',
    },
  };
  const coverageStyles = coveragePalette[coverageTone];
  const severityColor = severity === 'high'
    ? 'var(--color-error)'
    : severity === 'medium' || severity === 'med'
      ? 'var(--color-warning)'
      : severity === 'low'
        ? 'var(--color-text-faint)'
        : 'var(--color-green-bright)';

  const getSeverityChip = () => {
    if (signalsLoading || signalsStatus !== 'ok') return null;

    const colorMap = {
      high: 'var(--color-error)',
      medium: 'var(--color-warning)',
      med: 'var(--color-warning)',
      low: 'var(--color-text-faint)',
      none: 'var(--color-green-bright)'
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
          onClick={(e) => setFlagAnchorEl(e.currentTarget)}
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
          <IconComponent size={22} />
        </IconButton>
      </Tooltip>
    );
  };

  const renderCoverageRow = () => {
    if (signalsLoading) {
      return (
        <Typography variant="body2" sx={{ color: 'var(--color-text-faint)' }}>
          Checking coverage…
        </Typography>
      );
    }
    if (signalsStatus !== 'ok') {
      return (
        <Stack direction="row" alignItems="center" spacing={1}>
          <InfoOutlined size={18} sx={{ color: 'var(--color-text-faint)' }} />
          <Typography variant="body2" sx={{ color: 'var(--color-text-faint)' }}>
            Coverage pending
          </Typography>
        </Stack>
      );
    }

    const buttonIcon =
      coverageTone === 'balanced' ? (
        <CheckCircle size={18} sx={{ color: coverageStyles.iconColor }} />
      ) : (
        <WarningIcon size={18} sx={{ color: coverageStyles.iconColor }} />
      );

    const handleCoverageClick = (e) => {
      setMissingDomainsAnchorEl(e.currentTarget);
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
  const studentLabel = getStudentName(student);
  const feedbackMessage = `AI baseball card failed to load for ${studentLabel}. Context: last ${cardWindowWeeks} weeks summary endpoint returned an error. Please investigate the AI generation function/logs.`;

  const updateScrollFade = () => {
    const el = summaryScrollRef.current;
    if (!el) return;
    const canScroll = el.scrollHeight - el.clientHeight > 4;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setShowScrollFade(canScroll && !atBottom);
  };

  useEffect(() => {
    updateScrollFade();
    // Ensure fade updates if viewport changes (e.g., device rotation)
    window.addEventListener('resize', updateScrollFade);
    return () => window.removeEventListener('resize', updateScrollFade);
  }, [cardLoading, cardError, cardData]);

  useEffect(() => {
    return () => {
      if (coverageConfettiTimerRef.current) {
        clearTimeout(coverageConfettiTimerRef.current);
      }
    };
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'relative' }}>
      <BaseballCardSnapshotCard
        minHeight="55vh"
        noteCount={cardNoteCount}
        windowDays={cardWindowDays}
        coverage={renderCoverageRow()}
        topRightActions={getSeverityChip()}
        onRegenerateClick={() => setRegenDialogOpen(true)}
        regenDisabled={regenRunning || !studentId}
        cardData={cardData}
        cardLoading={cardLoading}
        cardError={cardError}
        cardWindowDays={cardWindowDays}
        studentLabel={studentLabel}
        student={studentForCard}
        onOpenFeedback={onOpenFeedback}
        feedbackMessage={feedbackMessage}
        summaryScrollRef={summaryScrollRef}
        onSummaryScroll={updateScrollFade}
        showScrollFade={showScrollFade}
        footer={
          chartLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120 }}>
              <CircularProgress size={24} sx={{ color: 'var(--color-primary)' }} />
            </Box>
          ) : weeklyChartData.length > 0 ? (
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Notes over time
                </Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-faint)' }}>
                  peak: {peakPerWeek}/wk
                </Typography>
              </Stack>
              <Box sx={{ height: 120, width: '100%', ml: -1 }}>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={weeklyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} /> {/* Recharts — hex required */}
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 9, fill: '#94a3b8' }} /* Recharts */
                      axisLine={{ stroke: '#e2e8f0' }} /* Recharts */
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: '#94a3b8' }} /* Recharts */
                      axisLine={false}
                      tickLine={false}
                      width={30}
                      tickFormatter={(v) => Math.round(v)}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload?.length) {
                          return (
                            <Box sx={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-border)', borderRadius: 1.5, px: 1.5, py: 0.75, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                              <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                                {payload[0].value} {payload[0].value === 1 ? 'note' : 'notes'}
                              </Typography>
                              <Typography sx={{ fontSize: '0.65rem', color: 'var(--color-text-faint)' }}>
                                {payload[0].payload.period}
                              </Typography>
                            </Box>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#4f46e5" /* Recharts */
                      strokeWidth={2.5}
                      dot={{ fill: '#4f46e5', strokeWidth: 2, r: 3, stroke: '#fff' }} /* Recharts */
                      activeDot={{ r: 5, stroke: '#4f46e5', strokeWidth: 2, fill: '#fff' }} /* Recharts */
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          ) : null
        }
      />
      {regenError && (
        <Typography variant="body2" color="error">
          {regenError}
        </Typography>
      )}
      <Dialog
        open={regenDialogOpen}
        onClose={() => setRegenDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: 'linear-gradient(180deg, var(--color-indigo-bg) 0%, var(--color-paper) 55%)',
            border: '1px solid var(--color-border)',
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
                <Refresh size={22} sx={{ color: 'var(--color-primary)' }} />
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'var(--grey-900)' }}>
                  Regenerate weekly snapshot?
                </Typography>
              </Box>
            </Stack>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                backgroundColor: 'var(--color-indigo-bg)',
                border: '1px solid rgba(79, 70, 229, 0.2)'
              }}
            >
              <Typography variant="body2" sx={{ color: 'var(--color-indigo-deep)', fontWeight: 600 }}>
                Last generated: {formatGeneratedAt(cardData?.generatedAt)}
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: 'var(--grey-600)' }}>
              {notesSinceGeneratedLoading
                ? 'Checking for notes added after this snapshot...'
                : Number.isFinite(notesSinceGenerated)
                  ? `Regenerating will include ${notesSinceGenerated} new note${notesSinceGenerated === 1 ? '' : 's'} added after this snapshot.`
                  : 'Unable to check for new notes right now.'}
            </Typography>
            {!notesSinceGeneratedLoading && Number.isFinite(notesSinceGenerated) && (
              <Typography variant="body2" sx={{ color: notesSinceGenerated === 0 ? 'var(--color-error)' : 'var(--color-secondary)', fontStyle: 'italic' }}>
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
            disabled={regenRunning}
            sx={{ textTransform: 'none', color: 'var(--grey-600)' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              setRegenDialogOpen(false);
              await handleRegenerate();
            }}
            disabled={regenRunning || !studentId}
            sx={{
              textTransform: 'none',
              borderRadius: 999,
              px: 3,
              boxShadow: '0 10px 20px rgba(79, 70, 229, 0.25)'
            }}
          >
            {regenRunning ? 'Regenerating…' : 'Regenerate'}
          </Button>
        </DialogActions>
      </Dialog>
      <Popover
        open={Boolean(flagAnchorEl)}
        anchorEl={flagAnchorEl}
        onClose={() => setFlagAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { p: 2, maxWidth: 320 } }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
          <FlagRounded size={22} sx={{ color: severityColor }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: severityColor }}>
            {severity ? (severity === 'med' ? 'Flag: Medium' : `Flag: ${severity.charAt(0).toUpperCase()}${severity.slice(1)}`) : 'No active flag'}
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ color: 'var(--grey-700)' }}>
          {severityReason || (severity ? 'No reason provided.' : 'This student currently has no concerns flagged.')}
        </Typography>
      </Popover>

      <Popover
        open={Boolean(missingDomainsAnchorEl)}
        anchorEl={missingDomainsAnchorEl}
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
            border: `1px solid ${coverageStyles.borderColor}`,
          }
        }}
      >
        <Box sx={{ position: 'relative', overflow: 'hidden' }}>
          {coverageTone === 'balanced' && showCoverageConfetti && (
            <ConfettiAnimation count={35} small />
          )}
          <Stack spacing={1.25} sx={{ position: 'relative', zIndex: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              {coverageTone === 'balanced' ? (
                <CheckCircle size={20} sx={{ color: coverageStyles.iconColor }} />
              ) : (
                <WarningIcon size={20} sx={{ color: coverageStyles.iconColor }} />
              )}
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: coverageStyles.textColor }}>
                {coverageStyles.title}
              </Typography>
            </Stack>
            {coverageTone === 'balanced' ? (
              <>
                <Typography variant="body2" sx={{ color: 'var(--grey-900)' }}>
                  Notes in the past {cardWindowDays} days have been balanced. Great job keeping coverage even!
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Keep rotating through domains to maintain this streak.
                </Typography>
              </>
            ) : (
              <>
                <Typography
                  variant="body2"
                  sx={{ color: coverageTone === 'alert' ? 'var(--color-error-dark)' : 'var(--color-amber-text)' }}
                >
                  {coverageTone === 'warning'
                    ? 'A few domains need attention. Try adding observations in these areas soon.'
                    : 'Many domains are missing. Prioritize observations in these areas this week.'}
                </Typography>
                {coverageGaps.length > 0 ? (
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {coverageGaps.map((gap) => (
                      <Chip key={gap} label={gap} size="small" variant="outlined" />
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

      {/* Square action buttons */}
      <Stack direction="row" spacing={1.5} justifyContent="flex-start">
        {[
          { label: 'Timeline', icon: <NotesIcon size={22} />, color: 'var(--color-primary)', bg: 'rgba(79, 70, 229, 0.08)', onClick: () => { trackEvent('student_dashboard_card_click', { card: 'timeline', studentId }).catch(() => {}); onOpenTimeline?.(initialNoteType); } },
          { label: 'Reports', icon: <ReportsIcon size={22} />, color: 'var(--color-secondary)', bg: 'rgba(5, 150, 105, 0.08)', onClick: () => { trackEvent('student_dashboard_card_click', { card: 'reports', studentId }).catch(() => {}); onOpenReports?.(); } },
          { label: 'Coach', icon: <ChatIcon size={22} />, color: 'var(--color-primary-light)', bg: 'rgba(99, 102, 241, 0.08)', onClick: () => { trackEvent('student_dashboard_card_click', { card: 'chat', studentId }).catch(() => {}); onOpenChat?.(); } },
        ].map((btn) => (
          <Box
            key={btn.label}
            onClick={btn.onClick}
            sx={{
              width: 72,
              height: 72,
              borderRadius: 2.5,
              border: '1px solid var(--color-border)',
              backgroundColor: btn.bg,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                borderColor: btn.color,
              },
              '&:active': {
                transform: 'scale(0.96)',
              }
            }}
          >
            <Box sx={{ color: btn.color }}>{btn.icon}</Box>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--grey-600)', letterSpacing: '0.02em' }}>
              {btn.label}
            </Typography>
          </Box>
        ))}
      </Stack>
  </Box>
  );
}

export default StudentDashboard;
