// StudentDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  Stack,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Popover,
  Tooltip
} from '@mui/material';
import { StickyNote as NotesIcon, MessageCircle as ChatIcon, Info as InfoOutlined, RefreshCw as Refresh, Flag as FlagRounded, CircleCheck as CheckCircle, ClipboardList as ReportsIcon, TriangleAlert as WarningIcon, Pencil } from '../icons';
import { QuickJumpButton, HFTabs } from './ui';
import useNotify from '../notifications/useNotify';
import { collectionGroup, query, getDocs, where, orderBy, doc, getDoc, Timestamp, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import { trackEvent } from '../utils/analytics';
import { BASEBALL_CARD_DEFAULTS } from '../../../scripts/config/baseballCardConstants';
import SnapshotBody from './SnapshotBody';
import { friendlyFunctionError } from '../utils/cloudFunctionErrors';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import { calculateAgeFromDob } from '../utils/dateFormat';

/* Shared chip base sx for uniform toolbar items */
const CHIP_BASE = {
  height: 28,
  borderRadius: '14px',
  border: '1px solid',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: '0.7rem',
  fontWeight: 700,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
  flexShrink: 0,
};

const SNAPSHOT_TABS = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Writing', value: 'writing' },
];

function StudentDashboard({ student, onOpenTimeline, onOpenFeedback, onOpenChat, onOpenReports, onNavigateToManageStudent, initialNoteType = 'textVoice' }) {
  const notify = useNotify();
  const [activeTab, setActiveTab] = useState('weekly');
  const [cardLoading, setCardLoading] = useState(true);
  const [cardError, setCardError] = useState('');
  const [cardData, setCardData] = useState(null);
  const [cardConfig, setCardConfig] = useState({ ...BASEBALL_CARD_DEFAULTS });

  const [signalsLoading, setSignalsLoading] = useState(true);
  const [signalsData, setSignalsData] = useState(null);
  const [writingData, setWritingData] = useState(null);
  const [writingLoading, setWritingLoading] = useState(false);
  const [writingError, setWritingError] = useState('');
  const [flagAnchorEl, setFlagAnchorEl] = useState(null);
  const [missingDomainsAnchorEl, setMissingDomainsAnchorEl] = useState(null);
  const [regenRunning, setRegenRunning] = useState(false);
  const [regenDialogOpen, setRegenDialogOpen] = useState(false);
  const [notesSinceGenerated, setNotesSinceGenerated] = useState(null);
  const [notesSinceGeneratedLoading, setNotesSinceGeneratedLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const summaryScrollRef = useRef(null);
  const [showScrollFade, setShowScrollFade] = useState(false);
  const [chartObservations, setChartObservations] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [studentDob, setStudentDob] = useState(student?.dateOfBirth || student?.dob || null);

  const getStudentName = (s) => {
    if (!s) return 'Student';
    return s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student';
  };

  const studentId = student?.id || student?.uid || null;

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
      setRegenRunning(true);
      const call = httpsCallable(cloudFunctions, 'regenerateBaseballCardForStudent', { timeout: 300_000 });
      await call({ studentId });
      setReloadKey((k) => k + 1);
    } catch (e) {
      notify.error(friendlyFunctionError(e));
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
        const ref = doc(db, 'students', studentId, 'ai_summaries', 'weekly_snapshot');
        const snap = await getDoc(ref);
        if (!active) return;
        const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setCardData(data);
        setSignalsData(data);
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

  // Fetch writing analysis when Writing tab is active
  useEffect(() => {
    if (activeTab !== 'writing' || !studentId) return;
    let active = true;
    setWritingLoading(true);
    setWritingError('');

    const fetchWriting = async () => {
      try {
        const ref = doc(db, 'students', studentId, 'ai_summaries', 'writing_analysis');
        const snap = await getDoc(ref);
        if (!active) return;
        setWritingData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch {
        if (active) setWritingError('Failed to load writing analysis.');
      } finally {
        if (active) setWritingLoading(false);
      }
    };

    fetchWriting();
    return () => { active = false; };
  }, [activeTab, studentId]);

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
        ? 'var(--color-sky)'
        : 'var(--color-green-bright)';

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


  const ageString = calculateAgeFromDob(studentDob);

  const coverageChipIcon = coverageTone === 'balanced'
    ? <CheckCircle size={14} style={{ color: coverageStyles.iconColor }} />
    : <WarningIcon size={14} style={{ color: coverageStyles.iconColor }} />;

  const flagColor = severity === 'high'
    ? 'var(--color-error)'
    : severity === 'medium' || severity === 'med'
      ? 'var(--color-warning)'
      : severity === 'low'
        ? 'var(--color-sky)'
        : 'var(--color-green-bright)';

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', gap: 1.5, position: 'relative',
      height: { xs: 'calc(100dvh - 64px - 72px - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))', sm: 'calc(100dvh - 64px - 72px - 48px)' },
      minHeight: 0,
    }}>
      {/* ── Snapshot card with tabs ── */}
      <Card sx={{
        borderRadius: 2,
        border: '1px solid var(--color-border)',
        background: 'linear-gradient(135deg, var(--color-bg) 0%, var(--color-paper) 100%)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* Tab strip */}
        <HFTabs
          tabs={SNAPSHOT_TABS}
          value={activeTab}
          onChange={setActiveTab}
          variant="fullWidth"
          sx={{ borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}
        />

        <CardContent sx={{ p: 2, pt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1, overflow: 'hidden' }}>
          {/* ── Uniform toolbar chip row ── */}
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
            {/* Coverage chip — weekly tab only */}
            {activeTab === 'weekly' && (
              signalsLoading ? (
                <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'var(--color-text-faint)' }}>
                  Checking coverage…
                </Typography>
              ) : signalsStatus !== 'ok' ? (
                <Box sx={{
                  ...CHIP_BASE,
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'rgba(148, 163, 184, 0.06)',
                  color: 'var(--color-text-faint)',
                  px: 1.25, gap: 0.5,
                }}>
                  <InfoOutlined size={14} />
                  <span>Coverage pending</span>
                </Box>
              ) : (
                <Box
                  onClick={(e) => setMissingDomainsAnchorEl(e.currentTarget)}
                  sx={{
                    ...CHIP_BASE,
                    borderColor: coverageStyles.borderColor,
                    backgroundColor: coverageStyles.backgroundColor,
                    color: coverageStyles.textColor,
                    px: 1.25, gap: 0.5,
                    '&:hover': {
                      backgroundColor: coverageStyles.hoverBackground,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    },
                  }}
                  aria-label={coverageButtonLabel}
                >
                  {coverageChipIcon}
                  <span>{coverageButtonLabel}</span>
                </Box>
              )
            )}

            {/* Age chip */}
            {ageString ? (
              <Box sx={{
                ...CHIP_BASE,
                borderColor: 'var(--color-violet-soft)',
                backgroundColor: 'var(--color-violet-bg)',
                color: 'var(--color-violet)',
                px: 1,
                cursor: 'default',
              }}>
                {ageString}
              </Box>
            ) : (
              <Box
                onClick={() => {
                  if (onNavigateToManageStudent) onNavigateToManageStudent(studentId);
                  else notify.info('Ask your admin to update the date of birth for this student');
                }}
                sx={{
                  ...CHIP_BASE,
                  borderColor: 'rgba(245, 158, 11, 0.2)',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  color: 'var(--color-amber-text)',
                  px: 1,
                  fontSize: '0.65rem',
                }}
              >
                DoB missing
              </Box>
            )}

            <Box sx={{ flex: 1 }} />

            {/* Refresh chip — weekly tab only */}
            {activeTab === 'weekly' && (
              <Tooltip title="Regenerate snapshot" arrow>
                <Box
                  component="button"
                  onClick={() => setRegenDialogOpen(true)}
                  disabled={regenRunning || !studentId}
                  sx={{
                    ...CHIP_BASE,
                    width: 28,
                    borderColor: 'var(--color-indigo-soft, rgba(79, 70, 229, 0.18))',
                    backgroundColor: 'rgba(79, 70, 229, 0.06)',
                    color: 'var(--color-primary)',
                    p: 0,
                    '&:hover': { backgroundColor: 'rgba(79, 70, 229, 0.13)' },
                    '&:disabled': { opacity: 0.4, cursor: 'default' },
                  }}
                  aria-label="Regenerate snapshot"
                >
                  <Refresh size={14} />
                </Box>
              </Tooltip>
            )}

            {/* Flag chip — weekly tab only */}
            {activeTab === 'weekly' && !signalsLoading && signalsStatus === 'ok' && (
              <Tooltip title={severity ? (severity === 'med' ? 'Flag: Medium' : `Flag: ${severity.charAt(0).toUpperCase()}${severity.slice(1)}`) : 'No flag'} arrow>
                <Box
                  component="button"
                  onClick={(e) => setFlagAnchorEl(e.currentTarget)}
                  sx={{
                    ...CHIP_BASE,
                    width: 28,
                    borderColor: flagColor,
                    backgroundColor: `color-mix(in srgb, ${flagColor} 6%, transparent)`,
                    color: flagColor,
                    p: 0,
                    '&:hover': { backgroundColor: `color-mix(in srgb, ${flagColor} 13%, transparent)` },
                  }}
                  aria-label="View flag details"
                >
                  <FlagRounded size={14} />
                </Box>
              </Tooltip>
            )}
          </Stack>

          {/* ── Note count ── */}
          <Typography sx={{ fontSize: '0.78rem', color: 'var(--color-text-soft)', flexShrink: 0, py: 0.25 }}>
            {activeTab === 'weekly' ? (
              <><strong style={{ fontWeight: 700, color: 'var(--color-text)' }}>{Number.isFinite(cardNoteCount) ? cardNoteCount : '-'}</strong> notes over last <strong style={{ fontWeight: 700, color: 'var(--color-text)' }}>{cardWindowDays}</strong> days</>
            ) : (
              Number.isFinite(writingData?.sampleCount)
                ? <><strong style={{ fontWeight: 700, color: 'var(--color-text)' }}>{writingData.sampleCount}</strong> writing samples analyzed</>
                : <>Writing analysis</>
            )}
          </Typography>

          {/* ── Tab content — scrollable ── */}
          <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, display: 'flex' }}>
            <Box
              ref={summaryScrollRef}
              onScroll={updateScrollFade}
              sx={{ flex: 1, overflowY: 'auto', pr: 1, pb: 6, minHeight: 0 }}
              aria-label="Snapshot content (scroll for more)"
            >
              {activeTab === 'weekly' ? (
                <SnapshotBody
                  cardData={cardData}
                  cardLoading={cardLoading}
                  cardError={cardError}
                  cardWindowDays={cardWindowDays}
                  studentLabel={studentLabel}
                  onOpenFeedback={onOpenFeedback}
                  feedbackMessage={feedbackMessage}
                />
              ) : (
                writingLoading ? (
                  <SnapshotBody cardLoading={true} />
                ) : writingError ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                    <Typography variant="body2" color="error">{writingError}</Typography>
                  </Box>
                ) : (!writingData || writingData.status === 'skipped') ? (
                  <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1.5,
                    minHeight: 'calc(100% - 48px)',
                    textAlign: 'center',
                  }}>
                    <Box sx={{
                      width: 56, height: 56,
                      borderRadius: 4,
                      background: 'linear-gradient(135deg, var(--color-violet-bg) 0%, rgba(79, 70, 229, 0.08) 100%)',
                      border: '1px solid var(--color-violet-soft, rgba(124, 58, 237, 0.2))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-violet)',
                    }}>
                      <Pencil size={26} />
                    </Box>
                    <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>
                      Writing Snapshot
                    </Typography>
                    <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-text-soft)', maxWidth: 240, lineHeight: 1.5 }}>
                      No writing analysis available
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: 'var(--grey-700)', whiteSpace: 'pre-line' }}
                    >
                      {writingData.narrative}
                    </Typography>
                  </Box>
                )
              )}
            </Box>
            {showScrollFade && (
              <Box sx={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: 56,
                pointerEvents: 'none',
                background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 30%, rgba(255,255,255,0.85) 55%, rgba(255,255,255,0.97) 80%, rgba(255,255,255,1) 100%)',
                backdropFilter: 'blur(2px)',
              }} />
            )}
          </Box>
        </CardContent>

        {/* ── Chart footer ── */}
        <Box sx={{ borderTop: '1px solid var(--color-border)', px: 2, py: 1.5, flexShrink: 0 }}>
          {chartLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120 }}>
              <CircularProgress size={24} sx={{ color: 'var(--color-primary)' }} />
            </Box>
          ) : weeklyChartData.length > 0 ? (
            <Box>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '0.06em', textTransform: 'uppercase', mb: 1 }}>
                Notes over time
              </Typography>
              <Box sx={{ height: 120, width: '100%' }}>
                <ResponsiveContainer width="100%" height={120}>
                  <LineChart data={weeklyChartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} /> {/* Recharts */}
                    <XAxis dataKey="period" tick={{ fontSize: 9, fill: '#94a3b8' /* Recharts */ }} axisLine={{ stroke: '#e2e8f0' /* Recharts */ }} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#94a3b8' /* Recharts */ }} axisLine={false} tickLine={false} width={30} tickFormatter={(v) => Math.round(v)} allowDecimals={false} />
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
                    <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2.5} dot={{ fill: '#4f46e5', strokeWidth: 2, r: 3, stroke: '#fff' }} activeDot={{ r: 5, stroke: '#4f46e5', strokeWidth: 2, fill: '#fff' }} /> {/* Recharts */}
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          ) : null}
        </Box>
      </Card>

      {/* ── Regenerate confirmation dialog ── */}
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
              <Box sx={{
                width: 48, height: 48, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.08) 70%)',
                border: '1px solid rgba(99,102,241,0.35)',
              }}>
                <Refresh size={22} style={{ color: 'var(--color-primary)' }} />
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'var(--grey-900)' }}>
                Regenerate weekly snapshot?
              </Typography>
            </Stack>
            <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: 'var(--color-indigo-bg)', border: '1px solid rgba(79, 70, 229, 0.2)' }}>
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
          <Button onClick={() => setRegenDialogOpen(false)} disabled={regenRunning} sx={{ textTransform: 'none', color: 'var(--grey-600)' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={async () => { setRegenDialogOpen(false); await handleRegenerate(); }}
            disabled={regenRunning || !studentId}
            sx={{ textTransform: 'none', borderRadius: 999, px: 3, boxShadow: '0 10px 20px rgba(79, 70, 229, 0.25)' }}
          >
            {regenRunning ? 'Regenerating…' : 'Regenerate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Flag popover ── */}
      <Popover
        open={Boolean(flagAnchorEl)}
        anchorEl={flagAnchorEl}
        onClose={() => setFlagAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
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

      {/* ── Coverage gaps popover ── */}
      <Popover
        open={Boolean(missingDomainsAnchorEl)}
        anchorEl={missingDomainsAnchorEl}
        onClose={() => setMissingDomainsAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { p: 2, maxWidth: 340, border: `1px solid ${coverageStyles.borderColor}` } }}
      >
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            {coverageTone === 'balanced'
              ? <CheckCircle size={20} style={{ color: coverageStyles.iconColor }} />
              : <WarningIcon size={20} style={{ color: coverageStyles.iconColor }} />}
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
              <Typography variant="body2" sx={{ color: coverageTone === 'alert' ? 'var(--color-error-dark)' : 'var(--color-amber-text)' }}>
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
      </Popover>

      {/* ── Quick jump buttons — pinned at bottom ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, flexShrink: 0 }}>
        <QuickJumpButton
          icon={<NotesIcon size={22} />}
          label="Timeline"
          iconColor="var(--color-primary)"
          onClick={() => { trackEvent('student_dashboard_card_click', { card: 'timeline', studentId }).catch(() => {}); onOpenTimeline?.(initialNoteType); }}
        />
        <QuickJumpButton
          icon={<ReportsIcon size={22} />}
          label="Reports"
          iconColor="var(--color-secondary)"
          onClick={() => { trackEvent('student_dashboard_card_click', { card: 'reports', studentId }).catch(() => {}); onOpenReports?.(); }}
        />
        <QuickJumpButton
          icon={<ChatIcon size={22} />}
          label="Coach"
          iconColor="var(--color-primary-light)"
          onClick={() => { trackEvent('student_dashboard_card_click', { card: 'chat', studentId }).catch(() => {}); onOpenChat?.(); }}
        />
      </Box>
    </Box>
  );
}

export default StudentDashboard;
