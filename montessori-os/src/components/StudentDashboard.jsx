// StudentDashboard.jsx
import React from 'react';
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
  ArrowForward
} from '@mui/icons-material';
import { trackEvent } from '../utils/analytics';

function StudentDashboard({ student, onOpenNotes }) {
  const getFirstName = (s) => {
    if (!s) return 'Student';
    if (s.firstName) return s.firstName;
    const name = s.name || s.displayName || `${s.firstName || ''} ${s.lastName || ''}`.trim();
    return name?.split(' ')[0] || 'Student';
  };

  const studentId = student?.id || student?.uid || null;

  const handleCardClick = async (card) => {
    // Fire-and-forget analytics; do not block UI
    try {
      await trackEvent('student_dashboard_card_click', { card, studentId });
    } catch (_) { /* no-op */ }
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
        {/* Notes (active) */}
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
              onClick={() => { handleCardClick('notes'); onOpenNotes && onOpenNotes(); }}
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
                        Notes
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                        View and add observations for {getFirstName(student)}
                      </Typography>
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

        {/* Statistics (coming soon) */}
        <Grid size={12}>
          <Card sx={{ borderRadius: 2 }}>
            <CardActionArea {...disabledCardProps} onClick={() => handleCardClick('stats')}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: '#f59e0b', width: 56, height: 56 }}>
                      <BarChartIcon />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                        Statistics
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

