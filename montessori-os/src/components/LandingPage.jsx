// LandingPage.jsx
import React from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Typography,
  CardActionArea,
  Avatar,
  Grid
} from '@mui/material';
import { 
  School, 
  Group,
  ArrowForward 
} from '@mui/icons-material';

function LandingPage({ onViewClassrooms, userRole, currentUser }) {
  const isTeacher = userRole === 'teacher';
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1" sx={{ 
          color: '#1e293b', 
          fontWeight: 600,
          mb: 1
        }}>
          {isTeacher ? 'Teacher Panel' : 'Admin Panel'}
        </Typography>
        <Typography variant="body1" sx={{ color: '#64748b' }}>
          {isTeacher 
            ? 'Manage your classrooms and students'
            : 'Manage school-wide settings and data'
          }
        </Typography>
      </Box>

      {/* Action Cards */}
      <Grid container spacing={2}>
        {/* View Classrooms Card */}
        <Grid item xs={12}>
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
              onClick={onViewClassrooms}
              sx={{ p: 0 }}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ 
                      bgcolor: '#4f46e5',
                      width: 56,
                      height: 56
                    }}>
                      <School />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" component="h3" sx={{ 
                        color: '#1e293b',
                        fontWeight: 600
                      }}>
                        {isTeacher ? 'View My Classrooms' : 'View All Classrooms'}
                      </Typography>
                      <Typography variant="body2" sx={{ 
                        color: '#64748b',
                        mt: 0.5
                      }}>
                        {isTeacher 
                          ? 'Access your assigned classrooms and students'
                          : 'Tap to view every classroom in the school'
                        }
                      </Typography>
                    </Box>
                  </Box>
                  <ArrowForward sx={{ color: '#94a3b8' }} />
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* Admin-only cards */}
        {!isTeacher && (
          <>
            {/* Bulk Upload Roster */}
            <Grid item xs={12}>
              <Card aria-label="Bulk upload roster coming soon" sx={{ opacity: 0.5 }}>
                <CardContent>
                  <Typography variant="h6" component="h2">
                    Bulk Upload Roster
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Feature coming soon
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Search & Filter Notes */}
            <Grid item xs={12}>
              <Card aria-label="Search and filter notes coming soon" sx={{ opacity: 0.5 }}>
                <CardContent>
                  <Typography variant="h6" component="h2">
                    Search &amp; Filter Notes
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Feature coming soon
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Add User (Admin/Teacher) - Coming Soon */}
            <Grid item xs={12}>
              <Card aria-label="Add user coming soon" sx={{ opacity: 0.5 }}>
                <CardContent>
                  <Typography variant="h6" component="h2">
                    Add User (Admin / Teacher)
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Feature coming soon
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </>
        )}

        {/* Teacher-only cards (future) */}
        {isTeacher && (
          <>
            {/* Future teacher cards can be added here */}
            {/* Example:
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography>My Reports</Typography>
                </CardContent>
              </Card>
            </Grid>
            */}
          </>
        )}
      </Grid>
    </Box>
  );
}

export default LandingPage; 