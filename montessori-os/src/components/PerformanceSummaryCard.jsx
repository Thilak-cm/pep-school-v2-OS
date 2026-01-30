import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

const BUCKETS = [
  {
    key: 'excellent',
    label: 'Excellent (12+)',
    colorKey: 'success'
  },
  {
    key: 'sufficient',
    label: 'Sufficient (8-11)',
    colorKey: 'info'
  },
  {
    key: 'needsSupport',
    label: 'Needs Support (4-7)',
    colorKey: 'warning'
  },
  {
    key: 'immediateAttention',
    label: 'Immediate Attention (0-3)',
    colorKey: 'error'
  }
];

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat().format(value);
};

function PerformanceSummaryCard({
  summary,
  loading = false,
  error = '',
  sx,
  classroomOptions = [],
  selectedClassroomId = '',
  onClassroomChange
}) {
  const theme = useTheme();
  const totalStudents = Number.isFinite(summary?.studentCount) ? summary.studentCount : 0;
  const hasClassroomOptions = Array.isArray(classroomOptions) && classroomOptions.length > 0;

  const chartData = BUCKETS.map((bucket) => ({
    name: bucket.label,
    value: Number.isFinite(summary?.[bucket.key]) ? summary[bucket.key] : 0,
    color: theme.palette[bucket.colorKey]?.main
  }));

  return (
    <Card
      sx={{
        borderRadius: 2,
        backgroundColor: 'white',
        border: '1px solid #e2e8f0',
        boxShadow: 'none',
        ...sx
      }}
    >
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem' }}>
            Performance Summary
          </Typography>

          {hasClassroomOptions && (
            <FormControl fullWidth size="small">
              <InputLabel id="performance-summary-classroom-label">Select a classroom</InputLabel>
              <Select
                labelId="performance-summary-classroom-label"
                value={selectedClassroomId}
                label="Select a classroom"
                onChange={(event) => onClassroomChange?.(event.target.value)}
              >
                <MenuItem value="">All classrooms</MenuItem>
                {classroomOptions.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label || option.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {error ? (
            <Alert severity="warning">{error}</Alert>
          ) : loading ? (
            <Box
              sx={{
                height: 250,
                width: '100%',
                minWidth: 0,
                minHeight: 250,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Coach Pepper is creating the performance summary...
                  </Typography>
              </Stack>
            </Box>
          ) : totalStudents === 0 ? (
            <Alert severity="info">No active students available in this scope.</Alert>
          ) : (
            <>
              {/* Donut Chart */}
              <Box sx={{ height: 250, width: '100%', minWidth: 0, minHeight: 250, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
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
                      {chartData.map((entry) => (
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
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      mb: 1
                    }}
                  >
                    Total students
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: '32px',
                      fontWeight: 400,
                      color: '#0f172a',
                      lineHeight: 1,
                      fontFamily: 'Inter, system-ui, sans-serif'
                    }}
                  >
                    {formatNumber(totalStudents)}
                  </Typography>
                </Box>
              </Box>

              {/* Simple Legend */}
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 4 }}>
                {chartData.map((item, index) => (
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
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default PerformanceSummaryCard;
