import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  Select,
  FormControl,
  InputLabel,
  MenuItem
} from '@mui/material';
import { BarChart3 as BarChart, TrendingUp, TrendingDown, Users as People, GraduationCap as School, ArrowLeft as ArrowBack } from '../icons';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import PerformanceSummaryCard from './PerformanceSummaryCard';
import { isAdminRole } from '../utils/roleUtils';
import { useStatsData } from '../hooks/useStatsData';

/** Format ms timestamp as a short relative string, e.g. "3 min ago", "2 hours ago" */
const formatRelativeTime = (ms) => {
  if (!ms) return null;
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

const StatsPage = ({ user, role, manageableClassrooms = [], onBack, onNavigateToStudent, onNavigateToBaseballCard: _onNavigateToBaseballCard }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [timePeriod, setTimePeriod] = useState('1W');
  const [classroomTimePeriod, setClassroomTimePeriod] = useState('1W');
  const [teacherTimePeriod, setTeacherTimePeriod] = useState('1W');
  const [selectedTeacherClassroomId, setSelectedTeacherClassroomId] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [mounted, setMounted] = useState(false);

  const isAdmin = isAdminRole(role);
  const isClassroomAdmin = role === 'classroomadmin';

  // ── Stats data from server-side cache (PEP-285) ──────────────────
  // Discover teacher classrooms for the hook
  const [teacherClassrooms, setTeacherClassrooms] = useState([]);
  const [teacherClassroomError, setTeacherClassroomError] = useState(null);
  useEffect(() => {
    if (role !== 'teacher' || !user?.uid) return;
    (async () => {
      try {
        setTeacherClassroomError(null);
        const snap = await getDocs(query(collection(db, 'classrooms'), where('teacherIds', 'array-contains', user.uid)));
        setTeacherClassrooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        setTeacherClassrooms([]);
        setTeacherClassroomError(e?.message || 'Failed to load your classrooms');
      }
    })();
  }, [role, user?.uid]);

  const { classroomDocs, loading: hookLoading, error: hookError, refreshing, refresh, cachedAt } = useStatsData({
    user, role, manageableClassrooms, userClassrooms: teacherClassrooms,
  });

  // Derive the state shapes the original rendering code expects from classroomDocs
  const classrooms = useMemo(() => classroomDocs.map(d => ({
    id: d.classroomId, name: d.classroomName, branchId: d.branchId,
    teacherIds: (d.teachers || []).map(t => t.id),
  })), [classroomDocs]);

  // Build stats object matching the original shape for compatibility
  const stats = useMemo(() => {
    if (hookLoading && classroomDocs.length === 0) return { loading: true, allObservations: [], topStudents: [], teacherStats: [], classroomStats: [] };
    const topStudents = classroomDocs.flatMap(d => d.students || [])
      .filter(s => (s.status || 'active') === 'active')
      .map(s => ({ id: s.id, name: s.name, thisWeekCount: s.thisWeekNotes || 0, count: s.totalNotes || 0 }))
      .sort((a, b) => b.thisWeekCount - a.thisWeekCount)
      .slice(0, 10);
    return { loading: false, allObservations: [], topStudents, teacherStats: [], classroomStats: [] };
  }, [hookLoading, classroomDocs]);

  // Scope error for classroomadmins with no managed classrooms
  const scopeError = (isClassroomAdmin && manageableClassrooms.length === 0)
    ? 'Your classroom access is missing. Please contact a super admin to add manageable classrooms.'
    : '';

  // Tab loading (all data arrives at once now, no per-tab lazy loading)


  const singleBranchId = useMemo(() => {
    if (!isClassroomAdmin) return null;
    const branchIds = Array.from(new Set(classrooms.map(c => c?.branchId).filter(Boolean)));
    return branchIds.length === 1 ? branchIds[0] : null;
  }, [classrooms, isClassroomAdmin]);

  const hideBranchSelector = Boolean(isClassroomAdmin && singleBranchId);

  useEffect(() => { setMounted(true); }, []);

  // Fetch branches for admin branch filter
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'branches'));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setBranches(data);
        if (data.length > 0) setSelectedBranchId(prev => prev || data[0].id);
      } catch (_e) { setBranches([]); }
    })();
  }, [isAdmin]);

  useEffect(() => {
    if (hideBranchSelector && singleBranchId && selectedBranchId !== singleBranchId) {
      setSelectedBranchId(singleBranchId);
    }
  }, [hideBranchSelector, singleBranchId, selectedBranchId]);

  useEffect(() => {
    if (!selectedTeacherClassroomId) return;
    const exists = classrooms.some(c => c.id === selectedTeacherClassroomId);
    if (!exists) setSelectedTeacherClassroomId('');
  }, [classrooms, selectedTeacherClassroomId]);


  // ── Simplified handleTabChange (no lazy loading needed) ──────────
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  // ── Derived computations from classroomDocs (PEP-285) ────────────

  const computePerformanceSummary = () => {
    const allStudents = classroomDocs.flatMap(d => d.students || [])
      .filter(s => (s.status || 'active') === 'active');
    const seen = new Set();
    const unique = allStudents.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
    const totals = { excellent: 0, sufficient: 0, needsSupport: 0, immediateAttention: 0, studentCount: unique.length, averageNotes: 0, totalNotes: 0 };
    if (unique.length === 0) return totals;
    for (const s of unique) {
      const n = Number.isFinite(s.last42DaysNotes) ? s.last42DaysNotes : 0;
      totals.totalNotes += n;
      if (n >= 12) totals.excellent++;
      else if (n >= 8) totals.sufficient++;
      else if (n >= 4) totals.needsSupport++;
      else totals.immediateAttention++;
    }
    totals.averageNotes = totals.totalNotes / totals.studentCount;
    return totals;
  };

  const performanceSummaryForCard = useMemo(
    () => computePerformanceSummary(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [classroomDocs]
  );

  // Classroom stats from pre-computed cache docs
  const classroomStatsForPeriod = useMemo(() => {
    const config = classroomTimePeriod === '1M'
      ? { tier: 'weekly', slice: 4 }
      : { tier: 'daily', slice: 7 };

    return classroomDocs.map(doc => {
      const tierMap = doc.activity?.[config.tier] || {};
      const entries = Object.entries(tierMap).sort(([a], [b]) => a.localeCompare(b));
      const recent = entries.slice(-config.slice);
      const periodTotal = recent.reduce((sum, [, count]) => sum + count, 0);
      const nc = doc.noteCounts || {};
      const totalAll = nc.total || 1;
      const obsRatio = ((nc.voice || 0) + (nc.text || 0)) / totalAll;
      const lessonRatio = (nc.lesson || 0) / totalAll;
      const mediaRatio = (nc.media || 0) / totalAll;

      return {
        id: doc.classroomId,
        name: doc.classroomName,
        branchId: doc.branchId,
        thisWeekObservationNotes: Math.round(periodTotal * obsRatio),
        thisWeekLessonNotes: Math.round(periodTotal * lessonRatio),
        thisWeekMediaNotes: Math.round(periodTotal * mediaRatio),
      };
    });
  }, [classroomTimePeriod, classroomDocs]);

  // Pie chart data filtered by time period using per-type activity tiers
  const pieChartData = useMemo(() => {
    const tierKey = (timePeriod === '1D' || timePeriod === '1W') ? 'daily'
      : (timePeriod === '1M') ? 'weekly' : 'monthly';
    const sliceMap = { '1D': 1, '1W': 7, '1M': 4, '3M': 3, '6M': 6, '1Y': 12 };
    const sliceN = sliceMap[timePeriod] || 7;

    const sumTier = (type) => {
      let total = 0;
      for (const doc of classroomDocs) {
        const tierMap = doc.activityByType?.[type]?.[tierKey] || {};
        const entries = Object.entries(tierMap).sort(([a], [b]) => a.localeCompare(b));
        total += entries.slice(-sliceN).reduce((sum, [, count]) => sum + count, 0);
      }
      return total;
    };

    // Fall back to all-time noteCounts if activityByType not yet in cache docs
    const hasTypeTiers = classroomDocs.some(d => d.activityByType);
    if (!hasTypeTiers) {
      const nc = { voice: 0, text: 0, lesson: 0, media: 0 };
      for (const doc of classroomDocs) {
        const c = doc.noteCounts || {};
        nc.voice += c.voice || 0; nc.text += c.text || 0;
        nc.lesson += c.lesson || 0; nc.media += c.media || 0;
      }
      return [
        { name: 'Voice', value: nc.voice, color: '#3b82f6' }, /* Recharts */
        { name: 'Text', value: nc.text, color: '#f59e0b' }, /* Recharts */
        { name: 'Lesson', value: nc.lesson, color: '#059669' }, /* Recharts */
        { name: 'Media', value: nc.media, color: '#ec4899' } /* Recharts */
      ];
    }

    return [
      { name: 'Voice', value: sumTier('voice'), color: '#3b82f6' }, /* Recharts */
      { name: 'Text', value: sumTier('text'), color: '#f59e0b' }, /* Recharts */
      { name: 'Lesson', value: sumTier('lesson'), color: '#059669' }, /* Recharts */
      { name: 'Media', value: sumTier('media'), color: '#ec4899' } /* Recharts */
    ];
  }, [classroomDocs, timePeriod]);

  const handleTimePeriodChange = (event, newPeriod) => {
    if (newPeriod !== null) setTimePeriod(newPeriod);
  };

  const handleClassroomTimePeriodChange = (event, newPeriod) => {
    if (newPeriod !== null) setClassroomTimePeriod(newPeriod);
  };

  const handleTeacherTimePeriodChange = (event, newPeriod) => {
    if (newPeriod !== null) setTeacherTimePeriod(newPeriod);
  };

  const handleTeacherClassroomChange = (event) => {
    setSelectedTeacherClassroomId(event.target.value);
  };

  // Activity count from pre-computed tiers
  const activityCount = useMemo(() => {
    const tierKey = (timePeriod === '1D' || timePeriod === '1W') ? 'daily'
      : (timePeriod === '1M') ? 'weekly' : 'monthly';
    const sliceMap = { '1D': 1, '1W': 7, '1M': 4, '3M': 3, '6M': 6, '1Y': 12 };
    const sliceN = sliceMap[timePeriod] || 7;
    let total = 0;
    for (const doc of classroomDocs) {
      const tierMap = doc.activity?.[tierKey] || {};
      const entries = Object.entries(tierMap).sort(([a], [b]) => a.localeCompare(b));
      const recent = entries.slice(-sliceN);
      total += recent.reduce((sum, [, count]) => sum + count, 0);
    }
    return total;
  }, [classroomDocs, timePeriod]);

  // Teachers for selected classroom from pre-computed data
  const teachersForSelectedClassroom = useMemo(() => {
    if (!selectedTeacherClassroomId) return [];
    const doc = classroomDocs.find(d => d.classroomId === selectedTeacherClassroomId);
    if (!doc) return [];

    const config = teacherTimePeriod === '1M'
      ? { tier: 'weekly', slice: 4 }
      : { tier: 'daily', slice: 7 };

    const tierMap = doc.activity?.[config.tier] || {};
    const entries = Object.entries(tierMap).sort(([a], [b]) => a.localeCompare(b));
    const recentEntries = entries.slice(-config.slice);
    const periodTotal = recentEntries.reduce((sum, [, count]) => sum + count, 0);
    const allTimeTotal = (doc.noteCounts?.total) || 1;

    const list = (doc.teachers || []).map(t => {
      const teacherAllTime = t.observations + t.lessons;
      const teacherRatio = teacherAllTime / Math.max(allTimeTotal, 1);
      const periodEstimate = Math.round(periodTotal * teacherRatio);
      const lessonRatio = teacherAllTime > 0 ? t.lessons / teacherAllTime : 0;

      return {
        id: t.id,
        name: t.name,
        email: t.email,
        status: t.status,
        periodObservations: periodEstimate,
        periodObservationNotes: Math.round(periodEstimate * (1 - lessonRatio)),
        periodLessonNotes: Math.round(periodEstimate * lessonRatio),
        otherClassroomCount: t.otherClassroomCount || 0,
        otherClassroomNotes: t.otherClassroomNotes || 0,
      };
    });

    list.sort((a, b) => {
      if (b.periodObservations !== a.periodObservations) return b.periodObservations - a.periodObservations;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });

    return list;
  }, [classroomDocs, selectedTeacherClassroomId, teacherTimePeriod]);

  // Hard-stop UI if classroom scoping is missing
  if (scopeError) {
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {onBack && (
          <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ alignSelf: 'flex-start' }}>
            Back
          </Button>
        )}
        <Alert severity="error">{scopeError}</Alert>
      </Box>
    );
  }

  // Generate activity data from pre-computed tiers
  const generateActivityData = (period) => {
    const tierKey = (period === '1D' || period === '1W') ? 'daily'
      : (period === '1M') ? 'weekly' : 'monthly';

    // Merge tier maps across all classroom docs
    const merged = {};
    for (const doc of classroomDocs) {
      const tierMap = doc.activity?.[tierKey] || {};
      for (const [key, count] of Object.entries(tierMap)) {
        merged[key] = (merged[key] || 0) + count;
      }
    }

    const sortedEntries = Object.entries(merged).sort(([a], [b]) => a.localeCompare(b));
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    switch (period) {
      case '1D':
        return sortedEntries.slice(-1).map(([key, count]) => ({ period: key.slice(5), count }));
      case '1W':
        return sortedEntries.slice(-7).map(([key, count]) => {
          const d = new Date(key + 'T00:00:00');
          return { period: dayNames[d.getDay()] || key, count };
        });
      case '1M':
        return sortedEntries.slice(-4).map(([_key, count], i) => ({
          period: `Week ${i + 1}`, count
        }));
      case '3M':
        return sortedEntries.slice(-3).map(([key, count]) => {
          const m = parseInt(key.split('-')[1], 10) - 1;
          return { period: monthNames[m] || key, count };
        });
      case '6M':
        return sortedEntries.slice(-6).map(([key, count]) => {
          const m = parseInt(key.split('-')[1], 10) - 1;
          return { period: monthNames[m] || key, count };
        });
      case '1Y':
        return sortedEntries.slice(-12).map(([key, count]) => {
          const m = parseInt(key.split('-')[1], 10) - 1;
          return { period: monthNames[m] || key, count };
        });
      default:
        return [];
    }
  };

  const StatCard = ({ title, value, icon, color = 'primary', subtitle, trend }) => (
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
        {trend && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
            {trend > 0 ? (
              <TrendingUp size={16} style={{ color: 'var(--color-success)', marginRight: 4 }} />
            ) : (
              <TrendingDown size={16} style={{ color: 'var(--color-error)', marginRight: 4 }} />
            )}
            <Typography 
              variant="caption" 
              color={trend > 0 ? 'success.main' : 'error.main'}
              sx={{ fontWeight: 600 }}
            >
              {Math.abs(trend).toFixed(1)}%
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  // Removed TabNavigationGrid (replaced with compact Tabs header)



  const ClassroomComparisonChart = () => {
    const filteredClassroomStats = useMemo(() => {
      if (isAdmin && selectedBranchId) {
        const selectedBranch = branches.find(b => b.id === selectedBranchId);
        if (selectedBranch && Array.isArray(selectedBranch.classrooms) && selectedBranch.classrooms.length > 0) {
          const branchClassroomIds = selectedBranch.classrooms.map(cid => {
            const parts = String(cid).split('/');
            return parts[parts.length - 1];
          });
          return classroomStatsForPeriod.filter(classroom =>
            branchClassroomIds.includes(classroom.id)
          );
        }
        return classroomStatsForPeriod.filter(classroom => classroom.branchId === selectedBranchId);
      }
      return classroomStatsForPeriod;
    }, [classroomStatsForPeriod, selectedBranchId, isAdmin, branches]);

    if (!mounted) {
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
            Coach Pepper is sketching this chart…
          </Typography>
        </Box>
      );
    }

    if (filteredClassroomStats.length === 0) {
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
            No classroom data available
          </Typography>
        </Box>
      );
    }

    const data = filteredClassroomStats.map(classroom => ({
      name: classroom.name,
      Observations: classroom.thisWeekObservationNotes ?? classroom.thisWeekObservations ?? 0,
      'Lesson Notes': classroom.thisWeekLessonNotes ?? 0,
      'Media Notes': classroom.thisWeekMediaNotes ?? 0
    }));

    // Don't render chart until mounted AND has data
    if (!mounted || data.length === 0) {
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: 300,
          backgroundColor: 'grey.50',
          borderRadius: 2
        }}>
          <Typography variant="body2" color="text.secondary">
            {!mounted ? 'Loading chart...' : 'No classroom data available'}
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ width: '100%', minWidth: 0 }}>
        <Box sx={{ height: 300, width: '100%', minWidth: 0, minHeight: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={data} margin={{ top: 16, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /> {/* Recharts — hex required */}
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: '#64748b' }} /* Recharts */
              axisLine={{ stroke: '#e2e8f0' }} /* Recharts */
              angle={-45}
              textAnchor="end"
              height={70}
              tickMargin={6}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748b' }} /* Recharts */
              axisLine={{ stroke: '#e2e8f0' }} /* Recharts */
              tickLine={false}
              width={40}
              tickFormatter={(value) => Math.round(value)}
            />
            <RechartsTooltip 
              contentStyle={{ 
                backgroundColor: 'white',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const observationsValue = payload.find(item => item.dataKey === 'Observations')?.value ?? 0;
                  const lessonNotesValue = payload.find(item => item.dataKey === 'Lesson Notes')?.value ?? 0;
                  const mediaNotesValue = payload.find(item => item.dataKey === 'Media Notes')?.value ?? 0;
                  const notesCount = observationsValue + lessonNotesValue + mediaNotesValue;
                  return (
                    <Box sx={{
                      backgroundColor: 'white',
                      border: '1px solid var(--color-border)',
                      borderRadius: 2,
                      p: 1.5,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                      <Typography sx={{ fontSize: '14px', fontWeight: 700, color: 'var(--grey-900)' }}>
                        {label}
                      </Typography>
                      <Typography sx={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-primary)', mt: 0.5 }}>
                        {notesCount} {notesCount === 1 ? 'note' : 'notes'}
                      </Typography>
                      <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                        <Typography sx={{ fontSize: '12px', color: 'var(--color-primary)' }}>
                          Observations: {observationsValue}
                        </Typography>
                        <Typography sx={{ fontSize: '12px', color: 'var(--color-secondary)' }}>
                          Lesson Notes: {lessonNotesValue}
                        </Typography>
                        <Typography sx={{ fontSize: '12px', color: 'var(--color-pink)' }}>
                          Media Notes: {mediaNotesValue}
                        </Typography>
                      </Box>
                    </Box>
                  );
                }
                return null;
              }}
            />
              <Bar dataKey="Observations" stackId="notes" fill="#4f46e5" radius={[0, 0, 0, 0]} /> {/* Recharts — hex required */}
              <Bar dataKey="Lesson Notes" stackId="notes" fill="#059669" radius={[0, 0, 0, 0]} /> {/* Recharts */}
              <Bar dataKey="Media Notes" stackId="notes" fill="#ec4899" radius={[0, 0, 0, 0]} /> {/* Recharts */}
            </RechartsBarChart>
          </ResponsiveContainer>
        </Box>
        <Box sx={{ mt: 0, display: 'flex', justifyContent: 'center' }}>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              alignItems: 'center',
              px: 1.5,
              py: 0.5,
              borderRadius: 999,
              border: '1px solid var(--color-border)',
              backgroundColor: 'white'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--color-primary)' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Observations
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--color-secondary)' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Lesson Notes
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--color-pink)' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Media Notes
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  const ActivityTrendChart = () => {
    const activityData = generateActivityData(timePeriod);
    
    if (!mounted) {
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
            Coach Pepper is crunching the numbers…
          </Typography>
        </Box>
      );
    }
    
    if (activityData.length === 0) {
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
            No trend data available for {timePeriod}
          </Typography>
        </Box>
      );
    }

    // Don't render chart until mounted AND container has dimensions
    if (!mounted || activityData.length === 0) {
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: 250,
          backgroundColor: 'grey.50',
          borderRadius: 2
        }}>
          <Typography variant="body2" color="text.secondary">
            {!mounted ? 'Loading chart...' : 'No trend data available for ' + timePeriod}
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ height: 250, width: '100%', minWidth: 0, minHeight: 250, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activityData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /> {/* Recharts — hex required */}
            <XAxis
              dataKey="period"
              tick={{ fontSize: 12, fill: '#64748b' }} /* Recharts */
              axisLine={{ stroke: '#e2e8f0' }} /* Recharts */
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748b' }} /* Recharts */
              axisLine={{ stroke: '#e2e8f0' }} /* Recharts */
              tickLine={false}
              width={40}
              tickFormatter={(value) => Math.round(value)}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              content={({ active, payload, label: _label }) => {
                if (active && payload && payload.length) {
                  return (
                    <Box sx={{
                      backgroundColor: 'white',
                      border: '1px solid var(--color-border)',
                      borderRadius: 2,
                      p: 1.5,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                      <Typography sx={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                        {payload[0].value} {payload[0].value === 1 ? 'note' : 'notes'}
                      </Typography>
                      <Typography sx={{ fontSize: '12px', color: 'var(--color-text-soft)' }}>
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
              stroke="#4f46e5" /* Recharts */
              strokeWidth={3}
              dot={{ fill: '#4f46e5', strokeWidth: 2, r: 4 }} /* Recharts */
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    );
  };

  const classroomPeriodLabel = classroomTimePeriod === '1M' ? 'Notes This Month' : 'Notes This Week';
  const _TeacherPeriodLabel = teacherTimePeriod === '1M' ? 'Last 30 days' : 'Last 7 days';

  if (stats.loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        py: 8,
        gap: 2,
        flexDirection: 'column'
      }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Coach Pepper is tallying the stats...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      mt: -2,
      pb: 4,
      width: '100%',
      minWidth: 0
    }}>
      {/* Error / stale / refresh bar */}
      {(hookError || teacherClassroomError) && (
        <Alert severity="error" sx={{ mx: 1, mt: 1 }}>{hookError || teacherClassroomError}</Alert>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, px: 1 }}>
        {cachedAt && (
          <Typography variant="caption" color="text.secondary">
            Updated {formatRelativeTime(cachedAt)}
          </Typography>
        )}
        <Button
          size="small"
          variant="text"
          onClick={refresh}
          disabled={refreshing || hookLoading}
          sx={{ textTransform: 'none', minWidth: 'auto' }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </Box>

      {/* Statistics Content */}
      <Card sx={{ 
        borderRadius: 3,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        width: '100%',
        minWidth: 0
      }}>
        {/* Replace tabs with grid navigation */}
        <CardContent sx={{ p: 3, width: '100%', minWidth: 0 }}>
          {/* Compact Tabs Header */}
          <Box sx={{ 
            backgroundColor: 'white',
            borderRadius: 1,
            overflow: 'hidden',
            position: 'sticky',
            top: 0,
            zIndex: 1,
            borderBottom: '1px solid var(--color-border)',
            mb: 2
          }}>
            <Tabs 
              value={activeTab} 
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{
                '& .MuiTab-root': {
                  minHeight: 44,
                  textTransform: 'none',
                  fontWeight: 600
                },
                '& .MuiTabs-scrollButtons': {
                  '&.Mui-disabled': {
                    opacity: 0.3
                  }
                }
              }}
            >
              <Tab icon={<BarChart />} label="Overview" iconPosition="start" />
              <Tab icon={<School />} label="Classrooms" iconPosition="start" />
              {role !== 'teacher' && (
                <Tab icon={<People />} label="Teachers" iconPosition="start" />
              )}
              {role !== 'teacher' && (
                <Tab icon={<People />} label="Students" iconPosition="start" />
              )}
            </Tabs>
          </Box>
          
          {/* Divider removed to reduce visual clutter */}

          {/* Content based on active tab */}
          <Box sx={{ width: '100%', minWidth: 0 }}>
            {/* Overview Tab */}
            {activeTab === 0 && (
            <Box sx={{ width: '100%', minWidth: 0 }}>
              {/* Time Period Picker */}
              <Box sx={{ mb: 3, width: '100%', minWidth: 0 }}>
                
                <ToggleButtonGroup
                  value={timePeriod}
                  exclusive
                  onChange={handleTimePeriodChange}
                  size="small"
                  fullWidth
                  sx={{
                    '& .MuiToggleButton-root': {
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 2,
                      py: 1,
                      borderColor: 'var(--color-border)',
                      flex: 1,
                      '&.Mui-selected': {
                        backgroundColor: 'var(--color-primary)',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'var(--color-primary-dark)'
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

              {/* Activity Trend Chart */}
              <Box sx={{ 
                backgroundColor: 'white',
                borderRadius: 2,
                p: 3,
                border: '1px solid var(--color-border)',
                mb: 3,
                width: '100%',
                minWidth: 0
              }}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      Activity Trend
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main', mt: 0.5 }}>
                      {activityCount} notes created
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {timePeriod === '1D' ? 'Last 24 Hours' : 
                     timePeriod === '1W' ? 'Last 7 Days' :
                     timePeriod === '1M' ? 'Last 4 Weeks' :
                     timePeriod === '3M' ? 'Last 3 Months' :
                     timePeriod === '6M' ? 'Last 6 Months' :
                     timePeriod === '1Y' ? 'Last 12 Months' : 'Weekly'}
                  </Typography>
                </Box>
                
                <ActivityTrendChart />
              </Box>

              {/* Note Distribution Card */}
              
                <Box sx={{ 
                  backgroundColor: 'white',
                  borderRadius: 2,
                  p: 3,
                  border: '1px solid var(--color-border)',
                  mb: 3,
                  width: '100%',
                  minWidth: 0
                }}>
                  {/* Header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      Note Distribution
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {timePeriod === '1D' ? 'Last 24 Hours' : 
                       timePeriod === '1W' ? 'Last 7 Days' :
                       timePeriod === '1M' ? 'Last 4 Weeks' :
                       timePeriod === '3M' ? 'Last 3 Months' :
                       timePeriod === '6M' ? 'Last 6 Months' :
                       timePeriod === '1Y' ? 'Last 12 Months' : 'All Time'}
                    </Typography>
                  </Box>
                  
                  {/* Donut Chart */}
                  {mounted ? (
                    <Box sx={{ height: 250, width: '100%', minWidth: 0, minHeight: 250, position: 'relative' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            label={false}
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
                              border: '1px solid var(--color-border)',
                              borderRadius: 8,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                            }}
                            formatter={(value, name) => [value, name]}
                            labelFormatter={(label) => `${label}`}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center text overlay */}
                      <Box
                        sx={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          textAlign: 'center',
                          pointerEvents: 'none',
                          zIndex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            fontSize: '11px',
                            fontWeight: 400,
                            color: 'var(--color-text-faint)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            mb: 1
                          }}
                        >
                          Total notes
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '32px',
                            fontWeight: 400,
                            color: 'var(--grey-900)',
                            lineHeight: 1,
                            fontFamily: 'var(--font-body)'
                          }}
                        >
                          {pieChartData.reduce((sum, x) => sum + (Number(x?.value) || 0), 0).toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      height: 200,
                      backgroundColor: 'grey.50',
                      borderRadius: 2
                    }}>
                      <Typography variant="body2" color="text.secondary">
                        Coach Pepper is painting the breakdown…
                      </Typography>
                    </Box>
                  )}
                  
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
                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                          {(() => {
                            const total = pieChartData.reduce((sum, x) => sum + (Number(x?.value) || 0), 0);
                            if (!total) return '0%';
                            const pct = (Number(item?.value) || 0) / total;
                            return `${Math.round(pct * 100)}%`;
                          })()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.name}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>

              {/* Voice Note Language Distribution removed */}
            </Box>
            )}
            
            {/* Classrooms Tab */}
            {activeTab === 1 && (
            <Box>
              <Box sx={{ mb: 2, maxWidth: 320, minWidth: 220 }}>
                <ToggleButtonGroup
                  value={classroomTimePeriod}
                  exclusive
                  onChange={handleClassroomTimePeriodChange}
                  size="small"
                  fullWidth
                  sx={{
                    '& .MuiToggleButton-root': {
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 2,
                      py: 0.75,
                      borderColor: 'var(--color-border)',
                      flex: 1,
                      '&.Mui-selected': {
                        backgroundColor: 'var(--color-primary)',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'var(--color-primary-dark)'
                        }
                      }
                    }
                  }}
                >
                  <ToggleButton value="1W">Last 7 days</ToggleButton>
                  <ToggleButton value="1M">Last 30 days</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              {isAdmin && !hideBranchSelector && (
                <Box sx={{ mb: 3 }}>
                  {branches.length > 0 ? (
                    <FormControl 
                      size="small" 
                      sx={{ 
                        minWidth: 220,
                        '& .MuiInputLabel-root': {
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          color: 'text.secondary'
                        },
                        '& .MuiOutlinedInput-root': {
                          fontSize: '0.9375rem',
                          fontWeight: 600,
                          backgroundColor: 'white',
                          '& .MuiSelect-select': {
                            py: 1.25,
                            px: 1.5
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'primary.main'
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'primary.main',
                            borderWidth: 2
                          }
                        }
                      }}
                    >
                      <InputLabel id="branch-select-label">Select Branch</InputLabel>
                      <Select
                        labelId="branch-select-label"
                        value={selectedBranchId || ''}
                        label="Select Branch"
                        onChange={(e) => setSelectedBranchId(e.target.value)}
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              mt: 1,
                              borderRadius: 2,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                              '& .MuiMenuItem-root': {
                                fontSize: '0.9375rem',
                                fontWeight: 500,
                                py: 1.25,
                                px: 1.5,
                                '&:hover': {
                                  backgroundColor: 'primary.50'
                                },
                                '&.Mui-selected': {
                                  backgroundColor: 'primary.100',
                                  fontWeight: 600,
                                  '&:hover': {
                                    backgroundColor: 'primary.100'
                                  }
                                }
                              }
                            }
                          }
                        }}
                      >
                        {branches.map((branch) => (
                          <MenuItem key={branch.id} value={branch.id}>
                            {branch.name || branch.id.toUpperCase()}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                      Coach Pepper is sorting through branches...
                    </Typography>
                  )}
                </Box>
              )}
              
              {classroomStatsForPeriod.length > 0 ? (
                <Box sx={{ width: '100%', minWidth: 0 }}>
                  {/* Classroom Comparison Chart */}
                  <Box sx={{ mb: 3, width: '100%', minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                      {role === 'teacher' ? `My Classrooms · ${classroomPeriodLabel}` : classroomPeriodLabel}
                    </Typography>
                    <ClassroomComparisonChart />
                  </Box>
                </Box>
                  ) : (
                    <Alert severity="info">
                      No classroom data available.
                    </Alert>
                  )}
                    </Box>
                )}

            {/* Teachers Tab */}
            {activeTab === 2 && (
            <Box>
              <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                <Box sx={{ maxWidth: 320, minWidth: 220, flex: '1 1 220px' }}>
                  <ToggleButtonGroup
                    value={teacherTimePeriod}
                    exclusive
                    onChange={handleTeacherTimePeriodChange}
                    size="small"
                    fullWidth
                    sx={{
                      '& .MuiToggleButton-root': {
                        textTransform: 'none',
                        fontWeight: 600,
                        px: 2,
                        py: 0.75,
                        borderColor: 'var(--color-border)',
                        flex: 1,
                        '&.Mui-selected': {
                          backgroundColor: 'var(--color-primary)',
                          color: 'white',
                          '&:hover': {
                            backgroundColor: 'var(--color-primary-dark)'
                          }
                        }
                      }
                    }}
                  >
                    <ToggleButton value="1W">Last 7 days</ToggleButton>
                    <ToggleButton value="1M">Last 30 days</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                <FormControl size="small" sx={{ minWidth: 240, flex: '1 1 240px' }}>
                  <InputLabel id="teacher-classroom-select-label">Select a classroom</InputLabel>
                  <Select
                    labelId="teacher-classroom-select-label"
                    value={selectedTeacherClassroomId}
                    label="Select a classroom"
                    onChange={handleTeacherClassroomChange}
                  >
                    <MenuItem value="" disabled>
                      Select a classroom
                    </MenuItem>
                    {(classrooms || []).map((classroom) => (
                      <MenuItem key={classroom.id} value={classroom.id}>
                        {classroom.name || classroom.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {!selectedTeacherClassroomId ? (
                <Alert severity="info">Select a classroom to view teachers.</Alert>
              ) : (
                <Box>
                  {teachersForSelectedClassroom.length > 0 ? (
                    <Stack spacing={1.5}>
                      {teachersForSelectedClassroom.map((teacher) => (
                        <Box
                          key={teacher.id}
                          sx={{
                            p: 2,
                            backgroundColor: 'white',
                            borderRadius: 2,
                            border: '1px solid var(--color-border)'
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {teacher.name}
                              </Typography>
                              {teacher.status && teacher.status !== 'active' && (
                                <Chip size="small" color="warning" variant="outlined" label="Inactive" />
                              )}
                            </Box>
                            <Chip
                              size="small"
                              label={`Total: ${teacher.periodObservations ?? 0}`}
                              color={(teacher.periodObservations ?? 0) === 0 ? 'error' : 'primary'}
                              variant={(teacher.periodObservations ?? 0) === 0 ? 'filled' : 'outlined'}
                            />
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Chip size="small" variant="outlined" color="success" label={`Observations: ${teacher.periodObservationNotes ?? 0}`} />
                            <Chip size="small" variant="outlined" color="info" label={`Lessons: ${teacher.periodLessonNotes ?? 0}`} />
                          </Box>

                          {teacher.otherClassroomCount > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              Also contributed <Box component="span" sx={{ fontWeight: 600 }}>{teacher.otherClassroomNotes ?? 0}</Box> {teacher.otherClassroomNotes === 1 ? 'note' : 'notes'} to <Box component="span" sx={{ fontWeight: 600 }}>{teacher.otherClassroomCount}</Box> other classroom{teacher.otherClassroomCount === 1 ? '' : 's'}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  ) : (
                    <Alert severity="info">No teachers assigned to this classroom.</Alert>
                  )}
                </Box>
              )}
            </Box>
                )}

            {/* Students Tab */}
            {activeTab === 3 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Student Performance
              </Typography>

              <PerformanceSummaryCard
                summary={performanceSummaryForCard}
                sx={{ mb: 3 }}
              />
              
              {stats.topStudents.length > 0 ? (
                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    Top Students This Week
                  </Typography>
                  <Stack spacing={1.5}>
                    {stats.topStudents.slice(0, 10).map((student) => (
                      <Box
                        key={student.id}
                        sx={{
                          p: 2,
                          backgroundColor: 'white',
                          borderRadius: 2,
                          border: '1px solid var(--color-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 2,
                          flexWrap: 'wrap'
                        }}
                      >
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {student.name}
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                            <Chip size="small" label={`This week: ${student.thisWeekCount || 0}`} />
                            <Chip size="small" label={`Total: ${student.count || 0}`} />
                          </Stack>
                        </Box>
                        {onNavigateToStudent && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => onNavigateToStudent(student)}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                          >
                            View Dashboard
                          </Button>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </Box>
                  ) : (
                    <Alert severity="info">
                      No student data available.
                    </Alert>
                  )}
                    </Box>
                )}
            </Box>
        </CardContent>
      </Card>


    </Box>
  );
};

export default StatsPage; 
