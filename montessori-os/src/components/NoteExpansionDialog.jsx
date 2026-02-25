// NoteExpansionDialog.jsx - Reusable component for expanding notes
import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Divider,
  TextField
} from '@mui/material';
import { 
  Star, 
  Edit, 
  AccessTime, 
  Delete, 
  Save, 
  Cancel, 
  Person, 
  SwapHoriz, 
  Close, 
  Mic,
  Visibility,
  School,
  MenuBook,
  Link
} from '@mui/icons-material';
import LessonNoteTagDialog from './LessonNoteTagDialog';
import { 
  doc, 
  deleteDoc, 
  updateDoc, 
  serverTimestamp, 
  getDoc, 
  setDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import { formatTimestamp, getObservationTypeIcon, getObservationTypeText } from '../utils/observationUtils.jsx';
import {
  AUTHOR_ACTION_EXPIRED_MESSAGE,
  canDeleteObservation,
  canEditObservation,
  canReassignObservation,
  isAuthorActionExpired,
  isObservationAuthor,
} from '../utils/observationPermissions';
import { isAdminRole } from '../utils/roleUtils';
import ClassroomStudentPicker from './ClassroomStudentPicker';
import { 
  getLessonDimensions, 
  LESSON_RATING_LABELS, 
  LESSON_RATING_COLORS,
  LESSON_ATTENDANCE_LABELS
} from '../utils/lessonNoteConstraints';
import { reportCaughtError } from '../utils/reportCaughtError.js';

function NoteExpansionDialog({ 
  open, 
  onClose, 
  observation, 
  student, 
  currentUser, 
  userRole,
  onNavigateToStudent, // For classroom timeline navigation
  isClassroomContext = false, // To show "View Student Timeline" button
  onNotesChanged,
}) {
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Map short codes to human-friendly names
  const languageName = (code) => {
    if (!code) return null;
    const v = String(code).toLowerCase();
    const base = v.includes('-') ? v.split('-')[0] : v;
    const map = { en: 'English', hi: 'Hindi', ta: 'Tamil', kn: 'Kannada', te: 'Telugu' };
    if (map[base]) return map[base];
    if (['english','hindi','tamil','kannada','telugu'].includes(base)) {
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
    return code;
  };
  
  // Reassignment states
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignConfirmOpen, setReassignConfirmOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [reassignSelectedStudents, setReassignSelectedStudents] = useState([]);
  const [reassignToStudentName, setReassignToStudentName] = useState('');
  const [linkedLessonTitles, setLinkedLessonTitles] = useState({});
  const [linkedLessonLoading, setLinkedLessonLoading] = useState(false);
  const normalizeLinkedIds = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
    return [value];
  };
  const [linkedLessonObservationIds, setLinkedLessonObservationIds] = useState(
    normalizeLinkedIds(observation?.linkedLessonObservationId)
  );
  
  // Previous classroom info (when note was logged from a different classroom)
  const [previousClassroomName, setPreviousClassroomName] = useState(null);

  // Lesson tag edit state (for existing text/voice notes)
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [lessonNotes, setLessonNotes] = useState([]);
  const [lessonNotesLoading, setLessonNotesLoading] = useState(false);
  const [lessonNotesError, setLessonNotesError] = useState('');
  const [lessonSearch, setLessonSearch] = useState('');
  const [tagStudentName, setTagStudentName] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);

  const isLessonObservation = observation?.type === 'lesson';
  const canEditCurrentObservation = canEditObservation(observation, currentUser, userRole);
  const canDeleteCurrentObservation = canDeleteObservation(observation, currentUser, userRole);
  const canReassignCurrentObservation = canReassignObservation(observation, currentUser, userRole);
  const isCurrentObservationAuthor = isObservationAuthor(observation, currentUser);
  const authorActionsExpired = isAuthorActionExpired(observation, currentUser, userRole);
  const canManageAuthorActions = isAdminRole(userRole) || isCurrentObservationAuthor;

  const getPermissionErrorMessage = () => (
    authorActionsExpired ? AUTHOR_ACTION_EXPIRED_MESSAGE : 'You do not have permission to modify this note.'
  );

  const renderLessonDetail = () => {
    if (!observation) return null;
    const dimensions = getLessonDimensions(observation);
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {observation.lessonTitle || 'Lesson Note'}
        </Typography>
        {observation.lessonDescription && (
          <Typography variant="body2" color="text.secondary">
            {observation.lessonDescription}
          </Typography>
        )}
        {observation.groupComment && (
          <Typography variant="body2" color="text.secondary">
            {observation.groupComment}
          </Typography>
        )}
        {/* Individual ratings */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {dimensions.map((dimension) => {
            const rating = dimension.value || 'na';
            const color = LESSON_RATING_COLORS[rating] || '#475569';
            return (
              <Chip
                key={`${observation.id}-${dimension.name}`}
                size="small"
                label={`${dimension.name}: ${LESSON_RATING_LABELS[rating] || 'N/A'}`}
                sx={{ backgroundColor: `${color}22`, color }}
              />
            );
          })}
        </Box>
        {observation.studentComment && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary">
              💬 {observation.studentComment}
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  // Reset states when dialog opens/closes
  React.useEffect(() => {
    if (open && observation) {
      setEditText(observation.type === 'lesson' ? '' : (observation.text || ''));
      setEditing(false);
      setLinkedLessonObservationIds(normalizeLinkedIds(observation?.linkedLessonObservationId));
      setLinkedLessonTitles({});
      setLinkedLessonLoading(false);
    }
  }, [open, observation]);

  // Check if note was logged from a previous classroom and fetch classroom name
  React.useEffect(() => {
    const checkPreviousClassroom = async () => {
      if (!observation || !student || !open) {
        setPreviousClassroomName(null);
        return;
      }

      // Get classroom IDs (handle different formats)
      const noteClassroomId = observation.classroomId;
      const studentClassroomId = student.classroomId;

      // Normalize classroom IDs (handle string paths)
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') {
          return id.includes('/') ? id.split('/').pop() : id;
        }
        if (typeof id === 'object' && id.id) {
          return id.id;
        }
        return id;
      };

      const normalizedNoteClassroomId = normalizeId(noteClassroomId);
      const normalizedStudentClassroomId = normalizeId(studentClassroomId);

      // If classroomIds don't match, fetch the previous classroom name
      if (normalizedNoteClassroomId && normalizedStudentClassroomId && 
          normalizedNoteClassroomId !== normalizedStudentClassroomId) {
        try {
          const classroomDoc = await getDoc(doc(db, 'classrooms', normalizedNoteClassroomId));
          if (classroomDoc.exists()) {
            const classroomData = classroomDoc.data();
            setPreviousClassroomName(classroomData.name || normalizedNoteClassroomId);
          } else {
            setPreviousClassroomName(normalizedNoteClassroomId); // Fallback to ID if doc doesn't exist
          }
        } catch (error) {
          setPreviousClassroomName(normalizedNoteClassroomId); // Fallback to ID on error
        }
      } else {
        setPreviousClassroomName(null);
      }
    };

    checkPreviousClassroom();
  }, [observation, student, open]);

  // Keep local linkedLessonObservationIds in sync with the observation prop
  React.useEffect(() => {
    setLinkedLessonObservationIds(normalizeLinkedIds(observation?.linkedLessonObservationId));
  }, [observation?.linkedLessonObservationId]);

  // Fetch the titles of linked lesson notes if they're not already present on the observation
  React.useEffect(() => {
    let isActive = true;
    const loadLinkedLessonTitles = async () => {
      const ids = linkedLessonObservationIds || [];
      if (!open || ids.length === 0) {
        if (isActive) {
          setLinkedLessonTitles({});
          setLinkedLessonLoading(false);
        }
        return;
      }
      const parentId = observation?.parentStudentId || observation?.studentId;
      if (!parentId) {
        if (isActive) {
          setLinkedLessonTitles({});
          setLinkedLessonLoading(false);
        }
        return;
      }
      setLinkedLessonLoading(true);
      try {
        const snaps = await Promise.all(
          ids.map((id) => getDoc(doc(db, 'students', parentId, 'observations', id)))
        );
        if (!isActive) return;
        const nextTitles = {};
        snaps.forEach((snap, idx) => {
          const id = ids[idx];
          if (snap.exists()) {
            const data = snap.data() || {};
            const title = data.lessonTitle || data.title || data.lessonName || data.text || data.name;
            nextTitles[id] = title || 'Untitled lesson';
          } else {
            nextTitles[id] = 'Untitled lesson';
          }
        });
        setLinkedLessonTitles(nextTitles);
      } catch (error) {
        if (isActive) {
          const fallback = {};
          (linkedLessonObservationIds || []).forEach((id) => {
            fallback[id] = 'Untitled lesson';
          });
          setLinkedLessonTitles(fallback);
        }
      }
      if (isActive) setLinkedLessonLoading(false);
    };
    loadLinkedLessonTitles();
    return () => { isActive = false; };
  }, [linkedLessonObservationIds, observation?.studentId, observation?.parentStudentId, open]);

  const toDate = (ts) => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return null;
  };

  const loadLessonNotesForStudent = async (studentId) => {
    if (!studentId) return;
    try {
      setLessonNotesLoading(true);
      setLessonNotesError('');

      // Try to derive student name from props first, then fall back to Firestore
      let name =
        student?.name ||
        student?.displayName ||
        [student?.firstName, student?.lastName].filter(Boolean).join(' ');
      if (!name) {
        try {
          const stuSnap = await getDoc(doc(db, 'students', studentId));
          const sdata = stuSnap.data() || {};
          name =
            sdata.displayName ||
            sdata.name ||
            [sdata.firstName, sdata.lastName].filter(Boolean).join(' ');
        } catch (_) {
          reportCaughtError(_, 'NoteExpansionDialog', 'swallow-only try/catch at L331');
        }
      }
      setTagStudentName(name || '');

      const q = query(
        collection(db, 'students', studentId, 'observations'),
        where('type', '==', 'lesson'),
        limit(25)
      );
      const snap = await getDocs(q);
      const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notes.sort((a, b) => {
        const da = toDate(a.observedAt || a.createdAt) || new Date(0);
        const db = toDate(b.observedAt || b.createdAt) || new Date(0);
        return db - da;
      });
      setLessonNotes(notes);
    } catch (err) {
      setLessonNotesError('Unable to load lesson notes. Try again.');
    } finally {
      setLessonNotesLoading(false);
    }
  };

  const handleOpenTagDialogFromView = async () => {
    if (!observation || isLessonObservation) return;
    if (!canEditCurrentObservation) {
      notify.error(getPermissionErrorMessage());
      return;
    }
    const studentId = observation.parentStudentId || observation.studentId;
    if (!studentId) {
      notify.info('Unable to edit tagged lesson: missing student.');
      return;
    }
    setLessonSearch('');
    setTagDialogOpen(true);
    await loadLessonNotesForStudent(studentId);
  };

  const handleCloseDialog = () => {
    onClose();
    setEditing(false);
    setEditText('');
    setReassignDialogOpen(false);
    setReassignConfirmOpen(false);
    setReassignSelectedStudents([]);
  };

  const handleDeleteClick = () => {
    if (!canDeleteCurrentObservation) {
      notify.error(getPermissionErrorMessage());
      return;
    }
    // Show delete confirmation
    if (window.confirm('Are you sure you want to delete this observation note? This action cannot be undone.')) {
      handleDeleteConfirm();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!observation) return;
    if (!canDeleteCurrentObservation) {
      notify.error(getPermissionErrorMessage());
      return;
    }
    setDeleting(false);
    const obs = observation;
    handleCloseDialog();
    // Schedule deletion with Undo option via notification
    const notifId = `delete-${obs.id}`;
    notify.info('Deleting note…', {
      id: notifId,
      actionLabel: 'Undo',
      onFinalize: async () => {
        try {
          const parentId = obs.parentStudentId || obs.studentId;
          await deleteDoc(doc(db, 'students', parentId, 'observations', obs.id));
          if (typeof onNotesChanged === 'function') {
            onNotesChanged();
          }
          notify.success('Note deleted successfully', { id: notifId, duration: 2500 });
        } catch (error) {
          notify.error('Error deleting note. Please try again.', { id: notifId, duration: 3500 });
        }
      },
      onUndo: () => {
        notify.success('Undo Note Deletion Successful', { id: `${notifId}-undo`, duration: 2000 });
      },
      duration: 6000,
      variant: 'warning',
    });
  };

  const handleEditClick = () => {
    if (!canEditCurrentObservation) {
      notify.error(getPermissionErrorMessage());
      return;
    }
    if (observation) {
      setEditText(observation.text || '');
      setEditing(true);
    }
  };

  const handleEditLessonNavigate = () => {
    if (!observation || observation.type !== 'lesson') return;
    if (!canEditCurrentObservation) {
      notify.error(getPermissionErrorMessage());
      return;
    }
    const targetStudentId = observation.parentStudentId || observation.studentId || student?.id;
    const targetClassroomId = observation.classroomId || student?.classroomId || null;
    try {
      window.dispatchEvent(new CustomEvent('navigateToStudentNotes', {
        detail: {
          studentId: targetStudentId,
          noteTypeFilter: 'lesson',
          lessonEditObservation: { ...observation, studentId: targetStudentId, classroomId: targetClassroomId },
          returnScreen: isClassroomContext ? 'classroomTimeline' : 'timeline',
        }
      }));
    } catch (_) {
      reportCaughtError(_, 'NoteExpansionDialog', 'swallow-only try/catch at L455');
    }
    handleCloseDialog();
  };

  const handleOpenLinkedLesson = (lessonObservationId) => {
    if (!lessonObservationId || !student) return;
    try {
      window.dispatchEvent(new CustomEvent('navigateToStudentNotes', {
        detail: { studentId: student.id, noteTypeFilter: 'lesson', noteId: lessonObservationId }
      }));
      onClose?.();
    } catch (_) {
      reportCaughtError(_, 'NoteExpansionDialog', 'swallow-only try/catch at L466');
    }
  };

  const handleSelectLessonTagFromView = async (nextIds) => {
    if (!observation) return;
    const studentId = observation.parentStudentId || observation.studentId;
    if (!studentId) return;

    const currentIds = normalizeLinkedIds(linkedLessonObservationIds);
    const desiredIds = normalizeLinkedIds(nextIds);

    // If nothing changed, just close the dialog.
    const unchanged =
      currentIds.length === desiredIds.length &&
      currentIds.every((id) => desiredIds.includes(id));
    if (unchanged) {
      setTagDialogOpen(false);
      return;
    }

    const added = desiredIds.filter((id) => !currentIds.includes(id));
    const removed = currentIds.filter((id) => !desiredIds.includes(id));

    try {
      setLinkSaving(true);
      const obsRef = doc(db, 'students', studentId, 'observations', observation.id);
      const updatePayload = {
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp(),
      };
      updatePayload.linkedLessonObservationId = desiredIds;
      await updateDoc(obsRef, updatePayload);

      // Add backlinks on newly added lesson notes
      await Promise.all(
        added.map(async (lessonId) => {
          try {
            const lessonRef = doc(db, 'students', studentId, 'observations', lessonId);
            await updateDoc(lessonRef, {
              linkedObservations: arrayUnion(observation.id),
            });
          } catch (err) {
            reportCaughtError(err, 'NoteExpansionDialog', 'swallow-only try/catch at L508');
          }
        })
      );

      // Remove backlinks from lessons that are no longer linked
      await Promise.all(
        removed.map(async (lessonId) => {
          try {
            const lessonRef = doc(db, 'students', studentId, 'observations', lessonId);
            await updateDoc(lessonRef, {
              linkedObservations: arrayRemove(observation.id),
            });
          } catch (err) {
            reportCaughtError(err, 'NoteExpansionDialog', 'swallow-only try/catch at L521');
          }
        })
      );

      setLinkedLessonObservationIds(desiredIds);
      notify.success(
        desiredIds.length > 0 ? 'Tagged lesson notes updated' : 'Tagged lesson notes cleared'
      );
      setTagDialogOpen(false);
    } catch (error) {
      notify.error('Error updating tagged lesson note. Please try again.');
    } finally {
      setLinkSaving(false);
    }
  };

  const handleEditSave = async () => {
    if (!observation || observation.type === 'lesson' || !editText.trim()) return;
    if (!canEditCurrentObservation) {
      notify.error(getPermissionErrorMessage());
      return;
    }

    try {
      setSaving(true);
      const updateData = {
        text: editText.trim(),
        editCount: (observation.editCount || 0) + 1,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'students', observation.studentId, 'observations', observation.id), updateData);
      
      setEditing(false);
      setEditText('');
      notify.success('Note updated successfully');
    } catch (error) {
      notify.error('Error saving changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditing(false);
    setEditText('');
  };

  // Reassignment handlers
  const handleReassignClick = () => {
    setReassignSelectedStudents([]);
    setReassignDialogOpen(true);
  };

  const handleReassignCancel = () => {
    setReassignDialogOpen(false);
    setReassignSelectedStudents([]);
  };

  const handleReassignStudentsChange = (studentIds) => {
    setReassignSelectedStudents(studentIds);
  };

  const handleReassignNext = () => {
    if (reassignSelectedStudents.length === 1) {
      const selectedStudentId = reassignSelectedStudents[0];
      
      // Prevent reassigning to the same student
      if (selectedStudentId === observation.studentId) {
        alert('Cannot reassign a note to the same student.');
        return;
      }
      
      setReassignDialogOpen(false);
      setReassignConfirmOpen(true);
    }
  };

  // When confirm dialog opens with exactly one selected student, fetch their name for display
  React.useEffect(() => {
    const loadName = async () => {
      try {
        const selId = reassignSelectedStudents[0];
        if (!reassignConfirmOpen || !selId) return;
        const snap = await getDoc(doc(db, 'students', selId));
        const data = snap.data() || {};
        const composed = data.name || data.displayName || [data.firstName, data.lastName].filter(Boolean).join(' ');
        setReassignToStudentName(composed || 'Selected student');
      } catch (_) {
        setReassignToStudentName('Selected student');
      }
    };
    loadName();
  }, [reassignConfirmOpen, reassignSelectedStudents]);

  const handleConfirmReassign = async () => {
    if (!observation || reassignSelectedStudents.length !== 1) return;

    try {
      setReassigning(true);
      const newStudentId = reassignSelectedStudents[0];
      const oldParentId = observation.parentStudentId || observation.studentId;
      const srcRef = doc(db, 'students', oldParentId, 'observations', observation.id);
      const srcSnap = await getDoc(srcRef);
      if (!srcSnap.exists()) throw new Error('Source observation not found');

      const srcData = srcSnap.data() || {};
      // Fetch target student's classroomId for denorm
      let targetClassroomId = srcData.classroomId;
      try {
        const targetStuSnap = await getDoc(doc(db, 'students', newStudentId));
        targetClassroomId = targetStuSnap.data()?.classroomId || targetClassroomId;
      } catch (_) {
        reportCaughtError(_, 'NoteExpansionDialog', 'swallow-only try/catch at L636');
      }

      const destRef = doc(db, 'students', newStudentId, 'observations', observation.id);
      const newData = {
        ...srcData,
        studentId: newStudentId,
        classroomId: targetClassroomId,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp(),
      };
      await setDoc(destRef, newData);
      await deleteDoc(srcRef);

      // Close all dialogs
      setReassignConfirmOpen(false);
      handleCloseDialog();
      // Show success with quick jump to the new student's Notes page
      notify.success(reassignToStudentName ? `Note reassigned to ${reassignToStudentName}` : 'Note reassigned', {
        duration: 6000,
        id: `reassign-${observation.id}`,
        actionLabel: 'View Note',
        onUndo: () => {
          try {
            window.dispatchEvent(new CustomEvent('navigateToStudentNotes', {
              detail: {
                studentId: newStudentId,
                noteTypeFilter: observation?.type === 'lesson' ? 'lesson' : 'textVoice'
              }
            }));
          } catch (_) {
            reportCaughtError(_, 'NoteExpansionDialog', 'swallow-only try/catch at L666');
          }
        },
      });
    } catch (error) {
      notify.error('Error reassigning note. Please try again.', { id: `reassign-${observation?.id || 'unknown'}` });
    } finally {
      setReassigning(false);
    }
  };

  const handleCancelReassign = () => {
    setReassignConfirmOpen(false);
    setReassignSelectedStudents([]);
  };

  const handleViewStudentTimeline = () => {
    if (student?.id) {
      try {
        window.dispatchEvent(new CustomEvent('navigateToStudentNotes', {
          detail: {
            studentId: student.id,
            student,
            noteTypeFilter: observation?.type === 'lesson' ? 'lesson' : 'textVoice'
          }
        }));
      } catch (_) {
        reportCaughtError(_, 'NoteExpansionDialog', 'swallow-only try/catch at L691');
      }
      handleCloseDialog();
    } else if (onNavigateToStudent && student) {
      // Fallback for environments without the global handler
      onNavigateToStudent(student);
      handleCloseDialog();
    }
  };

  if (!observation) return null;

  return (
    <>
      {/* Main Note Detail Dialog */}
      <Dialog
        open={open}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: 343,
            width: 'calc(100% - 32px)',
            mx: 'auto'
          }
        }}
      >
        <DialogTitle component="div" sx={{ pb: 1, pr: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {getObservationTypeIcon(observation.type)}
              <Typography component="h2" variant="h6">
                {getObservationTypeText(observation.type)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {!isLessonObservation && canManageAuthorActions && (
                <IconButton
                  aria-label="Edit note"
                  onClick={handleEditClick}
                  disabled={!canEditCurrentObservation}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': {
                      backgroundColor: 'rgba(0, 0, 0, 0.04)'
                    }
                  }}
                >
                  <Edit fontSize="small" />
                </IconButton>
              )}
              <IconButton
                aria-label="Close dialog"
                onClick={handleCloseDialog}
                sx={{
                  color: 'text.secondary',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)'
                  }
                }}
              >
                <Close />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          {editing && !isLessonObservation ? (
            <TextField
              multiline
              rows={4}
              fullWidth
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="Edit your observation..."
              variant="outlined"
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                }
              }}
            />
          ) : (
            <>
              {isLessonObservation ? (
                <Box sx={{ mb: 3 }}>
                  {renderLessonDetail()}
                </Box>
              ) : (
                <Typography 
                  variant="body1" 
                  sx={{ mb: 3, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {observation.text}
                </Typography>
              )}
            </>
          )}
          
          <Divider sx={{ my: 2 }} />
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {formatTimestamp(observation.observedAt || observation.timestamp)}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                Created by: {observation.createdByName || observation.createdByEmail || 'Unknown Teacher'}
              </Typography>
            </Box>
            
            {observation.type === 'voice' && observation.duration && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Mic sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {`Duration: ${observation.duration || 0} seconds`}
                </Typography>
              </Box>
            )}

            {!isLessonObservation && (observation.type === 'text' || observation.type === 'voice') && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" color="text.secondary">
                    Tagged Lesson Notes:
                  </Typography>
                  {linkedLessonObservationIds && linkedLessonObservationIds.length > 0 ? (
                    linkedLessonObservationIds.map((id) => (
                      <Button
                        key={id}
                        size="small"
                        variant="outlined"
                        onClick={() => handleOpenLinkedLesson(id)}
                        sx={{ 
                          textTransform: 'none', 
                          fontWeight: 700,
                          borderRadius: 999,
                          px: 1.5,
                          py: 0.25
                        }}
                      >
                        {linkedLessonLoading && !linkedLessonTitles[id] ? (
                          <CircularProgress size={12} thickness={5} />
                        ) : (
                          linkedLessonTitles[id] ?? 'Untitled lesson'
                        )}
                      </Button>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      None
                    </Typography>
                  )}
                </Box>
              </Box>
            )}

            {isLessonObservation && Array.isArray(observation.linkedObservations) && observation.linkedObservations.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <MenuBook sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {`Tagged observations: ${observation.linkedObservations.length}`}
                </Typography>
              </Box>
            )}
            
            {isAdminRole(userRole) && !isLessonObservation && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Edit sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  Edit count: {observation.editCount || 0}
                </Typography>
              </Box>
            )}
            
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  Assigned To: {student?.name || student?.displayName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Unknown Student'}
                </Typography>
              </Box>
            </Box>

            {/* Show previous classroom info if note was logged from a different classroom */}
            {previousClassroomName && (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1,
                p: 1.5,
                backgroundColor: '#fef3c7',
                borderRadius: 1,
                border: '1px solid #fde68a'
              }}>
                <School sx={{ fontSize: 16, color: '#d97706' }} />
                <Typography variant="body2" sx={{ color: '#92400e', fontStyle: 'italic' }}>
                  Note logged when {student?.name || student?.displayName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'this student'} was in {previousClassroomName}
                </Typography>
              </Box>
            )}

            {/* View Student Timeline Button - Only show in classroom context */}
            {isClassroomContext && onNavigateToStudent && student && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Button 
                  onClick={handleViewStudentTimeline}
                  variant="outlined" 
                  color="primary"
                  startIcon={<Visibility />}
                  fullWidth
                  size="small"
                >
                  View Student Timeline
                </Button>
              </Box>
            )}
            
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {observation.isStarred && (
                <Chip 
                  icon={<Star sx={{ fontSize: 16 }} />} 
                  label="Starred" 
                  size="small" 
                  color="warning"
                />
              )}
              {observation.isPrivate && (
                <Chip 
                  label="Private" 
                  size="small" 
                  color="error"
                />
              )}
              {observation.isDraft && (
                <Chip 
                  label="Draft" 
                  size="small" 
                  color="info"
                />
              )}
            </Box>
          </Box>
        </DialogContent>
        {(editing || canManageAuthorActions || canReassignCurrentObservation) && (
          <DialogActions sx={{ px: 3, pb: 3, gap: 2, flexDirection: 'column', alignItems: 'stretch' }}>
            {editing ? (
              <>
                <Button 
                  onClick={handleEditCancel} 
                  variant="outlined" 
                  sx={{ flex: 1 }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleEditSave} 
                  variant="contained" 
                  color="primary"
                  startIcon={saving ? <CircularProgress size={16} /> : <Save />}
                  sx={{ flex: 1 }}
                  disabled={saving || !editText.trim()}
                >
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <>
                {authorActionsExpired && (
                  <Typography variant="body2" sx={{ color: '#92400e', fontStyle: 'italic', textAlign: 'center' }}>
                    {AUTHOR_ACTION_EXPIRED_MESSAGE}
                  </Typography>
                )}
                {!isLessonObservation && canManageAuthorActions && (
                  <Button
                    onClick={handleOpenTagDialogFromView}
                    variant="outlined"
                    color="primary"
                    startIcon={<Link />}
                    fullWidth
                    sx={{ borderRadius: 2, justifyContent: 'center' }}
                    disabled={linkSaving || !canEditCurrentObservation}
                  >
                    Edit tagged lesson notes
                  </Button>
                )}
                {canReassignCurrentObservation && (
                  <Button 
                    onClick={handleReassignClick} 
                    variant="outlined" 
                    color="secondary"
                    startIcon={<SwapHoriz />}
                    fullWidth
                    sx={{ borderRadius: 2, justifyContent: 'center' }}
                  >
                    Reassign
                  </Button>
                )}
                {isLessonObservation && canManageAuthorActions && (
                  <Button
                    onClick={handleEditLessonNavigate}
                    variant="outlined"
                    color="primary"
                    startIcon={<Edit />}
                    fullWidth
                    disabled={!canEditCurrentObservation}
                    sx={{ borderRadius: 2, justifyContent: 'center' }}
                  >
                    Edit
                  </Button>
                )}
                {canManageAuthorActions && (
                  <Button 
                    onClick={handleDeleteClick} 
                    variant="outlined" 
                    color="error"
                    startIcon={<Delete />}
                    fullWidth
                    disabled={!canDeleteCurrentObservation}
                    sx={{ borderRadius: 2, justifyContent: 'center' }}
                  >
                    Delete
                  </Button>
                )}
              </>
            )}
          </DialogActions>
        )}
      </Dialog>

      {/* Tag lesson notes dialog for existing text/voice notes */}
      <LessonNoteTagDialog
        open={tagDialogOpen}
        onClose={() => setTagDialogOpen(false)}
        title={`Edit tagged lesson notes${tagStudentName ? ` for ${tagStudentName}` : ''}`}
        lessonNotes={lessonNotes}
        lessonNotesLoading={lessonNotesLoading}
        lessonNotesError={lessonNotesError}
        onLessonNotesErrorClear={() => setLessonNotesError('')}
        lessonSearch={lessonSearch}
        onLessonSearchChange={setLessonSearch}
        currentUser={currentUser}
        userRole={userRole}
        selectedLessonIds={linkedLessonObservationIds}
        onSelectionChange={setLinkedLessonObservationIds}
        saving={linkSaving}
        deferApply
        onApply={handleSelectLessonTagFromView}
      />

      {/* Student Selection Dialog for Reassignment */}
      <Dialog
        open={reassignDialogOpen}
        onClose={handleReassignCancel}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: 500,
            width: 'calc(100% - 32px)',
            mx: 'auto',
            maxHeight: '90vh'
          }
        }}
      >
        <DialogTitle component="div" sx={{ pb: 2 }}>
          <Typography component="h2" variant="h6">
            Reassign Note to Student
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Select a student to reassign this observation to:
          </Typography>
          
          <ClassroomStudentPicker
            selectedStudents={reassignSelectedStudents}
            onStudentsChange={handleReassignStudentsChange}
            currentUser={currentUser}
            userRole={userRole}
            disabledStudentIds={[observation?.studentId].filter(Boolean)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button 
            onClick={handleReassignCancel} 
            variant="outlined" 
            sx={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleReassignNext} 
            variant="contained" 
            color="primary"
            sx={{ flex: 1 }}
            disabled={reassignSelectedStudents.length !== 1}
          >
            Next
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reassignment Confirmation Dialog */}
      <Dialog
        open={reassignConfirmOpen}
        onClose={handleCancelReassign}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: 375,
            width: 'calc(100% - 32px)',
            mx: 'auto'
          }
        }}
      >
        <DialogTitle component="div">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SwapHoriz color="secondary" />
            <Typography component="h2" variant="h6">
              Confirm Reassignment
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {reassignSelectedStudents.length === 1 && (
            <>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Are you sure you want to reassign this observation?
              </Typography>
              <Box sx={{
                p: 2,
                backgroundColor: '#f8fafc',
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                mb: 2
              }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>From:</strong> {student?.name || student?.displayName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Unknown Student'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>To:</strong> {reassignToStudentName}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{
                fontStyle: 'italic',
                backgroundColor: '#f8fafc',
                padding: 2,
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                mb: 2
              }}>
                {(() => {
                  const previewSource = observation?.type === 'lesson'
                    ? (observation?.lessonTitle || 'Lesson Note')
                    : (observation?.text || '');
                  if (!previewSource) return 'No preview available';
                  return `"${previewSource.substring(0, 100)}${previewSource.length > 100 ? '...' : ''}"`;
                })()}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button 
            onClick={handleCancelReassign} 
            variant="outlined" 
            sx={{ flex: 1 }}
            disabled={reassigning}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmReassign} 
            variant="contained" 
            color="secondary"
            sx={{ flex: 1 }}
            disabled={reassigning}
            startIcon={reassigning ? <CircularProgress size={16} /> : <SwapHoriz />}
          >
            {reassigning ? 'Reassigning...' : 'Reassign'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default NoteExpansionDialog;
