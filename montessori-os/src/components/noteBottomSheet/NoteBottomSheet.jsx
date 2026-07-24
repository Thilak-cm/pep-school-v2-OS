import React, { useState } from 'react';
import {
  Box,
  Typography,
  SwipeableDrawer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
} from '@mui/material';
import { ArrowLeftRight as SwapHoriz } from '../../icons';
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
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../../firebase';
import useNotify from '../../notifications/useNotify.js';
import {
  AUTHOR_ACTION_EXPIRED_MESSAGE,
  canDeleteObservation,
  canEditObservation,
  canReassignObservation,
  isAuthorActionExpired,
  isObservationAuthor,
} from '../../utils/observationPermissions';
import { isAdminRole } from '../../utils/roleUtils';
import { getTeacherForNote } from '../classroomTimelineUtils.js';
import ClassroomStudentPicker from '../ClassroomStudentPicker';
import LessonNoteTagDialog from '../LessonNoteTagDialog';
import { reportCaughtError } from '../../utils/reportCaughtError.js';
import { TransferredChip } from '../ui';

import SharedHeader from './SharedHeader';
import TextContent from './TextContent';
import VoiceContent from './VoiceContent';
import LessonContent from './LessonContent';
import MediaContent from './MediaContent';
import ActionButtons from './ActionButtons';
import useMediaPreview from './useMediaPreview';

const normalizeLinkedIds = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
};

