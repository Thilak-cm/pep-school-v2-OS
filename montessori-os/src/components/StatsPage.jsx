import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  MenuItem,
  IconButton
} from '@mui/material';
import { BarChart3 as BarChart, TrendingUp, TrendingDown, Users as People, GraduationCap as School, ArrowLeft as ArrowBack, RefreshCw } from '../icons';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import PerformanceSummaryCard from './PerformanceSummaryCard';
import { isAdminRole } from '../utils/roleUtils';
import { useStatsData } from '../hooks/useStatsData';

// ── Helpers ──────────────────────────────────────────────────────────

/** Merge activity tier maps across classroom docs (sum per-type values per key). */
const mergeActivityMaps = (docs, tier) => {
  const merged = {};
  for (const doc of docs) {
    const map = doc.activity?.[tier] || {};
    for (const [key, bucket] of Object.entries(map)) {
      if (!merged[key]) merged[key] = { voice: 0, text: 0, lesson: 0, media: 0, total: 0 };
      if (typeof bucket === 'number') {
        // Backwards compat: old format was just a count
        merged[key].total += bucket;
      } else {
        merged[key].voice += bucket.voice || 0;
        merged[key].text += bucket.text || 0;
        merged[key].lesson += bucket.lesson || 0;
        merged[key].media += bucket.media || 0;
        merged[key].total += bucket.total || 0;
      }
    }
  }
  return merged;
};

/** Convert an activity tier map to sorted chart data (uses .total for the count). */
const tierToChartData = (map, labelFn) => {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => ({
      period: labelFn ? labelFn(key) : key,
      count: typeof bucket === 'number' ? bucket : (bucket?.total || 0)
    }));
};

/** Sum per-type counts across a merged activity tier map (for pie chart). */
const sumTypesFromTier = (mergedMap, sliceCount) => {
  const entries = Object.entries(mergedMap).sort(([a], [b]) => a.localeCompare(b));
  const recent = entries.slice(-sliceCount);
  const totals = { voice: 0, text: 0, lesson: 0, media: 0 };
  for (const [, bucket] of recent) {
    if (typeof bucket === 'number') continue;
    totals.voice += bucket.voice || 0;
    totals.text += bucket.text || 0;
    totals.lesson += bucket.lesson || 0;
    totals.media += bucket.media || 0;
  }
  return totals;
};

