// StudentDashboard.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Avatar,
  Grid
} from '@mui/material';
import {
  Notes as NotesIcon,
  Insights as InsightsIcon,
  Description as DescriptionIcon,
  BarChart as BarChartIcon,
  ArrowForward,
  MenuBook as MenuBookIcon,
  WarningAmber as WarningIcon
} from '@mui/icons-material';
import { collectionGroup, query, getDocs, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { trackEvent } from '../utils/analytics';

function StudentDashboard({ student, onOpenTextNotes, onOpenLessonNotes, onOpenStats }) {
  const [notesLast7Days, setNotesLast7Days] = useState(null); // null = loading, number = count
  const getFirstName = (s) => {
    if (!s) return 'Student';
    if (s.firstName) return s.firstName;
    const name = s.name || s.displayName || `${s.firstName || ''} ${s.lastName || ''}`.trim();
    return name?.split(' ')[0] || 'Student';
  };

  const getStudentName = (s) => {
    if (!s) return 'Student';
    return s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student';
  };

  const studentId = student?.id || student?.uid || null;

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

  const handleCardClick = async (card) => {
    // Fire-and-forget analytics; do not block UI
    try {
      await trackEvent('student_dashboard_card_click', { card, studentId });
    } catch (_) { /* no-op */ }
  };

  const openLessonNotes = () => {
    if (onOpenLessonNotes) {
      onOpenLessonNotes();
    } else if (onOpenTextNotes) {
      onOpenTextNotes();
    }
  };

  const disabledCardProps = {
    disabled: true,
    sx: {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Cards Grid */}
      <Grid container spacing={2}>
        {/* Text & Voice Notes */}
        <Grid size={12}>
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
              onClick={() => { handleCardClick('notes'); onOpenTextNotes && onOpenTextNotes(); }}
              sx={{ p: 0 }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: '#4f46e5', width: 56, height: 56 }}>
                      <NotesIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                        Text & Voice Notes
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                        View and add text/voice notes for {getFirstName(student)}
                      </Typography>
                    </Box>
                  </Box>
                  <ArrowForward sx={{ color: '#94a3b8' }} />
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* Lesson Notes */}
        <Grid size={12}>
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
                handleCardClick('lesson_notes'); 
                openLessonNotes();
              }}
              sx={{ p: 0 }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: '#6366f1', width: 56, height: 56 }}>
                      <MenuBookIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                        Lesson Notes
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                        Structured lesson notes for {getFirstName(student)}
                      </Typography>
                    </Box>
                  </Box>
                  <ArrowForward sx={{ color: '#94a3b8' }} />
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* Statistics */}
        <Grid size={12}>
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
                handleCardClick('stats'); 
                onOpenStats && onOpenStats();
              }}
              sx={{ p: 0 }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
            </CardActionArea>
          </Card>
        </Grid>

        {/* Intelligent Insights (coming soon) */}
        <Grid size={12}>
          <Card sx={{ borderRadius: 2 }}>
            <CardActionArea {...disabledCardProps} onClick={() => handleCardClick('insights')}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: '#0ea5e9', width: 56, height: 56 }}>
                      <InsightsIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                        Intelligent Insights
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                        Feature coming soon!
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* Report Generation (coming soon) */}
        <Grid size={12}>
          <Card sx={{ borderRadius: 2 }}>
            <CardActionArea {...disabledCardProps} onClick={() => handleCardClick('report')}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: '#10b981', width: 56, height: 56 }}>
                      <DescriptionIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                        Report Generation
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                        Feature coming soon!
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default StudentDashboard;
