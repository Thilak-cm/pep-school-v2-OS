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
  Stack
} from '@mui/material';
import {
  Notes as NotesIcon,
  BarChart as BarChartIcon,
  WarningAmber as WarningIcon,
  ArrowForward,
  AutoAwesome,
  ErrorOutline
} from '@mui/icons-material';
import { collectionGroup, query, getDocs, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { trackEvent } from '../utils/analytics';
import { BASEBALL_CARD_DEFAULTS } from '../../../config/baseballCardConstants';
function StudentDashboard({ student, onOpenTimeline, onOpenStats, onOpenFeedback, initialNoteType = 'textVoice' }) {
  const [notesLast7Days, setNotesLast7Days] = useState(null); // null = loading, number = count
  const [cardLoading, setCardLoading] = useState(true);
  const [cardError, setCardError] = useState('');
  const [cardData, setCardData] = useState(null);
  const [cardConfig, setCardConfig] = useState({ ...BASEBALL_CARD_DEFAULTS });

  const getStudentName = (s) => {
    if (!s) return 'Student';
    return s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student';
  };

  const studentId = student?.id || student?.uid || null;

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
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        // Query observations for this student from past 7 days
        const observationsQuery = query(
          collectionGroup(db, 'observations'),
          where('studentId', '==', studentId),
          orderBy('observedAt', 'desc')
        );

        const observationsSnap = await getDocs(observationsQuery);
        const allObservations = observationsSnap.docs.map(doc => doc.data());

        // Helper to get observation date
        const getObservationDate = (obs) => {
          if (obs.observedAt?.toDate) return obs.observedAt.toDate();
          if (obs.createdAt?.toDate) return obs.createdAt.toDate();
          if (obs.observedAt?.seconds) return new Date(obs.observedAt.seconds * 1000);
          if (obs.createdAt?.seconds) return new Date(obs.createdAt.seconds * 1000);
          return null;
        };

        // Count notes in past 7 days
        const count = allObservations.filter(obs => {
          const obsDate = getObservationDate(obs);
          return obsDate && obsDate >= sevenDaysAgo;
        }).length;

        setNotesLast7Days(count);
      } catch (error) {
        console.error('Error fetching notes count:', error);
        setNotesLast7Days(null); // Set to null on error to avoid showing false alert
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
          Oh no, no notes have been logged for {studentLabel} in the past {cardWindowWeeks} weeks.
        </Typography>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
          What’s been happening
        </Typography>
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
        {cardData.lessonSummary && (
          <Typography variant="body2" sx={{ color: '#334155' }}>
            {cardData.lessonSummary}
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
          background: 'linear-gradient(135deg, #f8fafc 0%, #fff 100%)'
        }}
      >
        <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  Snapshot of the last {cardWindowWeeks} weeks
                </Typography>
              </Box>
            </Box>
          </Box>

          {renderBaseballCardBody()}
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
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 2,
                        backgroundColor: notesLast7Days === 0 ? '#fee2e2' : '#f1f5f9',
                        border: `1px solid ${notesLast7Days === 0 ? '#fecaca' : '#e2e8f0'}`,
                      }}
                    >
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          color: notesLast7Days === 0 ? '#dc2626' : '#64748b',
                          fontWeight: notesLast7Days === 0 ? 600 : 500,
                          fontSize: '0.875rem'
                        }}
                      >
                        {notesLast7Days === 0 
                          ? `No notes for ${getStudentName(student)} in the past 7 days!`
                          : `${notesLast7Days} note${notesLast7Days === 1 ? '' : 's'} in the past 7 days`
                        }
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
            <ArrowForward sx={{ color: '#94a3b8' }} />
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default StudentDashboard;
