// StudentDashboard.jsx
import React, { useState, useEffect } from 'react';
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
  Alert
} from '@mui/material';
import {
  Notes as NotesIcon,
  BarChart as BarChartIcon,
  WarningAmber as WarningIcon,
  ArrowForward,
  AutoAwesome,
  ErrorOutline,
  Chat as ChatIcon
} from '@mui/icons-material';
import { collectionGroup, query, getDocs, where, orderBy, doc, getDoc, Timestamp, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
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
      return () => { active = false; };
    }

    setCardLoading(true);
    setCardError('');

    const fetchCard = async () => {
      try {
        const ref = doc(db, 'students', studentId, 'ai_summaries', 'baseball_card');
        const snap = await getDoc(ref);
        if (!active) return;
        setCardData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch (err) {
        console.error('Error loading baseball card', err);
        if (active) setCardError('Failed to load the baseball card.');
      } finally {
        if (active) setCardLoading(false);
      }
    };

    fetchCard();
    return () => { active = false; };
  }, [studentId]);

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
        {cardData.lessonSummary && (
          <Typography variant="body2" sx={{ color: '#334155' }}>
            {cardData.lessonSummary}
          </Typography>
        )}
        {Array.isArray(cardData.bullets) && cardData.bullets.length > 0 ? (
          <Box component="ul" sx={{ pl: 2, m: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {cardData.bullets.map((b, idx) => (
              <li key={`bb-bullet-${idx}`} style={{ color: '#0f172a', lineHeight: 1.5 }}>
                <Typography variant="body2">{b}</Typography>
              </li>
            ))}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No bullets returned.
          </Typography>
        )}
      </Box>
    );
  };

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
              </Box>
            </Box>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
            {renderBaseballCardBody()}
          </Box>
        </CardContent>
      </Card>

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
                    AI Chat
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
  </Box>
  );
}

export default StudentDashboard;
