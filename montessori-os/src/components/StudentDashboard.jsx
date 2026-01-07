// StudentDashboard.jsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Avatar,
  CardActionArea,
  Button,
  Skeleton,
  Stack,
  Alert,
  Chip,
  Popover
} from '@mui/material';
import {
  Notes as NotesIcon,
  BarChart as BarChartIcon,
  WarningAmber as WarningIcon,
  ArrowForward,
  AutoAwesome,
  ErrorOutline,
  Chat as ChatIcon,
  CheckCircleOutline,
  InfoOutlined
} from '@mui/icons-material';
import { collectionGroup, query, getDocs, where, orderBy, doc, getDoc, Timestamp, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, cloudFunctions } from '../firebase';
import { trackEvent } from '../utils/analytics';
import { BASEBALL_CARD_DEFAULTS } from '../../../config/baseballCardConstants';
import NewFeaturePill from './NewFeaturePill';
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
  const [regenRunning, setRegenRunning] = useState(false);
  const [regenError, setRegenError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const summaryScrollRef = useRef(null);
  const [showScrollFade, setShowScrollFade] = useState(false);

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

  const getSeverityChip = () => {
    if (!severity) return null;
    const label = `Flag: ${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
    const colorMap = {
      high: '#dc2626',
      medium: '#f59e0b',
      low: '#94a3b8'
    };
    return (
      <Chip
        label={label}
        size="small"
        onClick={(e) => setFlagAnchorEl(e.currentTarget)}
        sx={{
          backgroundColor: colorMap[severity] || '#cbd5e1',
          color: '#fff',
          fontWeight: 600
        }}
      />
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

    if (coverageCount > 0) {
      const displayList = coverageGaps.slice(0, 3).join(', ');
      const extra = coverageCount > 3 ? ` +${coverageCount - 3} more` : '';
      return (
        <Stack direction="row" alignItems="center" spacing={1}>
          <WarningIcon sx={{ fontSize: 18, color: '#f59e0b' }} />
          <Typography variant="body2" sx={{ color: '#f59e0b', fontWeight: 600 }}>
            Coverage gaps: {displayList}{extra}
          </Typography>
        </Stack>
      );
    }

    return (
      <Stack direction="row" alignItems="center" spacing={1}>
        <CheckCircleOutline sx={{ fontSize: 18, color: '#22c55e' }} />
        <Typography variant="body2" sx={{ color: '#16a34a', fontWeight: 600 }}>
          Coverage looks complete
        </Typography>
      </Stack>
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card
        sx={{
          borderRadius: 2,
          border: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #f8fafc 0%, #fff 100%)',
          maxHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar sx={{ bgcolor: '#6366f1', width: 48, height: 48 }}>
                <AutoAwesome />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 700 }}>
                  Coach Pepper’s summary
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
            {isSuperAdmin && signalsStatus === 'ok' && getSeverityChip()}
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
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          {severity ? `Flag: ${severity}` : 'No flag'}
        </Typography>
        <Typography variant="body2" sx={{ color: '#334155' }}>
          {severityReason || 'No reason provided.'}
        </Typography>
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
