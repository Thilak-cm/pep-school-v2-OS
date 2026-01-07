// StudentDashboard.jsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Avatar,
  CardActionArea,
  IconButton,
  Button,
  Skeleton,
  Stack,
  Alert,
  Chip,
  Popover,
  Tooltip
} from '@mui/material';
import { keyframes } from '@emotion/react';
import {
  Notes as NotesIcon,
  BarChart as BarChartIcon,
  WarningAmber as WarningIcon,
  ArrowForward,
  AutoAwesome,
  ErrorOutline,
  Chat as ChatIcon,
  CheckCircleOutline,
  InfoOutlined,
  FlagRounded,
  CheckCircle
} from '@mui/icons-material';
import { collectionGroup, query, getDocs, where, orderBy, doc, getDoc, Timestamp, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, cloudFunctions } from '../firebase';
import { trackEvent } from '../utils/analytics';
import { BASEBALL_CARD_DEFAULTS } from '../../../config/baseballCardConstants';
import NewFeaturePill from './NewFeaturePill';

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

const confettiColors = ['#4f46e5', '#059669', '#f59e0b', '#db2777', '#3b82f6', '#8b5cf6'];

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
function StudentDashboard({ student, onOpenTimeline, onOpenStats, onOpenFeedback, onOpenChat, initialNoteType = 'textVoice' }) {
  const [notesLast7Days, setNotesLast7Days] = useState(null); // null = loading, number = count
  const [cardLoading, setCardLoading] = useState(true);
  const [cardError, setCardError] = useState('');
  const [cardData, setCardData] = useState(null);
  const [cardConfig, setCardConfig] = useState({ ...BASEBALL_CARD_DEFAULTS });
  const [currentRole, setCurrentRole] = useState(null);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [signalsError, setSignalsError] = useState('');
  const [signalsData, setSignalsData] = useState(null);
  const [flagAnchorEl, setFlagAnchorEl] = useState(null);
  const [missingDomainsAnchorEl, setMissingDomainsAnchorEl] = useState(null);
  const [regenRunning, setRegenRunning] = useState(false);
  const [regenError, setRegenError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const summaryScrollRef = useRef(null);
  const [showScrollFade, setShowScrollFade] = useState(false);
  const [showCoverageConfetti, setShowCoverageConfetti] = useState(false);
  const coverageConfettiTimerRef = useRef(null);

  const getStudentName = (s) => {
    if (!s) return 'Student';
    return s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student';
  };

  const studentId = student?.id || student?.uid || null;
  const isSuperAdmin = currentRole === 'superadmin';

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
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load baseball card config', err);
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
      setSignalsError('');
      setSignalsLoading(false);
      return () => { active = false; };
    }

    setCardLoading(true);
    setCardError('');
    setSignalsLoading(true);
    setSignalsError('');

    const fetchCard = async () => {
      try {
        const ref = doc(db, 'students', studentId, 'ai_summaries', 'baseball_card');
        const signalsRef = doc(db, 'students', studentId, 'ai_summaries', 'signals');
        const [snap, signalsSnap] = await Promise.all([getDoc(ref), getDoc(signalsRef)]);
        if (!active) return;
        setCardData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setSignalsData(signalsSnap.exists() ? { id: signalsSnap.id, ...signalsSnap.data() } : null);
      } catch (err) {
        console.error('Error loading baseball card', err);
        if (active) setCardError('Failed to load the baseball card.');
        if (active) setSignalsError('Failed to load student signals.');
      } finally {
        if (active) setCardLoading(false);
        if (active) setSignalsLoading(false);
      }
    };

    fetchCard();
    return () => { active = false; };
  }, [studentId, reloadKey]);

  // Fetch notes count for past 7 days
  useEffect(() => {
    if (!studentId) {
      setNotesLast7Days(null);
      return;
    }

    const fetchNotesCount = async () => {
      try {
        const sevenDaysAgo = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
        
        // Query observations for this student from past 7 days only (server-side filter)
        // Limit to 1000 max - if student has more than 1000 notes in 7 days, count will be approximate
        const observationsQuery = query(
          collectionGroup(db, 'observations'),
          where('studentId', '==', studentId),
          where('observedAt', '>=', sevenDaysAgo),
          orderBy('observedAt', 'desc'),
          limit(1000) // Cap at 1000 - should be plenty for 7 days, prevents excessive reads
        );

        const observationsSnap = await getDocs(observationsQuery);
        // Count is just the number of documents returned (already filtered by Firestore)
        const count = observationsSnap.docs.length;

        setNotesLast7Days(count);
      } catch (error) {
        console.error('Error fetching notes count:', error);
        // If index error, try fallback query without date filter (less efficient but works)
        if (error.code === 'failed-precondition' && error.message?.includes('index')) {
          try {
            const fallbackQuery = query(
              collectionGroup(db, 'observations'),
              where('studentId', '==', studentId),
              orderBy('observedAt', 'desc'),
              limit(100) // Only check last 100 observations as fallback
            );
            const fallbackSnap = await getDocs(fallbackQuery);
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const count = fallbackSnap.docs.filter(doc => {
              const obs = doc.data();
              const obsDate = obs.observedAt?.toDate ? obs.observedAt.toDate() : 
                           obs.createdAt?.toDate ? obs.createdAt.toDate() :
                           obs.observedAt?.seconds ? new Date(obs.observedAt.seconds * 1000) :
                           obs.createdAt?.seconds ? new Date(obs.createdAt.seconds * 1000) : null;
              return obsDate && obsDate >= sevenDaysAgo;
            }).length;
            setNotesLast7Days(count);
          } catch (fallbackError) {
            console.error('Fallback query also failed:', fallbackError);
            setNotesLast7Days(null);
          }
        } else {
          setNotesLast7Days(null); // Set to null on error to avoid showing false alert
        }
      }
    };

    fetchNotesCount();
  }, [studentId]);

  const cardWindowDays = Number.isFinite(cardConfig?.windowDays) ? cardConfig.windowDays : BASEBALL_CARD_DEFAULTS.windowDays;
  const cardWindowWeeks = Math.max(1, Math.round(cardWindowDays / 7));
  const cardNoteCount = cardData?.noteCount;
  const cardStatus = cardData?.status || null;
  const isNoNotes = cardStatus === 'no_notes' || cardNoteCount === 0;
  const signalsStatus = signalsData?.status || null;
  const severity = signalsStatus === 'ok' ? (signalsData?.redFlag?.severity || null) : null;
  const severityReason = signalsStatus === 'ok' ? (signalsData?.redFlag?.reason || null) : null;
  const coverageGaps = Array.isArray(signalsData?.coverageGaps) ? signalsData.coverageGaps : [];
  const coverageCount = coverageGaps.length;
  const coverageTone = coverageCount === 0 ? 'balanced' : coverageCount > 4 ? 'alert' : 'warning';
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
  const severityColor = severity === 'high'
    ? '#dc2626'
    : severity === 'medium' || severity === 'med'
      ? '#f59e0b'
      : severity === 'low'
        ? '#94a3b8'
        : '#22c55e';

  const getSeverityChip = () => {
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
          <IconComponent sx={{ fontSize: 22 }} />
        </IconButton>
      </Tooltip>
    );
  };

  const renderCoverageRow = () => {
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
  const studentLabel = getStudentName(student);
  const feedbackMessage = `AI baseball card failed to load for ${studentLabel}. Context: last ${cardWindowWeeks} weeks summary endpoint returned an error. Please investigate the AI generation function/logs.`;

  const renderBaseballCardBody = () => {
    if (!isSuperAdmin) {
      return (
        <Box sx={{ mt: 1 }}>
          <NewFeaturePill label="Feature coming soon!" />
        </Box>
      );
    }

    if (cardLoading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="text" width="90%" />
          <Skeleton variant="text" width="80%" />
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
          <Button variant="outlined" size="small" onClick={() => onOpenFeedback?.(feedbackMessage)}>
            Send feedback
          </Button>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardLoading, cardError, cardData, isSuperAdmin]);

  useEffect(() => {
    return () => {
      if (coverageConfettiTimerRef.current) {
        clearTimeout(coverageConfettiTimerRef.current);
      }
    };
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'relative' }}>
      <Card
        sx={{
          borderRadius: 2,
          border: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #f8fafc 0%, #fff 100%)',
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflow: 'hidden' }}>
          {isSuperAdmin && (
            <Box sx={{ position: 'absolute', top: 12, right: 12 }}>
              {getSeverityChip()}
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar sx={{ bgcolor: '#6366f1', width: 48, height: 48 }}>
                <AutoAwesome />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 700 }}>
                  Weekly Snapshot
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  {Number.isFinite(cardNoteCount) ? cardNoteCount : '—'} notes over last {cardConfig?.windowDays || BASEBALL_CARD_DEFAULTS.windowDays} days
                </Typography>
                {isSuperAdmin && (
                  <Box sx={{ mt: 0.5 }}>
                    {renderCoverageRow()}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>

          <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, display: 'flex' }}>
            <Box
              ref={summaryScrollRef}
              onScroll={updateScrollFade}
              sx={{ flex: 1, overflowY: 'auto', pr: 1, pb: 6, minHeight: 0 }}
              aria-label="Student summary (scroll for more)"
            >
              {renderBaseballCardBody()}
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
        </CardContent>
      </Card>
      {isSuperAdmin && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: -2, mb: 2 }}>
          <Button
            variant="outlined"
            size="small"
            disabled={regenRunning || !studentId}
            onClick={async () => {
              try {
                setRegenError('');
                setRegenRunning(true);
                const call = httpsCallable(cloudFunctions, 'regenerateBaseballCardForStudent');
                await call({ studentId });
                setReloadKey((k) => k + 1);
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Regenerate failed', e);
                setRegenError(e?.message || 'Failed to regenerate.');
              } finally {
                setRegenRunning(false);
              }
            }}
            sx={{ textTransform: 'none' }}
            aria-label="Regenerate student summary now"
          >
            {regenRunning ? 'Regenerating…' : 'Regenerate now'}
          </Button>
          {regenError && (
            <Typography variant="body2" color="error">
              {regenError}
            </Typography>
          )}
        </Stack>
      )}
      <Popover
        open={Boolean(flagAnchorEl)}
        anchorEl={flagAnchorEl}
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
                <CheckCircle sx={{ fontSize: 20, color: coverageStyles.iconColor }} />
              ) : (
                <WarningIcon sx={{ fontSize: 20, color: coverageStyles.iconColor }} />
              )}
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: coverageStyles.textColor }}>
                {coverageStyles.title}
              </Typography>
            </Stack>
            {coverageTone === 'balanced' ? (
              <>
                <Typography variant="body2" sx={{ color: '#0f172a' }}>
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
                  sx={{ color: coverageTone === 'alert' ? '#b91c1c' : '#92400e' }}
                >
                  {coverageTone === 'warning'
                    ? 'A few domains need attention. Try adding observations in these areas soon.'
                    : 'Many domains are missing. Prioritize observations in these areas this week.'}
                </Typography>
                {coverageGaps.length > 0 ? (
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {coverageGaps.map((gap, idx) => (
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

      <Card
        sx={{
          borderRadius: 2,
          '&:hover': { boxShadow: '0 8px 24px rgba(0,0,0,0.12)', transform: 'translateY(-2px)' },
          transition: 'all 0.2s ease-in-out',
        }}
      >
        <CardActionArea
          onClick={() => {
            trackEvent('student_dashboard_card_click', { card: 'timeline', studentId }).catch(() => {});
            onOpenTimeline?.(initialNoteType);
          }}
          sx={{ p: 0 }}
      >
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
              <Avatar sx={{ bgcolor: '#4f46e5', width: 48, height: 48 }}>
                  <NotesIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 700 }}>
                    Timeline
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748b' }}>
                    View student's observations and lesson notes here
                  </Typography>
                </Box>
              </Box>
              <ArrowForward sx={{ color: '#94a3b8' }} />
            </Box>
        </CardContent>
      </CardActionArea>
    </Card>

    {/* AI Chat Card - Admin Only */}
    {isSuperAdmin && (
      <Card
        sx={{
          borderRadius: 2,
          '&:hover': {
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            transform: 'translateY(-2px)',
          },
          transition: 'all 0.2s ease-in-out',
        }}
      >
        <CardActionArea
          onClick={() => {
            trackEvent('student_dashboard_card_click', { card: 'chat', studentId }).catch(() => {});
            onOpenChat?.();
          }}
          sx={{ p: 0 }}
        >
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                <Avatar sx={{ bgcolor: '#6366f1', width: 48, height: 48 }}>
                  <ChatIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 700 }}>
                    Chat with Coach Pepper
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748b' }}>
                    Ask questions about {getStudentName(student)}'s development
                  </Typography>
                </Box>
              </Box>
              <ArrowForward sx={{ color: '#94a3b8' }} />
            </Box>
          </CardContent>
        </CardActionArea>
      </Card>
    )}

    <Card
      sx={{
        borderRadius: 2,
        '&:hover': {
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          transform: 'translateY(-2px)',
        },
        transition: 'all 0.2s ease-in-out',
      }}
    >
      <CardActionArea
        onClick={() => {
          trackEvent('student_dashboard_card_click', { card: 'stats', studentId }).catch(() => {});
          onOpenStats?.();
        }}
        sx={{ p: 0 }}
      >
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
              <Avatar sx={{ bgcolor: '#f59e0b', width: 56, height: 56 }}>
                <BarChartIcon />
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                  Statistics
                </Typography>
                {notesLast7Days !== null && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    {notesLast7Days === 0 && (
                      <WarningIcon sx={{ fontSize: 16, color: '#dc2626' }} />
                    )}
                    <Typography
                      variant="body2"
                      sx={{
                        color: '#64748b',
                        fontWeight: 500,
                        fontSize: '0.875rem'
                      }}
                    >
                      Monitor notes activity for {getStudentName(student)}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
            <ArrowForward sx={{ color: '#94a3b8' }} />
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  </Box>
  );
}

export default StudentDashboard;
