import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Alert,
  Checkbox,
  CircularProgress,
  Dialog,
  Button,
} from '@mui/material';
import { Close } from '@mui/icons-material';
function LessonNoteTagDialog({
  open,
  onClose,
  title,
  lessonNotes,
  lessonNotesLoading,
  lessonNotesError,
  onLessonNotesErrorClear,
  lessonSearch,
  onLessonSearchChange,
  selectedLessonIds = [],
  onSelectionChange,
  saving = false,
  deferApply = false,
  onApply,
  applyLabel = 'Save',
}) {
  const normalizeIds = (ids) => Array.from(new Set(ids || [])).filter(Boolean);

  const [pendingLessonIds, setPendingLessonIds] = React.useState(
    normalizeIds(selectedLessonIds)
  );

  React.useEffect(() => {
    if (open) {
      setPendingLessonIds(normalizeIds(selectedLessonIds));
    }
  }, [open, selectedLessonIds]);

  const effectiveSelectedIds = deferApply
    ? pendingLessonIds
    : normalizeIds(selectedLessonIds);

  const arraysEqual = (a, b) => {
    const as = normalizeIds(a).sort();
    const bs = normalizeIds(b).sort();
    if (as.length !== bs.length) return false;
    for (let i = 0; i < as.length; i += 1) {
      if (as[i] !== bs[i]) return false;
    }
    return true;
  };

  const hasChanges = deferApply && !arraysEqual(pendingLessonIds, selectedLessonIds);

  const handleRowClick = (note, disabled) => {
    if (disabled) return;
    const id = note.id;
    if (deferApply) {
      setPendingLessonIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    } else if (onSelectionChange) {
      const base = effectiveSelectedIds;
      const next = base.includes(id)
        ? base.filter((x) => x !== id)
        : [...base, id];
      onSelectionChange(next);
    }
  };

  const handleApply = () => {
    if (!deferApply || !onApply) return;
    onApply(normalizeIds(pendingLessonIds));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
    >
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="h6">
            {title}
          </Typography>
          <IconButton
            size="small"
            aria-label="Close tag lesson notes dialog"
            onClick={onClose}
            sx={{ alignSelf: 'flex-start' }}
          >
            <Close fontSize="small" />
          </IconButton>
        </Box>
        <TextField
          fullWidth
          placeholder="Search lesson titles"
          value={lessonSearch}
          onChange={(e) => onLessonSearchChange(e.target.value)}
        />
        <Typography variant="body2" color="text.secondary">
          {lessonNotesLoading
            ? 'Coach Pepper is gathering lesson notes...'
            : `${lessonNotes.length} lesson note${lessonNotes.length === 1 ? '' : 's'} available`}
        </Typography>
        {lessonNotesError && (
          <Alert severity="error" onClose={onLessonNotesErrorClear}>
            {lessonNotesError}
          </Alert>
        )}
        {lessonNotesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: '50vh', overflowY: 'auto', mx: -0.5, px: 0.5 }}>
            {(() => {
              const searchLower = lessonSearch.trim().toLowerCase();
              const filtered = lessonNotes.filter((n) => {
                if (!searchLower) return true;
                const title = (n.lessonTitle || '').toLowerCase();
                return title.includes(searchLower);
              });
              if (filtered.length === 0) {
                return (
                  <Typography variant="body2" color="text.secondary">
                    No lesson notes found.
                  </Typography>
                );
              }
              return filtered.map((note) => {
                const disabled = saving;
                const checked = effectiveSelectedIds.includes(note.id);
                const handleClick = () => handleRowClick(note, disabled);
                return (
                  <Box
                    key={note.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1.5,
                      opacity: disabled ? 0.6 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      backgroundColor: checked ? '#eef2ff' : 'transparent',
                      border: '1px solid',
                      borderColor: checked ? '#818cf8' : 'transparent',
                      '&:hover': {
                        backgroundColor: checked ? '#eef2ff' : '#f8fafc',
                      },
                      transition: 'all 0.15s ease',
                    }}
                    onClick={handleClick}
                  >
                    <Checkbox
                      size="small"
                      checked={checked}
                      disabled={disabled}
                      sx={{
                        p: 0.5,
                        color: '#cbd5e1',
                        '&.Mui-checked': { color: '#4f46e5' },
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClick();
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 500, color: '#1e293b' }}>
                      {note.lessonTitle || 'Lesson Note'}
                    </Typography>
                  </Box>
                );
              });
            })()}
          </Box>
        )}
        {deferApply && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
            <Button
              variant="text"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleApply}
              disabled={saving || !hasChanges}
            >
              {saving ? <CircularProgress size={16} /> : applyLabel}
            </Button>
          </Box>
        )}
      </Box>
    </Dialog>
  );
}

export default LessonNoteTagDialog;