export default function NoteBottomSheet({
  open,
  onClose,
  observation,
  student,
  currentUser,
  userRole,
  onNavigateToStudent,
  isClassroomContext = false,
  // Media-specific props
  mediaUrl,
  carouselList,
  carouselIndex,
  onCarouselNavigate,
  classroomTeachers = [],
}) {
  const notify = useNotify();

  // ----- Edit state -----
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);

  // ----- Reassignment state -----
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignConfirmOpen, setReassignConfirmOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [reassignSelectedStudents, setReassignSelectedStudents] = useState([]);
  const [reassignToStudentName, setReassignToStudentName] = useState('');

  // ----- Linked lesson state -----
  const [linkedLessonObservationIds, setLinkedLessonObservationIds] = useState(
    normalizeLinkedIds(observation?.linkedLessonObservationId)
  );

  // ----- Previous classroom -----
  const [previousClassroomName, setPreviousClassroomName] = useState(null);
  const [currentClassroomName, setCurrentClassroomName] = useState(null);

  // ----- Lesson tag dialog -----
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [lessonNotes, setLessonNotes] = useState([]);
  const [lessonNotesLoading, setLessonNotesLoading] = useState(false);
  const [lessonNotesError, setLessonNotesError] = useState('');
  const [lessonSearch, setLessonSearch] = useState('');
  const [tagStudentName, setTagStudentName] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);

  // ----- Media hook -----
  const media = useMediaPreview(observation, currentUser, notify);

  // ----- Derived permissions -----
  const isLessonObservation = observation?.type === 'lesson';
  const isMedia = observation?.type === 'media';
  const canEditCurrent = canEditObservation(observation, currentUser, userRole);
  const canDeleteCurrent = canDeleteObservation(observation, currentUser, userRole);
  const canReassignCurrent = canReassignObservation(observation, currentUser, userRole);
  const isCurrentAuthor = isObservationAuthor(observation, currentUser);
  const authorActionsExpired = isAuthorActionExpired(observation, currentUser, userRole);
  const canManageAuthorActions = isAdminRole(userRole) || isCurrentAuthor;

  const teacher = observation ? getTeacherForNote(observation, classroomTeachers) : null;
  const teacherName = teacher?.displayName || observation?.createdByName || observation?.createdByEmail || 'Unknown Teacher';

  const getPermissionErrorMessage = () => (
    authorActionsExpired ? AUTHOR_ACTION_EXPIRED_MESSAGE : 'You do not have permission to modify this note.'
  );

  // ===== Effects =====

  // Notify App to hide FAB when drawer is open
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('noteDrawerToggle', { detail: { open } }));
  }, [open]);

  // Reset on open
  React.useEffect(() => {
    if (open && observation) {
      setEditText(observation.type === 'lesson' ? '' : (observation.text || ''));
      setEditing(false);
      setLinkedLessonObservationIds(normalizeLinkedIds(observation?.linkedLessonObservationId));
    }
  }, [open, observation]);

  // Previous classroom check
  React.useEffect(() => {
    const check = async () => {
      if (!observation || !student || !open) { setPreviousClassroomName(null); return; }
      const normalizeId = (id) => {
        if (!id) return null;
        if (typeof id === 'string') return id.includes('/') ? id.split('/').pop() : id;
        if (typeof id === 'object' && id.id) return id.id;
        return id;
      };
      const noteId = normalizeId(observation.classroomId);
      const studentId = normalizeId(student.classroomId);
      if (noteId && studentId && noteId !== studentId) {
        try {
          const snap = await getDoc(doc(db, 'classrooms', noteId));
          setPreviousClassroomName(snap.exists() ? (snap.data().name || noteId) : noteId);
        } catch { setPreviousClassroomName(noteId); }
        try {
          const cSnap = await getDoc(doc(db, 'classrooms', studentId));
          setCurrentClassroomName(cSnap.exists() ? (cSnap.data().name || studentId) : studentId);
        } catch { setCurrentClassroomName(studentId); }
      } else { setPreviousClassroomName(null); setCurrentClassroomName(null); }
    };
    check();
  }, [observation, student, open]);

  // Sync linked lesson IDs
  React.useEffect(() => {
    setLinkedLessonObservationIds(normalizeLinkedIds(observation?.linkedLessonObservationId));
  }, [observation?.linkedLessonObservationId]);

  // Fetch reassign target name
  React.useEffect(() => {
    const load = async () => {
      const selId = reassignSelectedStudents[0];
      if (!reassignConfirmOpen || !selId) return;
      try {
        const snap = await getDoc(doc(db, 'students', selId));
        const data = snap.data() || {};
        setReassignToStudentName(data.name || data.displayName || [data.firstName, data.lastName].filter(Boolean).join(' ') || 'Selected student');
      } catch { setReassignToStudentName('Selected student'); }
    };
    load();
  }, [reassignConfirmOpen, reassignSelectedStudents]);

  // ===== Handlers =====

  const handleClose = () => {
    onClose();
    setEditing(false);
    setEditText('');
    setReassignDialogOpen(false);
    setReassignConfirmOpen(false);
    setReassignSelectedStudents([]);
  };

  // -- Edit --
  const handleEditClick = () => {
    if (isLessonObservation) {
      handleEditLessonNavigate();
      return;
    }
    if (isMedia) {
      if (!canEditCurrent) { notify.error(getPermissionErrorMessage()); return; }
      media.startEditing();
      return;
    }
    if (!canEditCurrent) { notify.error(getPermissionErrorMessage()); return; }
    setEditText(observation.text || '');
    setEditing(true);
  };

  const handleEditSave = async () => {
    if (!observation || isLessonObservation || !editText.trim()) return;
    if (!canEditCurrent) { notify.error(getPermissionErrorMessage()); return; }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'students', observation.studentId, 'observations', observation.id), {
        text: editText.trim(),
        editCount: (observation.editCount || 0) + 1,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp(),
      });
      setEditing(false);
      setEditText('');
      notify.success('Note updated successfully');
    } catch { notify.error('Error saving changes. Please try again.'); }
    finally { setSaving(false); }
  };

  const handleEditCancel = () => { setEditing(false); setEditText(''); };

  // -- Lesson navigate edit --
  const handleEditLessonNavigate = () => {
    if (!observation || observation.type !== 'lesson') return;
    if (!canEditCurrent) { notify.error(getPermissionErrorMessage()); return; }
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
    } catch (e) { reportCaughtError(e, 'NoteBottomSheet', 'lesson navigate'); }
    handleClose();
  };

  // -- Delete --
  const handleDeleteClick = () => {
    if (!canDeleteCurrent) { notify.error(getPermissionErrorMessage()); return; }
    if (window.confirm('Are you sure you want to delete this observation note? This action cannot be undone.')) {
      handleDeleteConfirm();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!observation || !canDeleteCurrent) return;
    const obs = observation;
    handleClose();
    const notifId = `delete-${obs.id}`;
    notify.info('Deleting note…', {
      id: notifId,
      actionLabel: 'Undo',
      onFinalize: async () => {
        try {
          const parentId = obs.parentStudentId || obs.studentId;
          // #221: all note types (including media) now in observations subcollection
          await deleteDoc(doc(db, 'students', parentId, 'observations', obs.id));
          notify.success('Note deleted successfully', { id: notifId, duration: 2500 });
        } catch { notify.error('Error deleting note. Please try again.', { id: notifId, duration: 3500 }); }
      },
      onUndo: () => { notify.success('Undo Note Deletion Successful', { id: `${notifId}-undo`, duration: 2000 }); },
      duration: 6000,
      variant: 'warning',
    });
  };

  // -- Reassign --
  const handleReassignClick = () => { setReassignSelectedStudents([]); setReassignDialogOpen(true); };
  const handleReassignCancel = () => { setReassignDialogOpen(false); setReassignSelectedStudents([]); };
  const handleReassignNext = () => {
    if (reassignSelectedStudents.length !== 1) return;
    if (reassignSelectedStudents[0] === observation?.studentId) { alert('Cannot reassign a note to the same student.'); return; }
    setReassignDialogOpen(false);
    setReassignConfirmOpen(true);
  };

  const handleConfirmReassign = async () => {
    if (!observation || reassignSelectedStudents.length !== 1) return;
    try {
      setReassigning(true);
      const newStudentId = reassignSelectedStudents[0];
      const oldParentId = observation.parentStudentId || observation.studentId;
      // #221: all note types (including media) now in observations subcollection
      const srcRef = doc(db, 'students', oldParentId, 'observations', observation.id);
      const srcSnap = await getDoc(srcRef);
      if (!srcSnap.exists()) throw new Error('Source observation not found');
      const srcData = srcSnap.data() || {};
      let targetClassroomId = srcData.classroomId;
      try {
        const targetStuSnap = await getDoc(doc(db, 'students', newStudentId));
        targetClassroomId = targetStuSnap.data()?.classroomId || targetClassroomId;
      } catch (e) { reportCaughtError(e, 'NoteBottomSheet', 'reassign target classroom'); }
      const destRef = doc(db, 'students', newStudentId, 'observations', observation.id);
      await setDoc(destRef, { ...srcData, studentId: newStudentId, classroomId: targetClassroomId, updatedAt: serverTimestamp(), lastEditedBy: currentUser.uid, lastEditedAt: serverTimestamp() });
      await deleteDoc(srcRef);
      setReassignConfirmOpen(false);
      handleClose();
      notify.success(reassignToStudentName ? `Note reassigned to ${reassignToStudentName}` : 'Note reassigned', {
        duration: 6000, id: `reassign-${observation.id}`, actionLabel: 'View Note',
        onUndo: () => {
          try { window.dispatchEvent(new CustomEvent('navigateToStudentNotes', { detail: { studentId: newStudentId, noteTypeFilter: observation?.type === 'lesson' ? 'lesson' : 'textVoice' } })); }
          catch (e) { reportCaughtError(e, 'NoteBottomSheet', 'reassign view note'); }
        },
      });
    } catch { notify.error('Error reassigning note. Please try again.', { id: `reassign-${observation?.id || 'unknown'}` }); }
    finally { setReassigning(false); }
  };

  // -- View student timeline --
  const handleViewStudentTimeline = () => {
    if (student?.id) {
      try {
        window.dispatchEvent(new CustomEvent('navigateToStudentNotes', {
          detail: { studentId: student.id, student, noteTypeFilter: observation?.type === 'lesson' ? 'lesson' : 'textVoice' }
        }));
      } catch (e) { reportCaughtError(e, 'NoteBottomSheet', 'view student timeline'); }
      handleClose();
    } else if (onNavigateToStudent && student) {
      onNavigateToStudent(student);
      handleClose();
    }
  };

  // -- Lesson tag editing --
  const toDate = (ts) => { if (!ts) return null; if (ts.toDate) return ts.toDate(); if (ts.seconds) return new Date(ts.seconds * 1000); return null; };

  const loadLessonNotesForStudent = async (studentId) => {
    if (!studentId) return;
    try {
      setLessonNotesLoading(true); setLessonNotesError('');
      let name = student?.name || student?.displayName || [student?.firstName, student?.lastName].filter(Boolean).join(' ');
      if (!name) { try { const snap = await getDoc(doc(db, 'students', studentId)); const d = snap.data() || {}; name = d.name || d.displayName || [d.firstName, d.lastName].filter(Boolean).join(' '); } catch (e) { reportCaughtError(e, 'NoteBottomSheet', 'load student name'); } }
      setTagStudentName(name || '');
      const q = query(collection(db, 'students', studentId, 'observations'), where('type', '==', 'lesson'), limit(25));
      const snap = await getDocs(q);
      const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notes.sort((a, b) => { const da = toDate(a.observedAt || a.createdAt) || new Date(0); const dbDate = toDate(b.observedAt || b.createdAt) || new Date(0); return dbDate - da; });
      setLessonNotes(notes);
    } catch { setLessonNotesError('Unable to load lesson notes. Try again.'); }
    finally { setLessonNotesLoading(false); }
  };

  const handleOpenTagDialog = async () => {
    if (!observation || isLessonObservation) return;
    if (!canEditCurrent) { notify.error(getPermissionErrorMessage()); return; }
    const studentId = observation.parentStudentId || observation.studentId;
    if (!studentId) { notify.info('Unable to edit tagged lesson: missing student.'); return; }
    setLessonSearch(''); setTagDialogOpen(true);
    await loadLessonNotesForStudent(studentId);
  };

  const handleSelectLessonTag = async (nextIds) => {
    if (!observation) return;
    const studentId = observation.parentStudentId || observation.studentId;
    if (!studentId) return;
    const currentIds = normalizeLinkedIds(linkedLessonObservationIds);
    const desiredIds = normalizeLinkedIds(nextIds);
    if (currentIds.length === desiredIds.length && currentIds.every((id) => desiredIds.includes(id))) { setTagDialogOpen(false); return; }
    const added = desiredIds.filter((id) => !currentIds.includes(id));
    const removed = currentIds.filter((id) => !desiredIds.includes(id));
    try {
      setLinkSaving(true);
      const obsRef = doc(db, 'students', studentId, 'observations', observation.id);
      await updateDoc(obsRef, { linkedLessonObservationId: desiredIds, updatedAt: serverTimestamp(), lastEditedBy: currentUser.uid, lastEditedAt: serverTimestamp() });
      await Promise.all(added.map(async (lessonId) => { try { await updateDoc(doc(db, 'students', studentId, 'observations', lessonId), { linkedObservations: arrayUnion(observation.id) }); } catch (e) { reportCaughtError(e, 'NoteBottomSheet', 'add backlink'); } }));
      await Promise.all(removed.map(async (lessonId) => { try { await updateDoc(doc(db, 'students', studentId, 'observations', lessonId), { linkedObservations: arrayRemove(observation.id) }); } catch (e) { reportCaughtError(e, 'NoteBottomSheet', 'remove backlink'); } }));
      setLinkedLessonObservationIds(desiredIds);
      notify.success(desiredIds.length > 0 ? 'Tagged lesson notes updated' : 'Tagged lesson notes cleared');
      setTagDialogOpen(false);
    } catch { notify.error('Error updating tagged lesson note. Please try again.'); }
    finally { setLinkSaving(false); }
  };

  return (
    <>
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={handleClose}
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
          }
        }}
      >
        {/* Drag handle */}
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
          <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'var(--color-border)' }} />
        </Box>

        {observation && <>
        {/* Header */}
        <SharedHeader
          observation={observation}
          student={student}
          teacherName={teacherName}
          isFormerTeacher={teacher?.status === 'inactive'}
          onClose={handleClose}
        />

        {/* Scrollable content */}
        <Box sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', px: 2.5, pb: 1 }}>
          {/* Previous classroom warning */}
          {previousClassroomName && (
            <TransferredChip
              variant="banner"
              fromClassroomName={previousClassroomName}
              toClassroomName={currentClassroomName}
              studentName={student?.name || student?.displayName}
            />
          )}

          {/* Open question answer chip — full text in expanded view (#144) */}
          {observation.openQuestion?.questionText && (
            <Box sx={{
              display: 'flex', alignItems: 'flex-start', gap: 1,
              px: 1.5, py: 1, mb: 1, borderRadius: 2,
              backgroundColor: 'rgba(79, 70, 229, 0.06)',
              border: '1px solid rgba(79, 70, 229, 0.15)',
            }}>
              <Typography sx={{ fontSize: '0.78rem', color: 'var(--color-primary)', fontWeight: 600, lineHeight: 1.4 }}>
                Answers: <span style={{ fontWeight: 400, fontStyle: 'italic' }}>{observation.openQuestion.questionText}</span>
              </Typography>
            </Box>
          )}

          {/* Type-specific content */}
          {observation.type === 'voice' ? (
            <VoiceContent
              observation={observation}
              editing={editing}
              editText={editText}
              onEditTextChange={setEditText}
            />
          ) : observation.type === 'lesson' ? (
            <LessonContent observation={observation} />
          ) : isMedia ? (
            <MediaContent
              observation={observation}
              mediaUrl={mediaUrl}
              mediaImageLoaded={media.mediaImageLoaded}
              onImageLoaded={() => media.setMediaImageLoaded(true)}
              carouselList={carouselList}
              carouselIndex={carouselIndex}
              onCarouselNavigate={onCarouselNavigate}
              mediaEditMode={media.mediaEditMode}
              mediaEditComment={media.mediaEditComment}
              onEditCommentChange={media.setMediaEditComment}
              mediaEditSaving={media.mediaEditSaving}
              onCancelEdit={media.cancelEditing}
              onSaveComment={media.saveComment}
              canEdit={canEditCurrent}
            />
          ) : (
            <TextContent
              observation={observation}
              editing={editing}
              editText={editText}
              onEditTextChange={setEditText}
            />
          )}
        </Box>

        {/* Action buttons */}
        <ActionButtons
          observation={observation}
          isClassroomContext={isClassroomContext}
          canManageAuthorActions={canManageAuthorActions}
          canEdit={canEditCurrent}
          canDelete={canDeleteCurrent}
          canReassign={canReassignCurrent}
          authorActionsExpired={authorActionsExpired}
          isLessonObservation={isLessonObservation}
          editing={editing || media.mediaEditMode}
          saving={saving || media.mediaEditSaving}
          editText={editText || media.mediaEditComment}
          onEditClick={handleEditClick}
          onEditSave={isMedia ? media.saveComment : handleEditSave}
          onEditCancel={isMedia ? media.cancelEditing : handleEditCancel}
          onDeleteClick={handleDeleteClick}
          onReassignClick={handleReassignClick}
          onViewStudentTimeline={handleViewStudentTimeline}
          onEditTaggedLessons={handleOpenTagDialog}
          hasLinkedLessons={(linkedLessonObservationIds || []).length > 0}
          linkSaving={linkSaving}
          student={student}
        />
        </>}
      </SwipeableDrawer>

      {/* Lesson tag dialog */}
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
        onApply={handleSelectLessonTag}
      />

      {/* Reassign student picker dialog */}
      <Dialog
        open={reassignDialogOpen}
        onClose={handleReassignCancel}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, maxWidth: 500, width: 'calc(100% - 32px)', mx: 'auto', maxHeight: '90vh' } }}
      >
        <DialogTitle component="div" sx={{ pb: 2 }}>
          <Typography component="h2" variant="h6">Reassign Note to Student</Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Select a student to reassign this observation to:
          </Typography>
          <ClassroomStudentPicker
            selectedStudents={reassignSelectedStudents}
            onStudentsChange={(ids) => setReassignSelectedStudents(ids)}
            currentUser={currentUser}
            userRole={userRole}
            disabledStudentIds={[observation?.studentId].filter(Boolean)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button onClick={handleReassignCancel} variant="outlined" sx={{ flex: 1 }}>Cancel</Button>
          <Button onClick={handleReassignNext} variant="contained" color="primary" sx={{ flex: 1 }} disabled={reassignSelectedStudents.length !== 1}>Next</Button>
        </DialogActions>
      </Dialog>

      {/* Reassign confirmation dialog */}
      <Dialog
        open={reassignConfirmOpen}
        onClose={() => { setReassignConfirmOpen(false); setReassignSelectedStudents([]); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, maxWidth: 375, width: 'calc(100% - 32px)', mx: 'auto' } }}
      >
        <DialogTitle component="div">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SwapHoriz style={{ color: 'var(--color-secondary)' }} />
            <Typography component="h2" variant="h6">Confirm Reassignment</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {reassignSelectedStudents.length === 1 && (
            <>
              <Typography variant="body1" sx={{ mb: 2 }}>Are you sure you want to reassign this observation?</Typography>
              <Box sx={{ p: 2, backgroundColor: 'var(--color-bg)', borderRadius: 2, border: '1px solid var(--color-border)', mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>From:</strong> {student?.name || student?.displayName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Unknown Student'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>To:</strong> {reassignToStudentName}
                </Typography>
              </Box>
              {isMedia && mediaUrl ? (
                <Box sx={{ backgroundColor: 'var(--color-bg)', borderRadius: 2, border: '1px solid var(--color-border)', mb: 2, overflow: 'hidden' }}>
                  {observation?.mediaKind === 'photo' ? (
                    <img src={mediaUrl} alt="Media preview" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
                  ) : observation?.mediaKind === 'video' ? (
                    <video src={mediaUrl} style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <Typography variant="body2" sx={{ fontStyle: 'italic', p: 2 }}>PDF document</Typography>
                  )}
                </Box>
              ) : (
                <Typography variant="body2" sx={{ fontStyle: 'italic', backgroundColor: 'var(--color-bg)', padding: 2, borderRadius: 2, border: '1px solid var(--color-border)', mb: 2 }}>
                  {(() => {
                    const src = observation?.type === 'lesson' ? (observation?.lessonTitle || 'Lesson Note') : (observation?.text || '');
                    if (!src) return 'No preview available';
                    return `"${src.substring(0, 100)}${src.length > 100 ? '...' : ''}"`;
                  })()}
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button onClick={() => { setReassignConfirmOpen(false); setReassignSelectedStudents([]); }} variant="outlined" sx={{ flex: 1 }} disabled={reassigning}>Cancel</Button>
          <Button onClick={handleConfirmReassign} variant="contained" color="secondary" sx={{ flex: 1 }} disabled={reassigning} startIcon={reassigning ? <CircularProgress size={16} /> : <SwapHoriz />}>
            {reassigning ? 'Reassigning...' : 'Reassign'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
