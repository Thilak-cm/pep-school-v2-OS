import React, { useState, useMemo, useEffect } from 'react';
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
} from '@mui/material';
import { FileText as ReportIcon } from '../icons';
import { getDefaultReportDateRange, getDefaultMonthlyDateRange, toIsoDate } from '../utils/reportUtils';

const REPORT_TYPE_LABELS = {
  term: 'term report',
  baseline: 'baseline report',
};

export default function ReportGenerateDialog({
  open,
  onClose,
  onGenerate,
  generating = false,
  studentLabel = 'this student',
  initialReportType = 'term',
}) {
  const reportType = initialReportType;

  const defaults = useMemo(() => {
    const { start, end } = reportType === 'baseline' ? getDefaultMonthlyDateRange() : getDefaultReportDateRange();
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }, [reportType]);

  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);

  // Reset dates each time the dialog opens
  useEffect(() => {
    if (open) {
      setStartDate(defaults.start);
      setEndDate(defaults.end);
    }
  }, [open, defaults.start, defaults.end]);

  const dateValid = Boolean(startDate && endDate);
  const rangeError = dateValid && endDate < startDate;

  const typeLabel = REPORT_TYPE_LABELS[reportType] || 'report';
  const title = `Generate ${typeLabel} for ${studentLabel}?`;

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
          <Typography variant="caption" sx={{ color: 'var(--grey-500)', mt: -0.5 }}>
            {reportType === 'baseline' ? 'Default start date: 40 days before today' : 'Default start date: Oct 15'}
          </Typography>

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
