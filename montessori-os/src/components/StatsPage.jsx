import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  IconButton
} from '@mui/material';
import {
  BarChart,
  TrendingUp,
  People,
  School,
  Mic,
  TextFields,
  ArrowBack
} from '@mui/icons-material';
import { collection, query, getDocs, orderBy, getDoc, doc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const StatsPage = ({ user, role, onBack }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [timePeriod, setTimePeriod] = useState('1W');
  const [studentCount, setStudentCount] = useState(5);
  const [stats, setStats] = useState({
    totalObservations: 0,
    thisWeek: 0,
    thisMonth: 0,
    voiceNotes: 0,
    textNotes: 0,
    topStudents: [],
    weeklyActivity: [],
    teacherStats: [],
    allObservations: [],
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
        let allObservations = observationsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Filter observations based on user role
        if (role === 'teacher') {
          console.log('Teacher filtering - User UID:', user.uid);
          console.log('Total observations before filtering:', allObservations.length);
          
          // For teachers, only show their own observations
          allObservations = allObservations.filter(obs => {
            console.log('Checking observation:', obs.id, 'userID:', obs.userID);
            
            // Use UID-based identification
            const isMatch = obs.userID === user.uid;
            
            console.log('Is match:', isMatch);
            return isMatch;
          });
          
          console.log('Observations after teacher filtering:', allObservations.length);
        }
        // For admins, show all observations (no filtering)

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
        let studentIDs = [...new Set(allObservations.map(obs => obs.studentID).filter(Boolean))];
        
        // For teachers, filter students to only their assigned classrooms
        if (role === 'teacher') {
          console.log('Starting classroom filtering for teacher');
          
          // Get teacher's assigned classrooms using UID
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          if (userDocSnap.exists()) {
            const teacherData = userDocSnap.data();
            const assignedClassroomNames = teacherData.assignedClassrooms || [];
            console.log('Teacher assigned classrooms:', assignedClassroomNames);
            
            // For now, let's just use the teacher-filtered observations
            // and not do additional classroom filtering since it's causing issues
            console.log('Using teacher-filtered observations without classroom filtering');
          } else {
            console.log('Teacher not found in users collection');
          }
        }
        
        // Fetch student data to get names
        const studentDocs = await Promise.all(
                      studentIDs.map(id => getDoc(doc(db, 'students', id)))
        );
        
        const studentDataMap = {};
        studentDocs.forEach((doc, index) => {
          if (doc.exists()) {
            const data = doc.data();
            studentDataMap[studentIDs[index]] = data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown Student';
          }
        });
        
                allObservations.forEach(obs => {
          if (obs.studentID) {
            if (!studentStats[obs.studentID]) {
              studentStats[obs.studentID] = {
                count: 0,
                name: studentDataMap[obs.studentID] || 'Unknown Student'
              };
            }
            studentStats[obs.studentID].count++;
          }
        });

        const topStudents = Object.entries(studentStats)
          .map(([id, data]) => ({ id, ...data }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // Get teacher stats (admin only)
        let teacherStats = [];
        if (role === 'admin') {
          const teacherStatsMap = {};
          allObservations.forEach(obs => {
                    const teacherId = obs.teacherEmail || obs.teacherName || obs.userID || 'Unknown';
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
          allObservations,
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
    // Prevent teachers from accessing the teachers tab (index 2)
    if (role === 'teacher' && newValue === 2) {
      return;
    }
    setActiveTab(newValue);
  };

  const handleTimePeriodChange = (event, newPeriod) => {
    if (newPeriod !== null) {
      setTimePeriod(newPeriod);
    }
  };

  const handleStudentCountChange = (event, newCount) => {
    if (newCount !== null) {
      setStudentCount(newCount);
    }
  };

  const generateActivityData = (observations, period) => {
    const now = new Date();
    const data = [];
    
    switch (period) {
      case '1D':
        // Last 24 hours in 4-hour intervals
        for (let i = 5; i >= 0; i--) {
          const start = new Date(now.getTime() - i * 4 * 60 * 60 * 1000);
          const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
          
          const count = observations.filter(obs => {
            const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
            return obsDate >= start && obsDate < end;
          }).length;
          
          data.push({
            period: `${start.getHours()}:00`,
            count
          });
        }
        break;
        
      case '1W':
        // Last 7 days
        for (let i = 6; i >= 0; i--) {
          const start = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
          
          const count = observations.filter(obs => {
            const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
            return obsDate >= start && obsDate < end;
          }).length;
          
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          data.push({
            period: dayNames[start.getDay()],
            count
          });
        }
        break;
        
      case '1M':
        // Last 4 weeks
        for (let i = 3; i >= 0; i--) {
          const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
          const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          
          const count = observations.filter(obs => {
            const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
            return obsDate >= weekStart && obsDate < weekEnd;
          }).length;
          
          data.push({
            period: `Week ${4 - i}`,
            count
          });
        }
        break;
        
      case '3M':
        // Last 3 months
        for (let i = 2; i >= 0; i--) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
          
          const count = observations.filter(obs => {
            const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
            return obsDate >= monthStart && obsDate < monthEnd;
          }).length;
          
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          data.push({
            period: monthNames[monthStart.getMonth()],
            count
          });
        }
        break;
        
      default:
        return [];
    }
    
    return data;
  };

  const ActivityBarChart = ({ data, period }) => {
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
            No activity data available
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ height: 250, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="period" 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              width={40}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              labelStyle={{ color: '#1e293b', fontWeight: 600 }}
            />
            <Bar 
              dataKey="count" 
              fill="#4f46e5" 
              radius={[4, 4, 0, 0]}
              maxBarSize={50}
            />
          </RechartsBarChart>
        </ResponsiveContainer>
      </Box>
    );
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
        justifyContent: 'center', 
        alignItems: 'center', 
        py: 8 
      }}>
        <CircularProgress />
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
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <IconButton 
          onClick={onBack} 
          aria-label="Go back"
          sx={{ mr: 2 }}
        >
          <ArrowBack />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 600, color: '#1e293b' }}>
          Statistics & Analytics
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

              {/* Activity Chart */}
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Activity Overview
              </Typography>
              
              {/* Time Period Toggles */}
              <Box sx={{ mb: 2 }}>
                <ToggleButtonGroup
                  value={timePeriod}
                  exclusive
                  onChange={handleTimePeriodChange}
                  size="small"
                  sx={{
                    '& .MuiToggleButton-root': {
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 2,
                      py: 1,
                      borderColor: '#e2e8f0',
                      '&.Mui-selected': {
                        backgroundColor: '#4f46e5',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: '#4338ca'
                        }
                      }
                    }
                  }}
                >
                  <ToggleButton value="1D">1D</ToggleButton>
                  <ToggleButton value="1W">1W</ToggleButton>
                  <ToggleButton value="1M">1M</ToggleButton>
                  <ToggleButton value="3M">3M</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              
              {/* Activity Bar Chart */}
              <Box sx={{ 
                backgroundColor: 'white',
                borderRadius: 2,
                p: 1,
                pl: 0,
                border: '1px solid #e2e8f0',
                mb: 3
              }}>
                <ActivityBarChart 
                  data={generateActivityData(stats.allObservations, timePeriod)}
                  period={timePeriod}
                />
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
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Top Students by Notes
              </Typography>
              
              {/* Student Count Toggle */}
              <Box sx={{ mb: 2 }}>
                <ToggleButtonGroup
                  value={studentCount}
                  exclusive
                  onChange={handleStudentCountChange}
                  size="small"
                  sx={{
                    '& .MuiToggleButton-root': {
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 2,
                      py: 1,
                      borderColor: '#e2e8f0',
                      '&.Mui-selected': {
                        backgroundColor: '#4f46e5',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: '#4338ca'
                        }
                      }
                    }
                  }}
                >
                  <ToggleButton value={3}>Top 3</ToggleButton>
                  <ToggleButton value={5}>Top 5</ToggleButton>
                  <ToggleButton value={10}>Top 10</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              
              {stats.topStudents.length > 0 ? (
                <Box>
                  {/* Target Indicator */}
                  <Box sx={{ mb: 2, p: 2, backgroundColor: '#f8fafc', borderRadius: 1, border: '1px solid #e2e8f0' }}>
                    <Typography variant="body2" color="text.secondary">
                      Target: 5 notes per week
                    </Typography>
                  </Box>
                  
                  {/* Functional Bar Chart */}
                  <Box sx={{ mb: 2, position: 'relative' }}>
                    {/* Single Target line and label */}
                    <Box sx={{
                      position: 'absolute',
                      left: `${(5 / Math.max(...stats.topStudents.slice(0, studentCount).map(s => s.count), 5)) * 100}%`,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      backgroundColor: '#64748b',
                      zIndex: 2
                    }} />
                    <Typography variant="caption" sx={{
                      position: 'absolute',
                      left: `${(5 / Math.max(...stats.topStudents.slice(0, studentCount).map(s => s.count), 5)) * 100}%`,
                      top: -20,
                      transform: 'translateX(-50%)',
                      color: '#64748b',
                      fontSize: '10px',
                      zIndex: 3
                    }}>
                      Target
                    </Typography>
                    
                    {stats.topStudents.slice(0, studentCount).map((student, index) => {
                      const target = 5;
                      const performance = student.count / target;
                      const barColor = performance >= 1 ? '#10b981' : 
                                     performance >= 0.6 ? '#f59e0b' : '#ef4444';
                      
                      return (
                        <Box key={student.id} sx={{ mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                              {student.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {student.count} notes
                            </Typography>
                          </Box>
                          <Box sx={{ position: 'relative', height: 24, backgroundColor: '#f1f5f9', borderRadius: 2 }}>
                            {/* Progress bar */}
                            <Box sx={{
                              height: '100%',
                              width: `${Math.min((student.count / Math.max(...stats.topStudents.slice(0, studentCount).map(s => s.count), target)) * 100, 100)}%`,
                              backgroundColor: barColor,
                              borderRadius: 2,
                              transition: 'width 0.3s ease'
                            }} />
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                  
                  {/* Summary Stats */}
                  <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderRadius: 1, border: '1px solid #e2e8f0' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Summary
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 3 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Above Target</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {stats.topStudents.slice(0, studentCount).filter(s => s.count >= 5).length} students
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Average Notes</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {(stats.topStudents.slice(0, studentCount).reduce((sum, s) => sum + s.count, 0) / Math.min(stats.topStudents.length, studentCount)).toFixed(1)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
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
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Teacher Performance Dashboard
              </Typography>
              
              {stats.teacherStats.length > 0 ? (
                <Box>
                  {/* Target Indicator */}
                  <Box sx={{ mb: 2, p: 2, backgroundColor: '#f8fafc', borderRadius: 1, border: '1px solid #e2e8f0' }}>
                    <Typography variant="body2" color="text.secondary">
                      Target: 10 notes per week
                    </Typography>
                  </Box>
                  
                  {/* Functional Bar Chart */}
                  <Box sx={{ mb: 2, position: 'relative' }}>
                    {/* Single Target line and label */}
                    <Box sx={{
                      position: 'absolute',
                      left: `${(10 / Math.max(...stats.teacherStats.map(t => t.count), 10)) * 100}%`,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      backgroundColor: '#64748b',
                      zIndex: 2
                    }} />
                    <Typography variant="caption" sx={{
                      position: 'absolute',
                      left: `${(10 / Math.max(...stats.teacherStats.map(t => t.count), 10)) * 100}%`,
                      top: -20,
                      transform: 'translateX(-50%)',
                      color: '#64748b',
                      fontSize: '10px',
                      zIndex: 3
                    }}>
                      Target
                    </Typography>
                    
                    {stats.teacherStats.map((teacher, index) => {
                      const target = 10;
                      const performance = teacher.count / target;
                      const barColor = performance >= 1 ? '#10b981' : 
                                     performance >= 0.5 ? '#f59e0b' : '#ef4444';
                      
                      return (
                        <Box key={teacher.email} sx={{ mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                              {teacher.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {teacher.count} notes
                            </Typography>
                          </Box>
                          <Box sx={{ position: 'relative', height: 24, backgroundColor: '#f1f5f9', borderRadius: 2 }}>
                            {/* Progress bar */}
                            <Box sx={{
                              height: '100%',
                              width: `${Math.min((teacher.count / Math.max(...stats.teacherStats.map(t => t.count), target)) * 100, 100)}%`,
                              backgroundColor: barColor,
                              borderRadius: 2,
                              transition: 'width 0.3s ease'
                            }} />
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                  
                  {/* Summary Stats */}
                  <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderRadius: 1, border: '1px solid #e2e8f0' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Team Performance Summary
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 3 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">High Engagement</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {stats.teacherStats.filter(t => t.count >= 10).length} teachers
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Average Notes</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {(stats.teacherStats.reduce((sum, t) => sum + t.count, 0) / stats.teacherStats.length).toFixed(1)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Total Observations</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {stats.teacherStats.reduce((sum, t) => sum + t.count, 0)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
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

export default StatsPage; 