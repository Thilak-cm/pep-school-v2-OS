import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { reportCaughtError } from '../../utils/reportCaughtError.js';

/**
 * Custom hook encapsulating media preview edit state.
 * Extracted from StudentTimeline to be reused in NoteBottomSheet.
 */
export default function useMediaPreview(observation, currentUser, notify) {
  const [mediaEditMode, setMediaEditMode] = useState(false);
  const [mediaEditComment, setMediaEditComment] = useState('');
  const [mediaEditSaving, setMediaEditSaving] = useState(false);
  const [mediaImageLoaded, setMediaImageLoaded] = useState(false);

  // Reset on observation change
  useEffect(() => {
    setMediaEditMode(false);
    setMediaEditComment(observation?.teacherComment || '');
    setMediaEditSaving(false);
    setMediaImageLoaded(false);
  }, [observation?.id]);

  const startEditing = () => {
    setMediaEditMode(true);
    setMediaEditComment(observation?.teacherComment || '');
  };

  const cancelEditing = () => {
    setMediaEditMode(false);
    setMediaEditComment(observation?.teacherComment || '');
  };

  const saveComment = async () => {
    if (!observation || !currentUser) return;
    try {
      setMediaEditSaving(true);
      const parentId = observation.parentStudentId || observation.studentId;
      if (!parentId) throw new Error('Missing student ID');
      const obsRef = doc(db, 'students', parentId, 'media', observation.id);
      await updateDoc(obsRef, {
        teacherComment: mediaEditComment.trim(),
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp(),
      });
      setMediaEditMode(false);
      notify?.success('Comment updated');
    } catch (e) {
      reportCaughtError(e, 'useMediaPreview', 'saveComment');
      notify?.error('Error saving comment. Please try again.');
    } finally {
      setMediaEditSaving(false);
    }
  };

  return {
    mediaEditMode,
    mediaEditComment,
    setMediaEditComment,
    mediaEditSaving,
    mediaImageLoaded,
    setMediaImageLoaded,
    startEditing,
    cancelEditing,
    saveComment,
  };
}
