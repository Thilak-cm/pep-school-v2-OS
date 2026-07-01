import React, { useState, useEffect } from 'react';
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
import { ListChecks as ReadinessIcon } from '../icons';
import { getDefaultReportDateRange, toIsoDate } from '../utils/reportUtils';

function getBaselineReadinessDateRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
  return { start, end: now };
}

export default function ReadinessCheckDialog({
  open,
  onClose,
  onConfirm,
  loading = false,
  studentLabel = 'this student',
  newNotesSinceReport = null,
  initialStartDate = null,
  initialEndDate = null,
  reportType = 'term',
}) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Reset dates each time the dialog opens — use cached dates if available, else defaults
  useEffect(() => {
    if (open) {
      const { start, end } = reportType === 'baseline'
        ? getBaselineReadinessDateRange()
        : (initialStartDate && initialEndDate)
          ? { start: initialStartDate instanceof Date ? initialStartDate : new Date(initialStartDate), end: initialEndDate instanceof Date ? initialEndDate : new Date(initialEndDate) }
          : getDefaultReportDateRange();
      setStartDate(toIsoDate(start));
      setEndDate(toIsoDate(end));
    }
  }, [open, initialStartDate, initialEndDate, reportType]);

  const dateValid = Boolean(startDate && endDate);
  const rangeError = dateValid && endDate < startDate;

  const handleConfirm = () => {
    if (!dateValid || rangeError) return;
    onConfirm?.({ dateRangeStart: startDate, dateRangeEnd: endDate });
  };

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
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
              <ReadinessIcon size={22} style={{ color: 'var(--color-primary)' }} />
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'var(--grey-900)' }}>
              Check readiness for {studentLabel}
            </Typography>
          </Stack>

          <Typography variant="body2" sx={{ color: 'var(--grey-600)' }}>
            Select the reporting period to check whether enough observations exist for a quality report.
          </Typography>

          {newNotesSinceReport != null && newNotesSinceReport > 0 && (
            <Typography variant="body2" sx={{ color: 'var(--color-primary)', fontWeight: 600 }}>
              {newNotesSinceReport} new {newNotesSinceReport === 1 ? 'note' : 'notes'} since the last report.
            </Typography>
          )}

          <Stack direction="row" spacing={2}>
            <TextField
              label="From"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              size="small"
              fullWidth
              disabled={loading}
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
              disabled={loading}
              error={rangeError}
              helperText={rangeError ? "'To' must be after 'From'" : ''}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { min: startDate || undefined },
              }}
            />
          </Stack>

          {loading && (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 0.5 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                Checking readiness...
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button
          onClick={onClose}
          disabled={loading}
          sx={{ textTransform: 'none', color: 'var(--grey-600)' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={loading || !dateValid || rangeError}
          sx={{
            textTransform: 'none',
            borderRadius: 999,
            px: 3,
            boxShadow: '0 10px 20px rgba(79, 70, 229, 0.25)',
          }}
        >
          {loading ? 'Checking...' : 'Run check'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
