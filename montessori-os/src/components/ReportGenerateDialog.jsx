import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Stack,
  Box,
  TextField,
  CircularProgress,
  Chip,
  Alert,
  Collapse,
} from '@mui/material';
import {
  Description as ReportIcon,
  FactCheck as ReadinessIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { getDefaultReportDateRange } from '../utils/reportUtils';

// yyyy-mm-dd (native input[type=date] format)
function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getScoreColor(score) {
  if (score == null) return 'default';
  if (score >= 4) return 'success';
  if (score === 3) return 'warning';
  return 'error';
}

export default function ReportGenerateDialog({
  open,
  onClose,
  onGenerate,
  generating = false,
  studentLabel = 'this student',
  readiness = null,
  readinessLoading = false,
  onCheckReadiness,
  newNotesSinceReport = null,
}) {
  const defaults = useMemo(() => {
    const { start, end } = getDefaultReportDateRange();
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }, []);

  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);

  const dateValid = Boolean(startDate && endDate);
  const rangeError = dateValid && endDate < startDate;

  const title = `Generate report for ${studentLabel}?`;

  const handleGenerate = () => {
    if (!dateValid || rangeError) return;
    onGenerate?.({ dateRangeStart: startDate, dateRangeEnd: endDate });
  };

  return (
    <Dialog
      open={open}
      onClose={generating ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: 'linear-gradient(180deg, #eef2ff 0%, #ffffff 55%)',
          border: '1px solid #e2e8f0',
          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.18)',
        },
      }}
    >
      <DialogContent sx={{ pt: 3 }}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.08) 70%)',
                border: '1px solid rgba(99,102,241,0.35)',
              }}
            >
              <ReportIcon sx={{ fontSize: 22, color: '#4f46e5' }} />
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f172a' }}>
              {title}
            </Typography>
          </Stack>

          <Typography variant="body2" sx={{ color: '#475569' }}>
            Coach Pepper will generate a parent report using observations within the date range below.
          </Typography>

          <Stack direction="row" spacing={2}>
            <TextField
              label="From"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              size="small"
              fullWidth
              disabled={generating}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { max: endDate || undefined },
              }}
            />
            <TextField
              label="To"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              size="small"
              fullWidth
              disabled={generating}
              error={rangeError}
              helperText={rangeError ? "'To' must be after 'From'" : ''}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: startDate || undefined },
              }}
            />
          </Stack>

          {/* Readiness section */}
          {!generating && (
            <Box sx={{ borderRadius: 2, border: '1px solid #e2e8f0', p: 1.5, bgcolor: '#f8fafc' }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <ReadinessIcon sx={{ fontSize: 18, color: '#64748b' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                  Observation Check
                </Typography>
              </Stack>

              {newNotesSinceReport != null && newNotesSinceReport > 0 && (
                <Typography variant="caption" sx={{ color: '#059669', display: 'block', mb: 1 }}>
                  {newNotesSinceReport} new {newNotesSinceReport === 1 ? 'note' : 'notes'} since the last report
                </Typography>
              )}
              {newNotesSinceReport === 0 && (
                <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mb: 1 }}>
                  No new observations since the last report
                </Typography>
              )}

              {readiness && readiness.status !== 'no_notes' ? (
                <Stack spacing={1}>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {readiness.sentimentScore != null && (
                      <Chip label={`Sentiment: ${readiness.sentimentScore}`} size="small" color={getScoreColor(readiness.sentimentScore)} variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                    )}
                    {readiness.areaBalanceScore != null && (
                      <Chip label={`Balance: ${readiness.areaBalanceScore}`} size="small" color={getScoreColor(readiness.areaBalanceScore)} variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                    )}
                    {readiness.missingInputFlags?.length > 0 ? (
                      <Chip label="Missing data" size="small" color="warning" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                    ) : (
                      <Chip label="Complete" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                    )}
                    <Chip label={`${readiness.noteCount} notes`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                  </Stack>
                  {readiness.missingInputFlags?.length > 0 && (
                    <Box sx={{ pl: 0.5 }}>
                      {readiness.missingInputFlags.map((flag, i) => (
                        <Typography key={i} variant="caption" sx={{ display: 'block', color: '#b45309', lineHeight: 1.6 }}>
                          {flag}
                        </Typography>
                      ))}
                    </Box>
                  )}
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => onCheckReadiness?.({ dateRangeStart: startDate, dateRangeEnd: endDate })}
                    disabled={readinessLoading}
                    sx={{ textTransform: 'none', fontSize: '0.75rem', alignSelf: 'flex-start', color: '#64748b' }}
                  >
                    {readinessLoading ? 'Checking...' : 'Re-run check'}
                  </Button>
                </Stack>
              ) : readiness && readiness.status === 'no_notes' ? (
                <Alert severity="warning" sx={{ borderRadius: 1.5, fontSize: '0.8rem' }}>
                  No observations found in this date range.
                </Alert>
              ) : (
                <Stack spacing={1} alignItems="flex-start">
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Run an observation check to see if there is enough data for a balanced report.
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={readinessLoading ? <CircularProgress size={14} /> : <ReadinessIcon sx={{ fontSize: 16 }} />}
                    onClick={() => onCheckReadiness?.({ dateRangeStart: startDate, dateRangeEnd: endDate })}
                    disabled={readinessLoading}
                    sx={{ textTransform: 'none', fontSize: '0.8rem', borderRadius: 2 }}
                  >
                    {readinessLoading ? 'Checking...' : 'Run observation check'}
                  </Button>
                </Stack>
              )}
            </Box>
          )}

          {generating && (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 0.5 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ color: '#4f46e5', fontWeight: 600 }}>
                Coach Pepper is reviewing and preparing your report-- hang tight!
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button
          onClick={onClose}
          disabled={generating}
          sx={{ textTransform: 'none', color: '#475569' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={generating || !dateValid || rangeError}
          sx={{
            textTransform: 'none',
            borderRadius: 999,
            px: 3,
            boxShadow: '0 10px 20px rgba(79, 70, 229, 0.25)',
          }}
        >
          {generating ? 'Generating...' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
