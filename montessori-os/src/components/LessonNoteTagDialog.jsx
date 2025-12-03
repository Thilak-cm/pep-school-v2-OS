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
  Paper,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { isAdminRole } from '../utils/roleUtils';

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
  currentUser,
  userRole,
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
            ? 'Loading lesson notes...'
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
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 280, overflowY: 'auto' }}>
            {(() => {
              const searchLower = lessonSearch.trim().toLowerCase();
              const filtered = lessonNotes.filter((n) => {
                if (!searchLower) return true;
                const title = (n.lessonTitle || '').toLowerCase();
                return title.includes(searchLower);
              });
              const limited = filtered.slice(0, 3);
              if (limited.length === 0) {
                return (
                  <Typography variant="body2" color="text.secondary">
                    No lesson notes found.
                  </Typography>
                );
              }
              return limited.map((note) => {
                const canTag = isAdminRole(userRole) || (note.createdBy && currentUser?.uid === note.createdBy);
                const disabled = !canTag || saving;
                const checked = effectiveSelectedIds.includes(note.id);
                const handleClick = () => handleRowClick(note, disabled);
                return (
                  <Paper
                    key={note.id}
                    variant="outlined"
                    sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 1.5,
                        py: 1,
                        opacity: disabled ? 0.6 : 1,
                        backgroundColor: disabled ? '#f8fafc' : 'white',
                        cursor: disabled ? 'not-allowed' : 'pointer'
                      }}
                      onClick={handleClick}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClick();
                          }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={note.lessonTitle || 'Lesson Note'}
                        primaryTypographyProps={{ fontWeight: 600, color: '#1e293b' }}
                      />
                    </Box>
                  </Paper>
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
