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
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress
} from '@mui/material';
import { FileText as ReportIcon } from '../icons';
import { getDefaultReportDateRange, toIsoDate } from '../utils/reportUtils';

export default function ReportGenerateDialog({
  open,
  onClose,
  onGenerate,
  generating = false,
  studentLabel = 'this student',
}) {
  const defaults = useMemo(() => {
    const { start, end } = getDefaultReportDateRange();
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }, []);

  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  // Report format: 'term' (existing default) or 'baseline' (PEP-325). Defaulting to
  // 'term' keeps the existing flow byte-for-byte unchanged when the toggle is untouched.
  const [reportType, setReportType] = useState('term');

  const dateValid = Boolean(startDate && endDate);
  const rangeError = dateValid && endDate < startDate;

  const title = `Generate report for ${studentLabel}?`;

  const handleGenerate = () => {
    if (!dateValid || rangeError) return;
    onGenerate?.({ dateRangeStart: startDate, dateRangeEnd: endDate, reportType });
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
          background: 'linear-gradient(180deg, var(--color-indigo-bg) 0%, var(--color-paper) 55%)',
          border: '1px solid var(--color-border)',
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
              <ReportIcon size={22} style={{ color: 'var(--color-primary)' }} />
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'var(--grey-900)' }}>
              {title}
            </Typography>
          </Stack>

          <Typography variant="body2" sx={{ color: 'var(--grey-600)' }}>
            Coach Pepper will generate a parent report using observations within the date range below.
          </Typography>

          <Box>
            <Typography
              variant="caption"
              sx={{ display: 'block', mb: 0.75, fontWeight: 700, color: 'var(--grey-600)' }}
            >
              Report type
            </Typography>
            <ToggleButtonGroup
              value={reportType}
              exclusive
              fullWidth
              size="small"
              disabled={generating}
              onChange={(_e, next) => { if (next) setReportType(next); }}
              aria-label="Report type"
            >
              <ToggleButton value="term" sx={{ textTransform: 'none' }}>
                Term
              </ToggleButton>
              <ToggleButton value="baseline" sx={{ textTransform: 'none' }}>
                Baseline
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

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

          {generating && (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 0.5 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ color: 'var(--color-primary)', fontWeight: 600 }}>
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
          sx={{ textTransform: 'none', color: 'var(--grey-600)' }}
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
