import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Radio,
  RadioGroup,
  TextField,
  Typography
} from '@mui/material';
import { CalendarToday, Close, Download } from '@mui/icons-material';
import { NOTE_KIND, filterObservationsForExport } from '../utils/export';

const noteOptions = [
  { value: NOTE_KIND.OBSERVATION, label: 'Observations (text + voice)' },
  { value: NOTE_KIND.LESSON, label: 'Lesson Notes' },
  { value: NOTE_KIND.BOTH, label: 'Both' }
];

const formatOptions = [
  { value: 'txt', label: 'Text (.txt)' },
  { value: 'json', label: 'JSON (.json)' }
];

const scrollToSection = (ref) => {
  if (ref?.current) {
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const buildNoteKindsArray = (selection) => {
  if (selection === NOTE_KIND.BOTH) return [NOTE_KIND.BOTH];
  if (selection === NOTE_KIND.LESSON) return [NOTE_KIND.LESSON];
  return [NOTE_KIND.OBSERVATION];
};

const renderDateAdornment = (value, onClear, onOpenCalendar) => {
  const iconSize = 'small';
  const icon = value ? <Close fontSize={iconSize} /> : <CalendarToday fontSize={iconSize} />;

  return (
    <InputAdornment position="end" sx={{ pr: 0.25 }}>
      <IconButton
        aria-label={value ? 'Clear date' : 'Open calendar'}
        size="small"
        edge="end"
        onClick={value ? onClear : onOpenCalendar}
        tabIndex={-1}
      >
        {icon}
      </IconButton>
    </InputAdornment>
  );
};

function ExportWizard({
  open,
  onClose,
  onConfirm,
  observations = [],
  defaultNoteKind = NOTE_KIND.BOTH,
  isSuperAdmin = false,
  defaultFormat = 'txt',
  loading = false,
  title = 'Export Notes',
  subjectLabel = ''
}) {
  const noteTypeRef = useRef(null);
  const formatRef = useRef(null);
  const dateRef = useRef(null);
  const summaryRef = useRef(null);
  const fromInputRef = useRef(null);
  const toInputRef = useRef(null);

  const [noteSelection, setNoteSelection] = useState(defaultNoteKind);
  const [formatSelection, setFormatSelection] = useState(defaultFormat);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pickerField, setPickerField] = useState(null);

  useEffect(() => {
    if (open) {
      setNoteSelection(defaultNoteKind);
      setFormatSelection(defaultFormat);
      setDateFrom('');
      setDateTo('');
      setPickerField(null);
      setTimeout(() => scrollToSection(noteTypeRef), 50);
    }
  }, [open, defaultNoteKind, defaultFormat]);

  const filteredPreview = useMemo(() => {
    return filterObservationsForExport({
      observations,
      noteKinds: buildNoteKindsArray(noteSelection),
      dateRange: { from: dateFrom || null, to: dateTo || null }
    });
  }, [observations, noteSelection, dateFrom, dateTo]);

  const chosenTypeLabel = useMemo(() => {
    if (noteSelection === NOTE_KIND.LESSON) return 'Lesson Notes';
    if (noteSelection === NOTE_KIND.OBSERVATION) return 'Observations';
    return 'Observations + Lesson Notes';
  }, [noteSelection]);

  const isFromPicker = pickerField === 'from';
  const isToPicker = pickerField === 'to';

  const handleNoteSelection = (value) => {
    setNoteSelection(value);
    if (isSuperAdmin) {
      scrollToSection(formatRef);
    } else {
      scrollToSection(dateRef);
    }
  };

  const handleFormatSelection = (value) => {
    setFormatSelection(value);
    scrollToSection(dateRef);
  };

  const handleDateChange = (field, value) => {
    if (field === 'from') setDateFrom(value);
    if (field === 'to') setDateTo(value);
    setPickerField((prev) => (prev === field ? null : prev));
    scrollToSection(summaryRef);
  };

  const openCalendar = (field) => {
    setPickerField(field);
    const ref = field === 'from' ? fromInputRef : toInputRef;
    setTimeout(() => {
      const input = ref?.current;
      if (input) {
        input.focus({ preventScroll: true });
        if (typeof input.showPicker === 'function') {
          input.showPicker();
        }
      }
    }, 0);
  };

  const handleConfirm = () => {
    if (!onConfirm) return;
    onConfirm({
      noteKinds: buildNoteKindsArray(noteSelection),
      format: isSuperAdmin ? formatSelection : 'txt',
      dateRange: { from: dateFrom || null, to: dateTo || null }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: 'hidden',
          mx: { xs: 1, sm: 2 },
          my: { xs: 1, sm: 3 },
          width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)' }
        }
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          pr: 1
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Download color="secondary" />
          <Typography component="div" variant="h6">{title}</Typography>
        </Box>
        <IconButton aria-label="Close dialog" onClick={onClose} size="small" edge="end">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1, pb: 0 }}>
        <Box ref={noteTypeRef}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            What do you want to export?
          </Typography>
          <RadioGroup
            value={noteSelection}
            onChange={(e) => handleNoteSelection(e.target.value)}
          >
            {noteOptions.map((opt) => (
              <FormControlLabel
                key={opt.value}
                value={opt.value}
                control={<Radio />}
                label={opt.label}
              />
            ))}
          </RadioGroup>
        </Box>

        {isSuperAdmin && (
          <Box ref={formatRef}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Choose export format
            </Typography>
            <RadioGroup
              value={formatSelection}
              onChange={(e) => handleFormatSelection(e.target.value)}
            >
              {formatOptions.map((opt) => (
                <FormControlLabel
                  key={opt.value}
                  value={opt.value}
                  control={<Radio />}
                  label={opt.label}
                />
              ))}
            </RadioGroup>
          </Box>
        )}

        <Box ref={dateRef}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Enter time window
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="From"
              type={isFromPicker ? 'date' : 'text'}
              size="small"
              value={dateFrom}
              onChange={(e) => handleDateChange('from', e.target.value)}
              onBlur={() => setPickerField((prev) => (prev === 'from' ? null : prev))}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: renderDateAdornment(
                  dateFrom,
                  () => handleDateChange('from', ''),
                  () => openCalendar('from')
                )
              }}
              inputProps={{ inputMode: 'numeric', placeholder: 'DD/MM/YYYY' }}
              inputRef={fromInputRef}
              fullWidth
              sx={{ '& input': { pr: 4.5, fontSize: 16 } }}
            />
            <TextField
              label="To"
              type={isToPicker ? 'date' : 'text'}
              size="small"
              value={dateTo}
              onChange={(e) => handleDateChange('to', e.target.value)}
              onBlur={() => setPickerField((prev) => (prev === 'to' ? null : prev))}
              InputLabelProps={{ shrink: true }}
              InputProps={{
                endAdornment: renderDateAdornment(
                  dateTo,
                  () => handleDateChange('to', ''),
                  () => openCalendar('to')
                )
              }}
              inputProps={{ 
                inputMode: 'numeric', 
                placeholder: 'Up to today'
              }}
              inputRef={toInputRef}
              fullWidth
              sx={{ '& input': { pr: 4.5, fontSize: 16 } }}
            />
          </Box>
        </Box>

        <Box ref={summaryRef} sx={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 2, p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            Preview
          </Typography>
          <Divider sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            <strong>Student:</strong> {subjectLabel || 'This selection'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Type:</strong> {chosenTypeLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Format:</strong> {(isSuperAdmin ? formatSelection : 'txt').toUpperCase()}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Count:</strong> {filteredPreview.length}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Date Range:</strong> {(dateFrom || 'Earliest')} to {(dateTo || 'Latest')}
          </Typography>
          {filteredPreview.length === 0 && (
            <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
              No notes match the selected filters.
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 2, gap: 2 }}>
        <Button
          onClick={onClose}
          variant="contained"
          color="error"
          sx={{ flex: 1 }}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="success"
          sx={{ flex: 1 }}
          disabled={loading || filteredPreview.length === 0}
        >
          {loading ? 'Exporting…' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ExportWizard;
