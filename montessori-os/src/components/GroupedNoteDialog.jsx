// GroupedNoteDialog — displays multi-student note details as a bottom drawer
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  SwipeableDrawer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
} from '@mui/material';
import { User as Person, X as Close, Trash2 as Delete, Eye as Visibility, MessageCircle, BookOpen } from '../icons';
import { collectionGroup, query, where, getDocs, doc, deleteDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import { formatTimestamp } from '../utils/observationUtils.jsx';
import { isAdminRole } from '../utils/roleUtils';
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { getTeacherForNote } from './classroomTimelineUtils.js';
import { Avatar } from './ui';
import { TONE_STYLES } from './ui/toneStyles';
import {
  getLessonDimensions,
  LESSON_RATING_LABELS,
  LESSON_RATING_COLORS,
} from '../utils/lessonNoteConstraints';

export default function GroupedNoteDialog({ open, onClose, groupedNote, classroomStudents, classroomTeachers = [], userRole, onNavigateToStudent, onNotesChanged }) {
  const notify = useNotify();
  const note = groupedNote?.representativeNote;
  const isLesson = note?.type === 'lesson';
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const canDeleteGroupedNote = isAdminRole(userRole);

  const studentsInGroup = (groupedNote?.studentIds || [])
    .map(studentId => classroomStudents.find(s => s.id === studentId))
    .filter(Boolean);

  const getStudentDisplayName = (student) => {
    if (!student) return 'Unknown Student';
    return student.displayName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown Student';
  };

  const handleToggleStudent = (studentId) => {
    setSelectedStudentIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) newSet.delete(studentId);
      else newSet.add(studentId);
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedStudentIds.size === studentsInGroup.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(groupedNote.studentIds));
    }
  };

  const handleDeleteModeToggle = () => {
    if (!canDeleteGroupedNote) return;
    if (deleteMode) {
      setDeleteMode(false);
      setSelectedStudentIds(new Set());
    } else {
      setDeleteMode(true);
    }
  };

  const handleDeleteConfirmClick = () => {
    if (!canDeleteGroupedNote) return;
    if (selectedStudentIds.size === 0) {
      notify.warning('Please select at least one student to delete the note for.', { duration: 3000 });
      return;
    }
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!canDeleteGroupedNote || !groupedNote || selectedStudentIds.size === 0) return;

    setDeleting(true);
    setDeleteConfirmOpen(false);

    const studentIdsToDelete = Array.from(selectedStudentIds);
    const noteId = note.id;
    const { groupId } = groupedNote;

    const notifId = `delete-grouped-${noteId}`;
    const deleteCount = studentIdsToDelete.length;
    const isAll = deleteCount === studentsInGroup.length;

    notify.info(`Deleting note for ${isAll ? 'all' : deleteCount} student${deleteCount > 1 ? 's' : ''}…`, {
      id: notifId,
      actionLabel: 'Undo',
      onFinalize: async () => {
        try {
          const deletePromises = studentIdsToDelete.map(async (studentId) => {
            const studentNote = groupedNote.notes.find(n => n.studentId === studentId);
            if (studentNote) {
              const parentId = studentNote.parentStudentId || studentId;
              const noteIdToDelete = studentNote.id || noteId;
              await deleteDoc(doc(db, 'students', parentId, 'observations', noteIdToDelete));
            }
          });

          await Promise.all(deletePromises);

          if (!isAll && groupId) {
            try {
              const remainingSnap = await getDocs(
                query(collectionGroup(db, 'observations'), where('groupId', '==', groupId))
              );
              if (remainingSnap.size === 1) {
                const remainingDoc = remainingSnap.docs[0];
                await updateDoc(remainingDoc.ref, { groupId: deleteField() });
              }
            } catch (_err) {
              reportCaughtError(_err, 'GroupedNoteDialog', 'swallow-only try/catch');
            }
          }

          if (typeof onNotesChanged === 'function') onNotesChanged();

          notify.success(
            `Note deleted successfully for ${isAll ? 'all' : deleteCount} student${deleteCount > 1 ? 's' : ''}`,
            { id: notifId, duration: 2500 }
          );

          if (isAll) {
            onClose();
          } else {
            setSelectedStudentIds(new Set());
            setDeleteMode(false);
          }
        } catch {
          notify.error('Error deleting note(s). Please try again.', { id: notifId, duration: 3500 });
        }
      },
      onUndo: () => {
        notify.success('Undo Note Deletion Successful', { id: `${notifId}-undo`, duration: 2000 });
      },
      duration: 6000,
      variant: 'warning',
    });

    setDeleting(false);
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('noteDrawerToggle', { detail: { open } }));
    if (!open) {
      setSelectedStudentIds(new Set());
      setDeleteConfirmOpen(false);
      setDeleteMode(false);
    }
  }, [open]);

  if (!groupedNote || !note) return null;

  // --- Header data (mirrors SharedHeader pattern) ---
  const chipColors = TONE_STYLES[isLesson ? 'green' : 'slate'];
  const teacher = getTeacherForNote(note, classroomTeachers);
  const teacherName = teacher?.displayName || note.createdByName || note.createdBy || 'Unknown Teacher';
  const isFormerTeacher = teacher?.status === 'inactive';

  // Student names summary for the header
  const studentNamesSummary = studentsInGroup.length <= 2
    ? studentsInGroup.map(s => getStudentDisplayName(s)).join(', ')
    : `${getStudentDisplayName(studentsInGroup[0])}, ${getStudentDisplayName(studentsInGroup[1])} + ${studentsInGroup.length - 2} more`;

  // Group defaults + dimensions for lesson content
  const groupDefaults = note.groupDefaults || {};
  const dimensions = getLessonDimensions(note);

  return (
    <>
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        onOpen={() => {}}
        disableSwipeToOpen
        disableDiscovery
        PaperProps={{
          sx: {
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            maxHeight: '92vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* Drag handle */}
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
          <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'var(--color-border)' }} />
        </Box>

        {/* Header — mirrors SharedHeader */}
        <Box sx={{ px: 2.5, pt: 1.5 }}>
          {/* Row 1: Type chip + Close X */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Chip
              icon={<BookOpen size={14} style={{ color: chipColors.color }} />}
              label="LESSON NOTE"
              size="small"
              sx={{
                bgcolor: chipColors.bg,
                color: chipColors.color,
                border: `1px solid ${chipColors.border}`,
                fontWeight: 700,
                fontSize: '0.68rem',
                letterSpacing: '0.04em',
                height: 28,
                '& .MuiChip-icon': { ml: 0.75, mr: -0.25 },
              }}
            />
            <IconButton
              aria-label="Close"
              onClick={onClose}
              sx={{
                width: 32,
                height: 32,
                border: '1px solid var(--color-border)',
                bgcolor: 'var(--color-surface)',
              }}
            >
              <Close size={18} />
            </IconButton>
          </Box>

          {/* Row 2: Student names — large, bold */}
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              fontSize: '1.5rem',
              fontFamily: 'var(--font-display, "Schoolbell", cursive)',
              color: 'var(--color-text)',
              mb: 0.75,
            }}
          >
            {studentNamesSummary}
          </Typography>

          {/* Row 3: Teacher avatar + name + date */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Avatar name={teacherName} size="sm" />
            <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', fontSize: '0.82rem' }}>
              by <strong>{teacherName}{isFormerTeacher ? ' (removed)' : ''}</strong> · {formatTimestamp(note.observedAt || note.timestamp)}
            </Typography>
          </Box>
        </Box>

        {/* Scrollable content */}
        <Box sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', px: 2.5, pb: 1 }}>
          {/* Lesson content — mirrors LessonContent */}
          {isLesson && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--color-text)' }}>
                {note.lessonTitle || 'Lesson Note'}
              </Typography>

              {note.lessonDescription && (
                <Typography variant="body2" sx={{ color: 'var(--color-text)', fontSize: '0.88rem', lineHeight: 1.6 }}>
                  {note.lessonDescription}
                </Typography>
              )}

              {/* Group defaults (dotted) or individual dimensions */}
              {Object.keys(groupDefaults).length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    Group Defaults:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {Object.entries(groupDefaults).map(([dimension, rating]) => {
                      const color = LESSON_RATING_COLORS[rating] || LESSON_RATING_COLORS.na;
                      return (
                        <Chip
                          key={`group-default-${dimension}`}
                          size="small"
                          label={`${dimension}: ${LESSON_RATING_LABELS[rating] || 'N/A'}`}
                          sx={{
                            backgroundColor: `${color}18`,
                            color,
                            border: '1px dashed',
                            borderColor: color,
                            fontWeight: 600,
                            fontSize: '0.78rem',
                            height: 30,
                            justifyContent: 'flex-start',
                            width: 'fit-content',
                          }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              ) : dimensions.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {dimensions.map((dimension) => {
                    const rating = dimension.value || 'na';
                    const label = LESSON_RATING_LABELS[rating] || 'N/A';
                    const color = LESSON_RATING_COLORS[rating] || LESSON_RATING_COLORS.na;
                    return (
                      <Chip
                        key={`${note.id}-${dimension.name}`}
                        size="small"
                        label={`${dimension.name}  :  ${label}`}
                        sx={{
                          backgroundColor: `${color}18`,
                          color,
                          border: `1px solid ${color}40`,
                          fontWeight: 600,
                          fontSize: '0.78rem',
                          height: 30,
                          justifyContent: 'flex-start',
                          width: 'fit-content',
                        }}
                      />
                    );
                  })}
                </Box>
              ) : null}

              {note.groupComment && (
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                  {note.groupComment}
                </Typography>
              )}
            </Box>
          )}

          {/* Non-lesson text */}
          {!isLesson && (
            <Typography variant="body1" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.95rem' }}>
              {note.text || '(transcribing…)'}
            </Typography>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Student list section */}
          <Box>
            {deleteMode ? (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Select students to delete note for:
                  </Typography>
                  <Button
                    size="small"
                    onClick={handleSelectAll}
                    sx={{ textTransform: 'none', minWidth: 'auto', px: 1 }}
                  >
                    {selectedStudentIds.size === studentsInGroup.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </Box>
                <List sx={{ p: 0 }}>
                  {studentsInGroup.map((student) => {
                    const isSelected = selectedStudentIds.has(student.id);
                    return (
                      <ListItem key={student.id} disablePadding>
                        <ListItemButton
                          onClick={() => handleToggleStudent(student.id)}
                          sx={{ borderRadius: 1, '&:hover': { backgroundColor: 'var(--color-bg)' } }}
                        >
                          <ListItemIcon sx={{ minWidth: 40 }}>
                            <Checkbox edge="start" checked={isSelected} tabIndex={-1} disableRipple size="small" />
                          </ListItemIcon>
                          <ListItemText
                            primary={getStudentDisplayName(student)}
                            primaryTypographyProps={{ fontWeight: 500, color: isSelected ? 'primary.main' : 'text.primary' }}
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </>
            ) : (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Assigned to {studentsInGroup.length} student{studentsInGroup.length !== 1 ? 's' : ''}:
                </Typography>
                <Box>
                  {studentsInGroup.map((student) => {
                    const studentNote = groupedNote.notes.find(n => n.studentId === student.id);
                    const studentRatings = studentNote?.ratings || {};
                    const studentComment = studentNote?.studentComment;
                    const dimensionOrder = note.dimensionOrder || Object.keys(studentRatings);
                    const hasCustomRatings = dimensionOrder.some(dim => {
                      const studentRating = studentRatings[dim];
                      const defaultRating = groupDefaults[dim];
                      return studentRating && studentRating !== defaultRating;
                    });

                    return (
                      <Box
                        key={student.id}
                        sx={{ mb: 1.5, p: 2, borderRadius: 2, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Person size={16} style={{ color: 'var(--color-primary)' }} />
                            <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main' }}>
                              {getStudentDisplayName(student)}
                            </Typography>
                            {hasCustomRatings && (
                              <Chip
                                label="Custom"
                                size="small"
                                sx={{ height: 20, fontSize: '0.65rem', backgroundColor: 'var(--color-indigo-bg-light)', color: 'var(--color-primary)' }}
                              />
                            )}
                          </Box>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<Visibility />}
                            onClick={() => { onNavigateToStudent(student); onClose(); }}
                            sx={{ textTransform: 'none' }}
                          >
                            View Dashboard
                          </Button>
                        </Box>

                        {dimensionOrder.length > 0 && (
                          <Box sx={{ mt: 1.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1, display: 'block' }}>
                              Ratings:
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                              {dimensionOrder.map((dimension) => {
                                const studentRating = studentRatings[dimension];
                                const defaultRating = groupDefaults[dimension];
                                const isCustom = studentRating && studentRating !== defaultRating;
                                const displayRating = studentRating || defaultRating || 'na';
                                const color = LESSON_RATING_COLORS[displayRating] || LESSON_RATING_COLORS.na;
                                return (
                                  <Chip
                                    key={`${student.id}-${dimension}`}
                                    size="small"
                                    label={`${dimension}: ${LESSON_RATING_LABELS[displayRating] || 'N/A'}`}
                                    sx={{
                                      backgroundColor: `${color}22`,
                                      color,
                                      ...(isCustom && { border: '2px solid', borderColor: color, fontWeight: 600 }),
                                    }}
                                  />
                                );
                              })}
                            </Box>
                            {!hasCustomRatings && Object.keys(groupDefaults).length > 0 && (
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontStyle: 'italic' }}>
                                Uses group defaults
                              </Typography>
                            )}
                          </Box>
                        )}

                        {studentComment && (
                          <Box sx={{ mt: 1.5, borderLeft: '3px solid var(--color-amber-yellow)', bgcolor: 'var(--color-amber-bg)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0', px: 2, py: 1.5 }}>
                            <Typography variant="body2" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--color-text)', fontSize: '0.88rem' }}>
                              <MessageCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                              {studentComment}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </>
            )}
          </Box>
        </Box>

        {/* Action buttons — pinned at bottom */}
        <Box sx={{ display: 'flex', gap: 1.5, px: 2.5, py: 2, borderTop: '1px solid var(--color-border)' }}>
          {deleteMode && canDeleteGroupedNote ? (
            <>
              <Button
                onClick={handleDeleteModeToggle}
                variant="outlined"
                sx={{ flex: 1, borderRadius: 'var(--radius-pill)', textTransform: 'none' }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeleteConfirmClick}
                variant="outlined"
                color="error"
                startIcon={deleting ? <CircularProgress size={16} /> : <Delete size={16} />}
                disabled={deleting || selectedStudentIds.size === 0}
                sx={{ flex: 1, borderRadius: 'var(--radius-pill)', textTransform: 'none' }}
              >
                {deleting
                  ? 'Deleting...'
                  : selectedStudentIds.size === 0
                  ? 'Select to Delete'
                  : selectedStudentIds.size === studentsInGroup.length
                  ? 'Delete for All'
                  : `Delete for ${selectedStudentIds.size}`}
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={onClose}
                variant="outlined"
                sx={{ flex: 1, borderRadius: 'var(--radius-pill)', textTransform: 'none' }}
              >
                Close
              </Button>
              {canDeleteGroupedNote && (
                <Button
                  onClick={handleDeleteModeToggle}
                  variant="outlined"
                  color="error"
                  startIcon={<Delete size={16} />}
                  sx={{ flex: 1, borderRadius: 'var(--radius-pill)', textTransform: 'none' }}
                >
                  Delete Note
                </Button>
              )}
            </>
          )}
        </Box>
      </SwipeableDrawer>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, maxWidth: 343, width: 'calc(100% - 32px)', mx: 'auto' } }}
      >
        <DialogTitle component="div">
          <Typography component="h2" variant="h6" color="error">
            Delete Note
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {selectedStudentIds.size === studentsInGroup.length
              ? 'Are you sure you want to delete this note for all students?'
              : `Are you sure you want to delete this note for ${selectedStudentIds.size} selected student${selectedStudentIds.size > 1 ? 's' : ''}?`}
          </Typography>
          {selectedStudentIds.size < studentsInGroup.length && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The note will remain for the other {studentsInGroup.length - selectedStudentIds.size} student{studentsInGroup.length - selectedStudentIds.size > 1 ? 's' : ''}.
            </Typography>
          )}
          <Typography variant="body2" color="error" sx={{ fontWeight: 'medium' }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button onClick={handleDeleteCancel} variant="outlined" sx={{ flex: 1 }} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            sx={{ flex: 1 }}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <Delete />}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
