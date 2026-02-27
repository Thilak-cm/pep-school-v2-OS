import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material';
import { collectionGroup, query, getDocs, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

const StudentStatsPage = ({ student }) => {
  const [timePeriod, setTimePeriod] = useState('1W');
  const [stats, setStats] = useState({
    allObservations: [],
    voiceNotes: 0,
    textNotes: 0,
    loading: true
  });

  useEffect(() => {
    if (!student) return;

    const fetchStudentObservations = async () => {
      try {
        setStats(prev => ({ ...prev, loading: true }));
        
        const studentId = student.id || student.uid;
        if (!studentId) {
          setStats(prev => ({ ...prev, loading: false }));
          return;
        }

        // Query observations for this specific student (limit to last 200 for stats page)
        const observationsQuery = query(
          collectionGroup(db, 'observations'),
          where('studentId', '==', studentId),
          orderBy('observedAt', 'desc'),
          limit(200) // Limit to prevent excessive reads - stats page doesn't need all historical data
        );

        const observationsSnap = await getDocs(observationsQuery);
        const allObservations = observationsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Calculate note types
        const voiceNotes = allObservations.filter(obs => 
          obs.tags?.type === 'voice' || obs.type === 'voice' || obs.tags?.includes?.('voice') || obs.duration
        );
        const textNotes = allObservations.filter(obs => 
          obs.tags?.type === 'text' || obs.type === 'text' || obs.tags?.includes?.('text') || (!obs.duration && obs.text)
        );

        setStats({
          allObservations,
          voiceNotes: voiceNotes.length,
          textNotes: textNotes.length,
          loading: false
        });
      } catch {
        setStats(prev => ({ ...prev, loading: false }));
      }
    };

    fetchStudentObservations();
  }, [student]);

  const handleTimePeriodChange = (event, newPeriod) => {
    if (newPeriod !== null) {
      setTimePeriod(newPeriod);
    }
  };

  // Helper function to get observation date with fallback
  const getObservationDate = (obs) => {
    if (obs.observedAt?.toDate) return obs.observedAt.toDate();
    if (obs.createdAt?.toDate) return obs.createdAt.toDate();
    if (obs.observedAt?.seconds) return new Date(obs.observedAt.seconds * 1000);
    if (obs.createdAt?.seconds) return new Date(obs.createdAt.seconds * 1000);
    return new Date(0);
  };

  const generateActivityData = (observations, period) => {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const hourMs = 60 * 60 * 1000;
    const data = [];

    const startOfDay = (d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };

    switch (period) {
      case '1D': {
        for (let i = 5; i >= 0; i--) {
          const end = new Date(now.getTime() - i * 4 * hourMs);
          const start = new Date(end.getTime() - 4 * hourMs);

          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= start && obsDate < end;
          }).length;

          data.push({
            period: `${start.getHours()}:00`,
            count
          });
        }
        break;
      }

      case '1W': {
        const end0 = new Date(startOfDay(now).getTime() + dayMs);
        for (let i = 6; i >= 0; i--) {
          const start = new Date(end0.getTime() - (i + 1) * dayMs);
          const end = new Date(end0.getTime() - i * dayMs);

          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= start && obsDate < end;
          }).length;

          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          data.push({
            period: dayNames[start.getDay()],
            count
          });
        }
        break;
      }

      case '1M': {
        const end0 = new Date(startOfDay(now).getTime() + dayMs);
        for (let i = 3; i >= 0; i--) {
          const weekStart = new Date(end0.getTime() - (i + 1) * 7 * dayMs);
          const weekEnd = new Date(end0.getTime() - i * 7 * dayMs);

          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= weekStart && obsDate < weekEnd;
          }).length;

          data.push({
            period: `Week ${4 - i}`,
            count
          });
        }
        break;
      }
        
      case '3M':
        for (let i = 2; i >= 0; i--) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
          
          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= monthStart && obsDate < monthEnd;
          }).length;
          
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          data.push({
            period: monthNames[monthStart.getMonth()],
            count
          });
        }
        break;
        
      case '6M':
        for (let i = 5; i >= 0; i--) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
          
          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= monthStart && obsDate < monthEnd;
          }).length;
          
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          data.push({
            period: monthNames[monthStart.getMonth()],
            count
          });
        }
        break;
        
      case '1Y':
        for (let i = 11; i >= 0; i--) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
          
          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
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

  const activityData = useMemo(() => {
    return generateActivityData(stats.allObservations, timePeriod);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.allObservations, timePeriod]);

  const activityCount = useMemo(() => {
    const list = stats.allObservations || [];
    const now = new Date();
    let days = 7;
    switch (timePeriod) {
      case '1D': days = 1; break;
      case '1W': days = 7; break;
      case '1M': days = 30; break;
      case '3M': days = 90; break;
      case '6M': days = 180; break;
      case '1Y': days = 365; break;
      default: days = 7;
    }
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return list.filter(o => getObservationDate(o) >= start).length;
  }, [stats.allObservations, timePeriod]);

  // Memoize pie chart data to prevent re-renders when time period changes
  const pieChartData = useMemo(() => [
    { name: 'Voice Notes', value: stats.voiceNotes, color: '#3b82f6' },
    { name: 'Text Notes', value: stats.textNotes, color: '#f59e0b' }
  ], [stats.voiceNotes, stats.textNotes]);

  // Custom label to show % inside each pie slice - memoized to prevent flickering
  const renderNoteDistributionLabel = React.useCallback(({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent
  }) => {
    if (!percent || percent <= 0) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const label = `${Math.round(percent * 100)}%`;
    return (
      <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" style={{ fontWeight: 700 }}>
        {label}
      </text>
    );
  }, []);

  if (!student) return null;

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 3,
      pb: 4 
    }}>
      {stats.loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8, gap: 2, flexDirection: 'column' }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary">
            Coach Pepper is crunching this student&apos;s stats...
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Activity Trend Chart */}
          <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                mb: 3,
                p: 2,
                backgroundColor: 'primary.50',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'primary.200'
              }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', mb: 0.5 }}>
                    Activity Trend
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {timePeriod === '1D' ? 'Last 24 Hours' : 
                     timePeriod === '1W' ? 'Last 7 Days' :
                     timePeriod === '1M' ? 'Last 4 Weeks' :
                     timePeriod === '3M' ? 'Last 3 Months' :
                     timePeriod === '6M' ? 'Last 6 Months' :
                     timePeriod === '1Y' ? 'Last 12 Months' : 'Weekly'}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {activityCount}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    notes created
                  </Typography>
                </Box>
              </Box>
              
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
                  <ToggleButton value="6M">6M</ToggleButton>
                  <ToggleButton value="1Y">1Y</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              
              {activityData.length === 0 ? (
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  height: 200,
                  backgroundColor: 'grey.50',
                  borderRadius: 2
                }}>
                  <Typography variant="body2" color="text.secondary">
                    No trend data available for {timePeriod}
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ height: 250, width: '100%', minWidth: 0, minHeight: 250 }}>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={activityData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
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
                        tickFormatter={(value) => Math.round(value)}
                      />
                      <RechartsTooltip 
                        contentStyle={{ 
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <Box sx={{
                                backgroundColor: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: 2,
                                p: 1.5,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                              }}>
                                <Typography sx={{ fontSize: '16px', fontWeight: 'bold', color: '#4f46e5' }}>
                                  {payload[0].value} {payload[0].value === 1 ? 'note' : 'notes'}
                                </Typography>
                                <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                                  Time: {payload[0].payload.period}
                                </Typography>
                              </Box>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#4f46e5" 
                        strokeWidth={3}
                        dot={{ fill: '#4f46e5', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Note Distribution Card */}
          <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                All Time Note Distribution
              </Typography>
              
              {/* Pie Chart */}
              <Box sx={{ height: 250, width: '100%', minWidth: 0, minHeight: 250 }}>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      label={renderNoteDistributionLabel}
                      labelLine={false}
                      isAnimationActive={false}
                    >
                      {pieChartData.map((entry) => (
                        <Cell 
                          key={`cell-${entry.name}-${entry.value}`}
                          fill={entry.color}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ 
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                      formatter={(value, name) => [value, name]}
                      labelFormatter={(label) => `${label}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              
              {/* Simple Legend */}
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 4 }}>
                {pieChartData.map((item, index) => (
                  <Box key={index} sx={{ textAlign: 'center' }}>
                    <Box sx={{ 
                      width: 16, 
                      height: 16, 
                      bgcolor: item.color, 
                      borderRadius: '50%',
                      mx: 'auto',
                      mb: 1,
                      border: '2px solid white',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }} />
                    <Typography variant="body2" sx={{ fontWeight: 600, color: item.color, mb: 0.5 }}>
                      {item.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.name}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default StudentStatsPage;
