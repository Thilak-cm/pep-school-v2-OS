import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Card,
  CardContent,
  Divider,
  IconButton,
  Chip,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Paper,
  Tabs,
  Tab,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  ArrowBack,
  Email,
  Person,
  Verified,
  AdminPanelSettings,
  School,
  BarChart,
  TrendingUp,
  CalendarToday,
  People,
  Mic,
  TextFields,
  Star,
  AccessTime
} from '@mui/icons-material';
import { collection, query, where, getDocs, orderBy, limit, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const ProfilePage = ({ user, role, onBack }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [stats, setStats] = useState({
    totalObservations: 0,
    thisWeek: 0,
    thisMonth: 0,
    voiceNotes: 0,
    textNotes: 0,
    topStudents: [],
    weeklyActivity: [],
    teacherStats: [],
    loading: true
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStats(prev => ({ ...prev, loading: true }));
        
        // Fetch all observations
        const observationsQuery = query(
          collection(db, 'observations'),
          orderBy('timestamp', 'desc')
        );
        const observationsSnap = await getDocs(observationsQuery);
        const allObservations = observationsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Calculate basic stats
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const thisWeek = allObservations.filter(obs => {
          const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
          return obsDate >= weekAgo;
        });

        const thisMonth = allObservations.filter(obs => {
          const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
          return obsDate >= monthAgo;
        });

        const voiceNotes = allObservations.filter(obs => obs.type === 'voice');
        const textNotes = allObservations.filter(obs => obs.type === 'text');

        // Get student stats with proper names
        const studentStats = {};
        const studentIds = [...new Set(allObservations.map(obs => obs.studentId).filter(Boolean))];
        
        // Fetch student data to get names
        const studentDocs = await Promise.all(
          studentIds.map(id => getDoc(doc(db, 'students', id)))
        );
        
        const studentDataMap = {};
        studentDocs.forEach((doc, index) => {
          if (doc.exists()) {
            const data = doc.data();
            studentDataMap[studentIds[index]] = data.name || 'Unknown Student';
          }
        });
        
        allObservations.forEach(obs => {
          if (obs.studentId) {
            if (!studentStats[obs.studentId]) {
              studentStats[obs.studentId] = { 
                count: 0, 
                name: studentDataMap[obs.studentId] || 'Unknown Student' 
              };
            }
            studentStats[obs.studentId].count++;
          }
        });

        const topStudents = Object.entries(studentStats)
          .map(([id, data]) => ({ id, ...data }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // Get teacher stats (if admin)
        let teacherStats = [];
        if (role === 'admin') {
          const teacherStatsMap = {};
          allObservations.forEach(obs => {
            const teacherId = obs.teacherEmail || obs.teacherName || 'Unknown';
            if (!teacherStatsMap[teacherId]) {
              teacherStatsMap[teacherId] = { 
                name: obs.teacherName || teacherId, 
                email: obs.teacherEmail || teacherId,
                count: 0 
              };
            }
            teacherStatsMap[teacherId].count++;
          });
          teacherStats = Object.values(teacherStatsMap)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        }

        // Weekly activity (last 4 weeks)
        const weeklyActivity = [];
        for (let i = 3; i >= 0; i--) {
          const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
          const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          
          const weekCount = allObservations.filter(obs => {
            const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
            return obsDate >= weekStart && obsDate < weekEnd;
          }).length;
          
          weeklyActivity.push({
            week: `Week ${4 - i}`,
            count: weekCount
          });
        }

        setStats({
          totalObservations: allObservations.length,
          thisWeek: thisWeek.length,
          thisMonth: thisMonth.length,
          voiceNotes: voiceNotes.length,
          textNotes: textNotes.length,
          topStudents,
          weeklyActivity,
          teacherStats,
          loading: false
        });

      } catch (error) {
        console.error('Error fetching stats:', error);
        setStats(prev => ({ ...prev, loading: false }));
      }
    };

    fetchStats();
  }, [role]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const StatCard = ({ title, value, icon, color = 'primary', subtitle }) => (
    <Card sx={{ 
      borderRadius: 2,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      height: '100%'
    }}>
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Box sx={{ 
            color: `${color}.main`, 
            mr: 1,
            display: 'flex',
            alignItems: 'center'
          }}>
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {title}
          </Typography>
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 700, color: `${color}.main` }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );

  const ProgressBar = ({ label, value, max, color = 'primary' }) => (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {value}/{max}
        </Typography>
      </Box>
      <LinearProgress 
        variant="determinate" 
        value={(value / max) * 100} 
        sx={{ 
          height: 8, 
          borderRadius: 4,
          backgroundColor: 'grey.200',
          '& .MuiLinearProgress-bar': {
            backgroundColor: `${color}.main`
          }
        }} 
      />
    </Box>
  );

  const NoteTypePieChart = ({ voiceNotes, textNotes }) => {
    const data = [
      { name: 'Voice Notes', value: voiceNotes, color: '#3b82f6' },
      { name: 'Text Notes', value: textNotes, color: '#f59e0b' }
    ].filter(item => item.value > 0);

    if (data.length === 0) {
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: 200,
          backgroundColor: 'grey.50',
          borderRadius: 2
        }}>
          <Typography variant="body2" color="text.secondary">
            No notes available for chart
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ height: 250, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value, name) => [value, name]}
              labelStyle={{ color: '#1e293b', fontWeight: 600 }}
              contentStyle={{ 
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              formatter={(value, entry) => (
                <span style={{ color: '#64748b', fontSize: '14px' }}>
                  {value} ({entry.payload.value})
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </Box>
    );
  };

  if (stats.loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 3,
        pb: 4 
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <IconButton 
            onClick={onBack}
            sx={{ 
              mr: 2,
              color: '#64748b',
              '&:hover': { backgroundColor: 'rgba(100, 116, 139, 0.08)' }
            }}
            aria-label="Go back"
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h5" sx={{ fontWeight: 600, color: '#1e293b' }}>
            Profile
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 3,
      pb: 4 
    }}>
      {/* Back Button */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <IconButton 
          onClick={onBack}
          sx={{ 
            mr: 2,
            color: '#64748b',
            '&:hover': { backgroundColor: 'rgba(100, 116, 139, 0.08)' }
          }}
          aria-label="Go back"
        >
          <ArrowBack />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 600, color: '#1e293b' }}>
          Profile
        </Typography>
      </Box>

      {/* Profile Photo Section */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        py: 2
      }}>
        <Avatar
          src={user?.photoURL}
          sx={{
            width: 120,
            height: 120,
            mb: 2,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            border: '4px solid white',
            fontSize: '3rem',
            fontWeight: 700,
            backgroundColor: '#4f46e5'
          }}
        >
          {user?.displayName?.charAt(0) || 'U'}
        </Avatar>
        
        <Typography variant="h4" sx={{ 
          fontWeight: 700, 
          color: '#1e293b',
          textAlign: 'center',
          mb: 0.5
        }}>
          {user?.displayName || 'User'}
        </Typography>
        
        <Typography variant="body1" sx={{ 
          color: '#64748b',
          textAlign: 'center',
          mb: 1
        }}>
          {user?.email}
        </Typography>
        
        <Typography variant="body2" sx={{ 
          color: role === 'admin' ? '#dc2626' : '#4f46e5',
          textAlign: 'center',
          fontWeight: 600,
          textTransform: 'capitalize'
        }}>
          {role === 'admin' ? 'Administrator' : 'Teacher'}
        </Typography>
      </Box>



      {/* Statistics Tabs */}
      <Card sx={{ 
        borderRadius: 3,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange}
            variant="fullWidth"
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600
              }
            }}
          >
            <Tab 
              icon={<BarChart />} 
              label="Overview" 
              iconPosition="start"
            />
            <Tab 
              icon={<People />} 
              label="Students" 
              iconPosition="start"
            />
            {role === 'admin' && (
              <Tab 
                icon={<School />} 
                label="Teachers" 
                iconPosition="start"
              />
            )}
          </Tabs>
        </Box>

        <CardContent sx={{ p: 3 }}>
          {/* Overview Tab */}
          {activeTab === 0 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                Observation Statistics
              </Typography>
              
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6}>
                  <StatCard
                    title="Total Notes"
                    value={stats.totalObservations}
                    icon={<BarChart />}
                    color="primary"
                  />
                </Grid>
                <Grid item xs={6}>
                  <StatCard
                    title="This Week"
                    value={stats.thisWeek}
                    icon={<TrendingUp />}
                    color="success"
                  />
                </Grid>
                <Grid item xs={6}>
                  <StatCard
                    title="Voice Notes"
                    value={stats.voiceNotes}
                    icon={<Mic />}
                    color="info"
                  />
                </Grid>
                <Grid item xs={6}>
                  <StatCard
                    title="Text Notes"
                    value={stats.textNotes}
                    icon={<TextFields />}
                    color="warning"
                  />
                </Grid>
              </Grid>

              {/* Weekly Activity */}
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Weekly Activity
              </Typography>
              <Box sx={{ mb: 3 }}>
                {stats.weeklyActivity.map((week, index) => (
                  <ProgressBar
                    key={week.week}
                    label={week.week}
                    value={week.count}
                    max={Math.max(...stats.weeklyActivity.map(w => w.count), 1)}
                    color={index === stats.weeklyActivity.length - 1 ? 'success' : 'primary'}
                  />
                ))}
              </Box>

              {/* Note Type Distribution */}
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Note Type Distribution
              </Typography>
              <Box sx={{ 
                backgroundColor: 'white',
                borderRadius: 2,
                p: 2,
                border: '1px solid #e2e8f0'
              }}>
                <NoteTypePieChart 
                  voiceNotes={stats.voiceNotes}
                  textNotes={stats.textNotes}
                />
              </Box>
            </Box>
          )}

          {/* Students Tab */}
          {activeTab === 1 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                Top Students by Notes
              </Typography>
              
              {stats.topStudents.length > 0 ? (
                <List sx={{ p: 0 }}>
                  {stats.topStudents.map((student, index) => (
                    <ListItem 
                      key={student.id}
                      sx={{ 
                        px: 0,
                        borderBottom: index < stats.topStudents.length - 1 ? '1px solid #f1f5f9' : 'none'
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ 
                          bgcolor: index === 0 ? 'warning.main' : 
                                  index === 1 ? 'grey.400' : 
                                  index === 2 ? 'warning.dark' : 'grey.300',
                          width: 40,
                          height: 40,
                          fontSize: '1rem',
                          fontWeight: 600
                        }}>
                          {index + 1}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={student.name}
                        secondary={`${student.count} notes`}
                        primaryTypographyProps={{ fontWeight: 600 }}
                        secondaryTypographyProps={{ color: 'text.secondary' }}
                      />
                      <Chip 
                        label={`#${index + 1}`}
                        size="small"
                        color={index === 0 ? 'warning' : 'default'}
                        variant={index === 0 ? 'filled' : 'outlined'}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Alert severity="info">
                  No student observations found yet.
                </Alert>
              )}
            </Box>
          )}

          {/* Teachers Tab (Admin Only) */}
          {activeTab === 2 && role === 'admin' && (
            <Box>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                Teacher Activity
              </Typography>
              
              {stats.teacherStats.length > 0 ? (
                <List sx={{ p: 0 }}>
                  {stats.teacherStats.map((teacher, index) => (
                    <ListItem 
                      key={teacher.email}
                      sx={{ 
                        px: 0,
                        borderBottom: index < stats.teacherStats.length - 1 ? '1px solid #f1f5f9' : 'none'
                      }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ 
                          bgcolor: index === 0 ? 'success.main' : 
                                  index === 1 ? 'info.main' : 
                                  index === 2 ? 'warning.main' : 'grey.300',
                          width: 40,
                          height: 40,
                          fontSize: '1rem',
                          fontWeight: 600
                        }}>
                          {teacher.name.charAt(0)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={teacher.name}
                        secondary={`${teacher.count} notes`}
                        primaryTypographyProps={{ fontWeight: 600 }}
                        secondaryTypographyProps={{ color: 'text.secondary' }}
                      />
                      <Chip 
                        label={`#${index + 1}`}
                        size="small"
                        color={index === 0 ? 'success' : 'default'}
                        variant={index === 0 ? 'filled' : 'outlined'}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Alert severity="info">
                  No teacher activity data available.
                </Alert>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ProfilePage; 