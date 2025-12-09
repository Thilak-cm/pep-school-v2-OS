// StudentDashboard.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Avatar,
  CardActionArea
} from '@mui/material';
import {
  Notes as NotesIcon,
  BarChart as BarChartIcon,
  WarningAmber as WarningIcon,
  ArrowForward
} from '@mui/icons-material';
import { collectionGroup, query, getDocs, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { trackEvent } from '../utils/analytics';
function StudentDashboard({ student, onOpenTimeline, onOpenStats, initialNoteType = 'textVoice' }) {
  const [notesLast7Days, setNotesLast7Days] = useState(null); // null = loading, number = count

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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
