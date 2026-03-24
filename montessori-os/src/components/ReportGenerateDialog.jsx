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
  CircularProgress
} from '@mui/material';
import { Description as ReportIcon } from '@mui/icons-material';
import { getDefaultReportDateRange } from '../utils/reportUtils';

// yyyy-mm-dd (native input[type=date] format)
function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