/** Label formatters for activity chart */
const dayLabel = (key) => {
  const d = new Date(key + 'T00:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
};
const weekLabel = (key) => {
  const weekNum = parseInt(key.split('W')[1], 10);
  return `W${weekNum}`;
};
const monthLabel = (key) => {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(key.split('-')[1], 10) - 1;
  return monthNames[monthIdx] || key;
};

/** Map time period to activity tier + label function. */
const PERIOD_CONFIG = {
  '1D': { tier: 'daily', label: dayLabel, slice: 1, displayLabel: 'Last 24 Hours' },
  '1W': { tier: 'daily', label: dayLabel, slice: 7, displayLabel: 'Last 7 Days' },
  '1M': { tier: 'weekly', label: weekLabel, slice: 4, displayLabel: 'Last 4 Weeks' },
  '3M': { tier: 'monthly', label: monthLabel, slice: 3, displayLabel: 'Last 3 Months' },
  '6M': { tier: 'monthly', label: monthLabel, slice: 6, displayLabel: 'Last 6 Months' },
  '1Y': { tier: 'monthly', label: monthLabel, slice: 12, displayLabel: 'Last 12 Months' },
};

/** Compute 42-day performance buckets from student arrays across classroom docs. */
const computePerformanceSummary = (docs) => {
  const allStudents = docs.flatMap(d => d.students || [])
    .filter(s => (s.status || 'active') === 'active');

  // Deduplicate by student ID (students should be unique per classroom, but defensive)
  const seen = new Set();
  const uniqueStudents = allStudents.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  const totals = {
    excellent: 0,
    sufficient: 0,
    needsSupport: 0,
    immediateAttention: 0,
    studentCount: uniqueStudents.length,
    averageNotes: 0,
    totalNotes: 0,
  };
  if (uniqueStudents.length === 0) return totals;

  for (const s of uniqueStudents) {
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

// ── Component ────────────────────────────────────────────────────────

const StatsPage = ({ user, role, manageableClassrooms = [], onBack: _onBack, onNavigateToStudent, __onNavigateToBaseballCard }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [timePeriod, setTimePeriod] = useState('1W');
  const [classroomTimePeriod, setClassroomTimePeriod] = useState('1W');
  const [teacherTimePeriod, setTeacherTimePeriod] = useState('1W');
  const [selectedTeacherClassroomId, setSelectedTeacherClassroomId] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [branches, setBranches] = useState([]);
  const [mounted, setMounted] = useState(false);

  // Teacher classroom discovery — needed for the hook
  const [teacherClassrooms, setTeacherClassrooms] = useState([]);
  const isAdmin = isAdminRole(role);

  // Discover teacher's classrooms
  useEffect(() => {
    if (role !== 'teacher' || !user?.uid) return;
    const fetchTeacherClassrooms = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'classrooms'), where('teacherIds', 'array-contains', user.uid))
        );
        setTeacherClassrooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (_e) {
        setTeacherClassrooms([]);
      }
    };
    fetchTeacherClassrooms();
  }, [role, user?.uid]);

  // Fetch branches for admin branch filter
  useEffect(() => {
    if (!isAdmin) return;
    const fetchBranches = async () => {
      try {
        const snap = await getDocs(collection(db, 'branches'));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setBranches(data);
        if (data.length > 0 && selectedBranchId === null) {
          setSelectedBranchId(data[0].id);
        }
      } catch (_e) {
        setBranches([]);
      }
    };
    fetchBranches();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Stats data from cache docs
  const { classroomDocs, loading, error, stale, refreshing, refresh } = useStatsData({
    user,
    role,
    manageableClassrooms,
    userClassrooms: teacherClassrooms,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Derived data ─────────────────────────────────────────────────

  // Overview: activity chart data
  const activityChartData = useMemo(() => {
    const config = PERIOD_CONFIG[timePeriod] || PERIOD_CONFIG['1W'];
    const merged = mergeActivityMaps(classroomDocs, config.tier);
    const allData = tierToChartData(merged, config.label);
    // Take only the last N entries for the selected period
    return allData.slice(-config.slice);
  }, [classroomDocs, timePeriod]);

  const activityCount = useMemo(() => {
    return activityChartData.reduce((sum, d) => sum + d.count, 0);
  }, [activityChartData]);

  // Overview: pie chart data (filtered by time period using per-type activity tiers)
  const pieChartData = useMemo(() => {
    const config = PERIOD_CONFIG[timePeriod] || PERIOD_CONFIG['1W'];
    const merged = mergeActivityMaps(classroomDocs, config.tier);
    const nc = sumTypesFromTier(merged, config.slice);
    return [
      { name: 'Voice', value: nc.voice, color: '#3b82f6' }, /* Recharts */
      { name: 'Text', value: nc.text, color: '#f59e0b' }, /* Recharts */
      { name: 'Lesson', value: nc.lesson, color: '#059669' }, /* Recharts */
      { name: 'Media', value: nc.media, color: '#ec4899' }, /* Recharts */
    ];
  }, [classroomDocs, timePeriod]);

  // Classrooms: stats for period (1W or 1M)
  const classroomStatsForPeriod = useMemo(() => {
    const config = classroomTimePeriod === '1M'
      ? { tier: 'weekly', slice: 4 }
      : { tier: 'daily', slice: 7 };

    return classroomDocs.map(doc => {
      const tierMap = doc.activity?.[config.tier] || {};
      const entries = Object.entries(tierMap).sort(([a], [b]) => a.localeCompare(b));
      const recent = entries.slice(-config.slice);
      const periodTotal = recent.reduce((sum, [, count]) => sum + count, 0);

      // Break down by type using noteCounts ratios (approximation for period)
      const nc = doc.noteCounts || {};
      const totalAll = nc.total || 1;
      const obsRatio = ((nc.voice || 0) + (nc.text || 0)) / totalAll;
      const lessonRatio = (nc.lesson || 0) / totalAll;
      const mediaRatio = (nc.media || 0) / totalAll;

      return {
        id: doc.classroomId,
        name: doc.classroomName,
        branchId: doc.branchId,
        studentCount: doc.studentCount || 0,
        thisWeekObservationNotes: Math.round(periodTotal * obsRatio),
        thisWeekLessonNotes: Math.round(periodTotal * lessonRatio),
        thisWeekMediaNotes: Math.round(periodTotal * mediaRatio),
      };
    });
  }, [classroomDocs, classroomTimePeriod]);

  // Classrooms: filter by branch
  const filteredClassroomStats = useMemo(() => {
    if (isAdmin && selectedBranchId) {
      const branch = branches.find(b => b.id === selectedBranchId);
      if (branch?.classrooms?.length > 0) {
        const branchClassroomIds = branch.classrooms.map(cid => {
          const parts = String(cid).split('/');
          return parts[parts.length - 1];
        });
        return classroomStatsForPeriod.filter(c => branchClassroomIds.includes(c.id));
      }
      return classroomStatsForPeriod.filter(c => c.branchId === selectedBranchId);
    }
    return classroomStatsForPeriod;
  }, [classroomStatsForPeriod, selectedBranchId, isAdmin, branches]);

  // Classrooms list for dropdowns
  const classroomList = useMemo(() => {
    return classroomDocs.map(d => ({
      id: d.classroomId,
      name: d.classroomName,
    }));
  }, [classroomDocs]);

  // Teachers: for selected classroom
  const teachersForSelectedClassroom = useMemo(() => {
    if (!selectedTeacherClassroomId) return [];
    const doc = classroomDocs.find(d => d.classroomId === selectedTeacherClassroomId);
    if (!doc) return [];

    const config = teacherTimePeriod === '1M'
      ? { tier: 'weekly', slice: 4 }
      : { tier: 'daily', slice: 7 };

    // Get period total for this classroom to compute per-teacher period estimates
    const tierMap = doc.activity?.[config.tier] || {};
    const entries = Object.entries(tierMap).sort(([a], [b]) => a.localeCompare(b));
    const recentEntries = entries.slice(-config.slice);
    const periodTotal = recentEntries.reduce((sum, [, count]) => sum + count, 0);
    const allTimeTotal = (doc.noteCounts?.total) || 1;

    return (doc.teachers || []).map(t => {
      const teacherAllTime = t.observations + t.lessons;
      const teacherRatio = teacherAllTime / Math.max(allTimeTotal, 1);
      const periodEstimate = Math.round(periodTotal * teacherRatio);
      const lessonRatio = teacherAllTime > 0 ? t.lessons / teacherAllTime : 0;

      return {
        ...t,
        periodObservations: periodEstimate,
        periodObservationNotes: Math.round(periodEstimate * (1 - lessonRatio)),
        periodLessonNotes: Math.round(periodEstimate * lessonRatio),
      };
    });
  }, [classroomDocs, selectedTeacherClassroomId, teacherTimePeriod]);

  // Students: performance summary
  const performanceSummary = useMemo(() => computePerformanceSummary(classroomDocs), [classroomDocs]);

  // Students: top students this week
  const topStudents = useMemo(() => {
    const all = classroomDocs.flatMap(d => d.students || [])
      .filter(s => (s.status || 'active') === 'active');
    // Deduplicate
    const seen = new Set();
    const unique = all.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    return unique.sort((a, b) => (b.thisWeekNotes || 0) - (a.thisWeekNotes || 0)).slice(0, 10);
  }, [classroomDocs]);

  // Classroom period label
  const classroomPeriodLabel = classroomTimePeriod === '1M' ? 'Last 30 days' : 'Last 7 days';

  // Branch selector visibility
  const hideBranchSelector = role === 'classroomadmin' && classroomDocs.length > 0 &&
    new Set(classroomDocs.map(d => d.branchId).filter(Boolean)).size <= 1;

  // ── Handlers ─────────────────────────────────────────────────────

  const handleTabChange = useCallback((_, newValue) => {
    setActiveTab(newValue);
  }, []);

  // ── Render ───────────────────────────────────────────────────────

  if (loading && classroomDocs.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 2 }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">Loading statistics...</Typography>
      </Box>
    );
  }

  if (error && classroomDocs.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" action={
          isAdmin ? <Button size="small" onClick={refresh}>Refresh</Button> : null
        }>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0, pb: 4, width: '100%', minWidth: 0 }}>
      {/* Header with refresh — outside the card */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 1, px: 1, gap: 1 }}>
        {stale && <Chip size="small" label="Stale" color="warning" variant="outlined" />}
        {isAdmin && (
          <IconButton size="small" onClick={refresh} disabled={refreshing} title="Refresh stats">
            <RefreshCw style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
          </IconButton>
        )}
      </Box>

      <Card sx={{ borderRadius: 3, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden', width: '100%', minWidth: 0 }}>
        <CardContent sx={{ p: 3, width: '100%', minWidth: 0 }}>
          {/* Tabs */}
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
                '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 600 },
                '& .MuiTabs-scrollButtons': { '&.Mui-disabled': { opacity: 0.3 } }
              }}
            >
              <Tab icon={<BarChart />} label="Overview" iconPosition="start" />
              <Tab icon={<School />} label="Classrooms" iconPosition="start" />
              <Tab icon={<People />} label="Teachers" iconPosition="start" />
              <Tab icon={<People />} label="Students" iconPosition="start" />
            </Tabs>
          </Box>

          <Box sx={{ width: '100%', minWidth: 0 }}>
        {/* ── Overview Tab ──────────────────────────────────────── */}
        {activeTab === 0 && (
          <Box sx={{ width: '100%', minWidth: 0 }}>
            {/* Time Period Picker */}
            <Box sx={{ mb: 3 }}>
              <ToggleButtonGroup
                value={timePeriod}
                exclusive
                onChange={(_, v) => v && setTimePeriod(v)}
                size="small"
                fullWidth
                sx={{
                  '& .MuiToggleButton-root': {
                    textTransform: 'none', fontWeight: 600, px: 2, py: 1,
                    borderColor: 'var(--color-border)', flex: 1,
                    '&.Mui-selected': { backgroundColor: 'var(--color-primary)', color: 'white',
                      '&:hover': { backgroundColor: 'var(--color-primary-dark)' }
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
            <Box sx={{ backgroundColor: 'white', borderRadius: 2, p: 3, border: '1px solid var(--color-border)', mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>Activity Trend</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main', mt: 0.5 }}>
                    {activityCount} notes created
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {PERIOD_CONFIG[timePeriod]?.displayLabel || 'Last 7 Days'}
                </Typography>
              </Box>
              {mounted && activityChartData.length > 0 ? (
                <Box sx={{ height: 200, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activityChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /* Recharts */ />
                      <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#64748b' /* Recharts */ }} axisLine={{ stroke: '#e2e8f0' /* Recharts */ }} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748b' /* Recharts */ }} axisLine={{ stroke: '#e2e8f0' /* Recharts */ }} tickLine={false} width={35} />
                      <RechartsTooltip contentStyle={{ backgroundColor: 'white', border: '1px solid var(--color-border)', borderRadius: 8 }} />
                      <Line type="monotone" dataKey="count" stroke="#4f46e5" /* Recharts */ strokeWidth={2} dot={{ r: 4, fill: '#4f46e5' }} name="Notes" />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, backgroundColor: 'grey.50', borderRadius: 2 }}>
                  <Typography variant="body2" color="text.secondary">Loading chart...</Typography>
                </Box>
              )}
            </Box>

            {/* Note Distribution Donut */}
            <Box sx={{ backgroundColor: 'white', borderRadius: 2, p: 3, border: '1px solid var(--color-border)', mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Note Distribution</Typography>
                <Typography variant="body2" color="text.secondary">
                  {PERIOD_CONFIG[timePeriod]?.displayLabel || 'Last 7 Days'}
                </Typography>
              </Box>
              {mounted ? (
                <Box sx={{ height: 250, width: '100%', position: 'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" label={false} labelLine={false} isAnimationActive={false}>
                        {pieChartData.map((entry) => (
                          <Cell key={`cell-${entry.name}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ backgroundColor: 'white', border: '1px solid var(--color-border)', borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', zIndex: 1 }}>
                    <Typography variant="caption" sx={{ display: 'block', fontSize: '11px', fontWeight: 400, color: 'var(--color-text-faint)', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
                      Total notes
                    </Typography>
                    <Typography sx={{ fontSize: '32px', fontWeight: 400, color: 'var(--grey-900)', lineHeight: 1, fontFamily: 'var(--font-body)' }}>
                      {pieChartData.reduce((sum, x) => sum + (Number(x?.value) || 0), 0).toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, backgroundColor: 'grey.50', borderRadius: 2 }}>
                  <Typography variant="body2" color="text.secondary">Coach Pepper is painting the breakdown…</Typography>
                </Box>
              )}
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 4 }}>
                {pieChartData.map((item, index) => {
                  const total = pieChartData.reduce((sum, x) => sum + (Number(x?.value) || 0), 0);
                  const pct = total ? Math.round(((Number(item?.value) || 0) / total) * 100) : 0;
                  return (
                    <Box key={index} sx={{ textAlign: 'center' }}>
                      <Box sx={{ width: 16, height: 16, bgcolor: item.color, borderRadius: '50%', mx: 'auto', mb: 1, border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
                      <Typography variant="body2" sx={{ fontWeight: 600, color: item.color, mb: 0.5 }}>{item.value}</Typography>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>{pct}%</Typography>
                      <Typography variant="caption" color="text.secondary">{item.name}</Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        )}

        {/* ── Classrooms Tab ────────────────────────────────────── */}
        {activeTab === 1 && (
          <Box>
            <Box sx={{ mb: 2, maxWidth: 320, minWidth: 220 }}>
              <ToggleButtonGroup
                value={classroomTimePeriod} exclusive
                onChange={(_, v) => v && setClassroomTimePeriod(v)}
                size="small" fullWidth
                sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600, px: 2, py: 0.75, borderColor: 'var(--color-border)', flex: 1, '&.Mui-selected': { backgroundColor: 'var(--color-primary)', color: 'white', '&:hover': { backgroundColor: 'var(--color-primary-dark)' } } } }}
              >
                <ToggleButton value="1W">Last 7 days</ToggleButton>
                <ToggleButton value="1M">Last 30 days</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {isAdmin && !hideBranchSelector && branches.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel id="branch-select-label">Select Branch</InputLabel>
                  <Select labelId="branch-select-label" value={selectedBranchId || ''} label="Select Branch" onChange={(e) => setSelectedBranchId(e.target.value)}>
                    {branches.map((branch) => (
                      <MenuItem key={branch.id} value={branch.id}>{branch.name || branch.id.toUpperCase()}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}

            {filteredClassroomStats.length > 0 ? (
              <Box sx={{ width: '100%', minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                  {role === 'teacher' ? `My Classrooms · ${classroomPeriodLabel}` : classroomPeriodLabel}
                </Typography>
                {mounted ? (
                  <Box sx={{ height: 300, width: '100%', minHeight: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart
                        data={filteredClassroomStats.map(c => ({
                          name: c.name,
                          Observations: c.thisWeekObservationNotes,
                          'Lesson Notes': c.thisWeekLessonNotes,
                          'Media Notes': c.thisWeekMediaNotes,
                        }))}
                        margin={{ top: 16, right: 20, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /* Recharts */ />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' /* Recharts */ }} axisLine={{ stroke: '#e2e8f0' /* Recharts */ }} angle={-45} textAnchor="end" height={70} tickMargin={6} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' /* Recharts */ }} axisLine={{ stroke: '#e2e8f0' /* Recharts */ }} tickLine={false} width={40} tickFormatter={(v) => Math.round(v)} />
                        <RechartsTooltip contentStyle={{ backgroundColor: 'white', border: '1px solid var(--color-border)', borderRadius: 8 }} />
                        <Bar dataKey="Observations" stackId="notes" fill="#4f46e5" /* Recharts */ radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Lesson Notes" stackId="notes" fill="#059669" /* Recharts */ radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Media Notes" stackId="notes" fill="#ec4899" /* Recharts */ radius={[0, 0, 0, 0]} />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, backgroundColor: 'grey.50', borderRadius: 2 }}>
                    <Typography variant="body2" color="text.secondary">Loading chart...</Typography>
                  </Box>
                )}
                {/* Legend */}
                <Box sx={{ mt: 0, display: 'flex', justifyContent: 'center' }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', px: 1.5, py: 0.5, borderRadius: 999, border: '1px solid var(--color-border)', backgroundColor: 'white' }}>
                    {[
                      { label: 'Observations', color: 'var(--color-primary)' },
                      { label: 'Lesson Notes', color: 'var(--color-secondary)' },
                      { label: 'Media Notes', color: 'var(--color-pink)' },
                    ].map(item => (
                      <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: item.color }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{item.label}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            ) : (
              <Alert severity="info">No classroom data available.</Alert>
            )}
          </Box>
        )}

        {/* ── Teachers Tab ──────────────────────────────────────── */}
        {activeTab === 2 && (
          <Box>
            <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
              <Box sx={{ maxWidth: 320, minWidth: 220, flex: '1 1 220px' }}>
                <ToggleButtonGroup
                  value={teacherTimePeriod} exclusive
                  onChange={(_, v) => v && setTeacherTimePeriod(v)}
                  size="small" fullWidth
                  sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600, px: 2, py: 0.75, borderColor: 'var(--color-border)', flex: 1, '&.Mui-selected': { backgroundColor: 'var(--color-primary)', color: 'white', '&:hover': { backgroundColor: 'var(--color-primary-dark)' } } } }}
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
                  onChange={(e) => setSelectedTeacherClassroomId(e.target.value)}
                >
                  <MenuItem value="" disabled>Select a classroom</MenuItem>
                  {classroomList.map((classroom) => (
                    <MenuItem key={classroom.id} value={classroom.id}>{classroom.name || classroom.id}</MenuItem>
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
                      <Box key={teacher.id} sx={{ p: 2, backgroundColor: 'white', borderRadius: 2, border: '1px solid var(--color-border)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{teacher.name}</Typography>
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

        {/* ── Students Tab ──────────────────────────────────────── */}
        {activeTab === 3 && (
          <Box>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Student Performance</Typography>
            <PerformanceSummaryCard summary={performanceSummary} sx={{ mb: 3 }} />

            {topStudents.length > 0 ? (
              <Box>
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>Top Students This Week</Typography>
                <Stack spacing={1.5}>
                  {topStudents.map((student) => (
                    <Box key={student.id} sx={{ p: 2, backgroundColor: 'white', borderRadius: 2, border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{student.name}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                          <Chip size="small" label={`This week: ${student.thisWeekNotes || 0}`} />
                          <Chip size="small" label={`Total: ${student.totalNotes || 0}`} />
                        </Stack>
                      </Box>
                      {onNavigateToStudent && (
                        <Button size="small" variant="outlined" onClick={() => onNavigateToStudent(student)} sx={{ textTransform: 'none', fontWeight: 600 }}>
                          View Dashboard
                        </Button>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            ) : (
              <Alert severity="info">No student data available.</Alert>
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
