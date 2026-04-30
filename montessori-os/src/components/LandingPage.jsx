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
  ArrowForward,
  Feedback,
  BarChart,
  PersonAdd,
  Download,
  Psychology
} from '@mui/icons-material';
function LandingPage({ onViewClassrooms, userRole, currentUser, onNavigateToFeedbackDashboard, onNavigateToFeedback, onNavigateToClassroomNotes, onNavigate }) {
  const isTeacher = userRole === 'teacher';
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <Typography variant="body1" sx={{ 
          color: 'black',
          fontWeight: 600
        }}>
          {`Hey ${currentUser.displayName},`}
          <br />
          {`Welcome to Pep School V2 OS!`}
        </Typography>
      </Box>

      {/* Action Cards */}
      <Grid container spacing={2}>
        {/* View Classrooms Card */}
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
                      bgcolor: 'var(--color-primary)',
                      width: 56,
                      height: 56
                    }}>
                      <School />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" component="h3" sx={{ 
                        color: 'var(--color-text)',
                        fontWeight: 600
                      }}>
                        Classrooms & Students
                      </Typography>
                      <Typography variant="body2" sx={{ 
                        color: 'var(--color-text-soft)',
                        mt: 0.5
                      }}>
                        {isTeacher 
                          ? 'Access your assigned classrooms and students'
                          : 'Browse classrooms and students'
                        }
                      </Typography>
                    </Box>
                  </Box>
                  <ArrowForward sx={{ color: 'var(--color-text-faint)' }} />
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

        {/* Teacher Feedback Card */}
        {isTeacher && (
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
                onClick={onNavigateToFeedback}
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
                        bgcolor: 'var(--color-secondary)',
                        width: 56,
                        height: 56
                      }}>
                        <Feedback />
                      </Avatar>
                      <Box>
                        <Typography variant="h6" component="h3" sx={{ 
                          color: 'var(--color-text)',
                          fontWeight: 600
                        }}>
                          Share Feedback
                        </Typography>
                        <Typography variant="body2" sx={{ 
                          color: 'var(--color-text-soft)',
                          mt: 0.5
                        }}>
                          Help us improve by sharing your suggestions and reporting issues
                        </Typography>
                      </Box>
                    </Box>
                    <ArrowForward sx={{ color: 'var(--color-text-faint)' }} />
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        )}

        {/* Stats Card - Available for both admin and teacher */}
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
              onClick={() => onNavigate('/stats')}
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
                      bgcolor: 'var(--color-warning)',
                      width: 56,
                      height: 56
                    }}>
                      <BarChart />
                    </Avatar>
                    <Box>
                      <Typography variant="h6" component="h3" sx={{ 
                        color: 'var(--color-text)',
                        fontWeight: 600
                      }}>
                        Statistics & Analytics
                      </Typography>
                      <Typography variant="body2" sx={{ 
                        color: 'var(--color-text-soft)',
                        mt: 0.5
                      }}>
                        {isTeacher 
                          ? 'View your classroom performance and student progress'
                          : 'Monitor school-wide metrics'
                        }
                      </Typography>
                    </Box>
                  </Box>
                  <ArrowForward sx={{ color: 'var(--color-text-faint)' }} />
                </Box>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>

            {/* Admin-only cards */}
            {!isTeacher && (
              <>
                {/* Users & Access */}
                <Grid size={12}>
              <Card 
                aria-label="Users & Access"
                sx={{ 
                  cursor: 'pointer',
                  borderRadius: 2,
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
                  }
                }}
                onClick={() => onNavigate('/addUser')}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between'
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ 
                        bgcolor: 'var(--color-primary)',
                        width: 56,
                        height: 56
                      }}>
                        <PersonAdd />
                      </Avatar>
                      <Box>
                        <Typography variant="h6" component="h3" sx={{ 
                          color: 'var(--color-text)',
                          fontWeight: 600
                        }}>
                          Users & Access
                        </Typography>
                        <Typography variant="body2" sx={{ 
                          color: 'var(--color-text-soft)',
                          mt: 0.5
                        }}>
                          Manage teacher access and student onboarding
                        </Typography>
                      </Box>
                    </Box>
                    <ArrowForward sx={{ color: 'var(--color-text-faint)' }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>


            {/* Review Classroom Notes */}
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
                  onClick={onNavigateToClassroomNotes}
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
                          bgcolor: 'var(--color-info-dark)',
                          width: 56,
                          height: 56
                        }}>
                          <Download />
                        </Avatar>
                        <Box>
                          <Typography variant="h6" component="h3" sx={{ 
                            color: 'var(--color-text)',
                            fontWeight: 600
                          }}>
                            Export Notes
                          </Typography>
                          <Typography variant="body2" sx={{ 
                            color: 'var(--color-text-soft)',
                            mt: 0.5
                          }}>
                            Save notes as .txt files
                          </Typography>
                        </Box>
                      </Box>
                      <ArrowForward sx={{ color: 'var(--color-text-faint)' }} />
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>

            {/* Feedback Dashboard */}
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
                  onClick={onNavigateToFeedbackDashboard}
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
                          bgcolor: 'var(--color-secondary)',
                          width: 56,
                          height: 56
                        }}>
                          <Feedback />
                        </Avatar>
                        <Box>
                          <Typography variant="h6" component="h3" sx={{ 
                            color: 'var(--color-text)',
                            fontWeight: 600
                          }}>
                            Feedback Dashboard
                          </Typography>
                          <Typography variant="body2" sx={{ 
                            color: 'var(--color-text-soft)',
                            mt: 0.5
                          }}>
                            View and manage all user feedback and suggestions
                          </Typography>
                        </Box>
                      </Box>
                      <ArrowForward sx={{ color: 'var(--color-text-faint)' }} />
                    </Box>
                  </CardContent>
                </CardActionArea>
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
