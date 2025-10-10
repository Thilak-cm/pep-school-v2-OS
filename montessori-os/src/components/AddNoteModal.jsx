import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Button,
  TextField,
  Snackbar,
  Alert,
  Tooltip
} from '@mui/material';
import {
  Close,
  KeyboardVoice,
  TextFields,
  AutoFixHigh,
  ArrowBack
} from '@mui/icons-material';
import VoiceRecorder from '../VoiceRecorder';
import NewFeaturePill from './NewFeaturePill';
import { cleanUpText, localCleanupFallback } from '../textCleanup';
import { trackEvent, lengthBucket } from '../utils/analytics';
import ClassroomStudentPicker from './ClassroomStudentPicker';
import { collection, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify.js';

// TextInput Component
function TextInput({ onSave, onNext, onBack, onDirtyChange }) {
  const [text, setText] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [cleaning, setCleaning] = useState(false);
  const [cleanedOnce, setCleanedOnce] = useState(false);
  const [prevText, setPrevText] = useState('');
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const pauseTimerRef = useRef(null);

  // Heuristic to detect "rough" text without being noisy
  const looksRough = (s) => {
    const trimmed = s.trim();
    if (trimmed.length < 24) return false; // avoid nudging for very short inputs
    const words = trimmed.split(/\s+/).length;
    const startsLower = /^(?:\s|\n)*[a-z]/.test(trimmed);
    const lacksPunct = !/[.!?]\s*$/.test(trimmed) && /\s/.test(trimmed);
    const manyCommas = (trimmed.match(/,/g) || []).length >= 3 && !/[.!?]/.test(trimmed);
    return words >= 5 && (startsLower || lacksPunct || manyCommas);
  };

  const handleTextChange = (event) => {
    const newText = event.target.value;
    setText(newText);
    setWordCount(newText.trim() ? newText.trim().split(/\s+/).length : 0);
    // Dirty if user has typed at least one character (even whitespace)
    if (onDirtyChange) onDirtyChange(newText.length > 0);
    // Debounced nudge that never interrupts typing
    clearTimeout(pauseTimerRef.current);
    if (nudgeDismissed || cleanedOnce) {
      setShowNudge(false);
      return;
    }
    pauseTimerRef.current = setTimeout(() => {
      setShowNudge(looksRough(newText));
    }, 1200);
  };

  const handleSave = () => {
    if (!text.trim()) {
      return;
    }
    onSave({ text: text.trim(), cleaned: cleanedOnce });
  };

  const handleCleanUp = async () => {
    if (!text.trim() || cleaning || cleanedOnce) return;
    try {
      // Count click attempt
      trackEvent('polish_click', {
        source: 'text',
        component: 'AddNoteModal.TextInput',
        length_bucket: lengthBucket(text.length),
      });

      const t0 = performance.now();
      setCleaning(true);
      setPrevText(text);
      const refined = await cleanUpText(text).catch(() => null);
      const out = (refined || localCleanupFallback(text)).trim();
      setText(out);
      setCleanedOnce(true);
      setShowNudge(false);
      setNudgeDismissed(true);
      const dt = Math.round(performance.now() - t0);
      trackEvent('polish_success', {
        source: 'text',
        component: 'AddNoteModal.TextInput',
        length_bucket: lengthBucket(text.length),
        latency_ms: dt,
      });
    } catch (e) {
      console.error('Cleanup error:', e);
      setText(localCleanupFallback(text));
      trackEvent('polish_error', {
        source: 'text',
        component: 'AddNoteModal.TextInput',
        length_bucket: lengthBucket(text.length),
        error: 'cleanup_failed',
      });
    } finally {
      setCleaning(false);
    }
  };

  const handleUndoClean = () => {
    if (!prevText) return;
    setText(prevText);
    setPrevText('');
    setCleanedOnce(false);
    trackEvent('polish_undo', {
      source: 'text',
      component: 'AddNoteModal.TextInput',
      length_bucket: lengthBucket(prevText.length),
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header row: back button on the left, title centered */}
      <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 1 }}>
        <IconButton
          aria-label="Go back"
          onClick={onBack}
          sx={{
            position: 'absolute',
            left: -8,
            color: '#64748b',
            '&:hover': { backgroundColor: 'rgba(100, 116, 139, 0.08)' }
          }}
        >
          <ArrowBack />
        </IconButton>
        <Typography variant="h6" sx={{ textAlign: 'center' }}>
          Write your observation
        </Typography>
      </Box>
      
      <Box sx={{ position: 'relative' }}>
        <TextField
          multiline
          rows={6}
          fullWidth
          value={text}
          onChange={handleTextChange}
          placeholder="Enter your observation here..."
          variant="outlined"
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
            }
          }}
        />
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            bottom: 10,
            right: 12,
            color: 'text.disabled',
            pointerEvents: 'none'
          }}
        >
          {wordCount} word{wordCount !== 1 ? 's' : ''}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
        Rough notes are okay — AI will polish for you.
      </Typography>
      {!text.trim() && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
          Please enter some text to continue
        </Typography>
      )}

      {/* Gentle, non-blocking nudge after user pauses typing */}
      {showNudge && !nudgeDismissed && !cleanedOnce && (
        <Alert 
          severity="info" 
          variant="outlined" 
          sx={{ mt: -0.5 }}
          onClose={() => { setNudgeDismissed(true); setShowNudge(false); }}
        >
          Looks a bit rough. Want to polish with AI?
          <Button size="small" onClick={handleCleanUp} sx={{ ml: 1 }}>
            Polish now
          </Button>
        </Alert>
      )}
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          variant="text" 
          onClick={onBack}
          sx={{ color: '#64748b' }}
        >
          Back
        </Button>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tooltip title={cleanedOnce ? 'Already polished' : 'Polish with AI: grammar, tone, and structure — no length changes'}>
            <span>
              <Button
                variant="contained"
                onClick={handleCleanUp}
                disabled={!text.trim() || cleaning || cleanedOnce}
                startIcon={cleaning ? <CircularProgress size={16} color="inherit" /> : <AutoFixHigh />}
                sx={{
                  textTransform: 'none',
                  backgroundImage: 'linear-gradient(90deg, #7c3aed, #db2777)',
                  color: 'white',
                  boxShadow: '0 6px 14px rgba(124, 58, 237, 0.35)',
                  '&:hover': {
                    backgroundImage: 'linear-gradient(90deg, #6d28d9, #be185d)',
                    boxShadow: '0 8px 18px rgba(190, 24, 93, 0.35)'
                  },
                  '&.Mui-disabled': {
                    backgroundImage: 'none',
                    backgroundColor: '#e2e8f0',
                    color: '#64748b',
                    boxShadow: 'none'
                  }
                }}
              >
                {cleanedOnce ? 'Polished' : (cleaning ? 'Polishing…' : 'Polish with AI')}
              </Button>
            </span>
          </Tooltip>
          {cleanedOnce && prevText && (
            <Button variant="text" onClick={handleUndoClean} sx={{ color: '#64748b' }}>
              Undo
            </Button>
          )}
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!text.trim()}
            sx={{
              backgroundColor: text.trim() ? '#4f46e5' : '#cbd5e1',
              '&:hover': { 
                backgroundColor: text.trim() ? '#4338ca' : '#cbd5e1'
              }
            }}
          >
            Next
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

const STEP_NOTE_TYPE = 'noteType';
const STEP_RECORD = 'record';
const STEP_TEXT_INPUT = 'textInput';
const STEP_RECIPIENTS = 'recipients';

function AddNoteModal({
  open,
  onClose,
  initialClassrooms = [],
  initialStudents = [],
  currentUser,
  userRole
}) {
  const notify = useNotify();
  const [step, setStep] = useState(STEP_NOTE_TYPE);
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [textData, setTextData] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState(initialStudents);
  const [saving, setSaving] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  // Dirty tracking across steps
  const [textDirty, setTextDirty] = useState(false); // any input (even whitespace)
  const [voiceDirty, setVoiceDirty] = useState(false); // recording started or any audio/transcript present
  const [confirmOpen, setConfirmOpen] = useState(false);
  const voiceControlsRef = useRef(null); // controls exposed by VoiceRecorder
  // no confirm-level voice notice; message shown inline in VoiceRecorder panel only

  // Update selectedStudents when initialStudents prop changes
  useEffect(() => {
    setSelectedStudents(initialStudents);
  }, [initialStudents]);

  const handleClose = () => {
    setStep(STEP_NOTE_TYPE);
    // Reset all state when closing
    setTranscriptionData(null);
    setTextData(null);
    setSelectedStudents(initialStudents);
    setSaving(false);
    setSnackbarOpen(false);
    setSnackbarMessage('');
    onClose();
  };

  // Derive if the modal has unsaved work
  const hasUnsavedWork = () => {
    if (step === STEP_NOTE_TYPE) return false; // silent close for window 1
    if (step === STEP_TEXT_INPUT) return textDirty;
    if (step === STEP_RECORD) return voiceDirty;
    if (step === STEP_RECIPIENTS) {
      return (
        selectedStudents.length > 0 ||
        !!textData || !!transcriptionData ||
        textDirty || voiceDirty
      );
    }
    return false;
  };

  // Guard against accidental page unload when there is unsaved work
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasUnsavedWork() || saving || !open) return;
      e.preventDefault();
      e.returnValue = '';
    };
    if (open) {
      window.addEventListener('beforeunload', onBeforeUnload);
      return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }
  }, [open, step, textDirty, voiceDirty, selectedStudents, textData, transcriptionData, saving]);

  const pauseVoiceIfRecording = () => {
    try {
      const c = voiceControlsRef.current;
      if (c && typeof c.pauseIfRecording === 'function') c.pauseIfRecording();
    } catch (_) { /* no-op */ }
  };

  const cancelVoiceIfNeeded = () => {
    try {
      const c = voiceControlsRef.current;
      if (c && typeof c.cancelRecording === 'function') c.cancelRecording();
    } catch (_) { /* no-op */ }
  };

  // Centralized close request handler (backdrop, ESC, X, back buttons)
  const requestClose = (reason) => {
    if (saving) return; // disable closing while saving
    const dirty = hasUnsavedWork();
    if (!dirty) {
      handleClose();
      return;
    }
    // If dirty, pause voice if currently recording and show confirm
    let shouldShowVoicePaused = false;
    if (step === STEP_RECORD && voiceControlsRef.current && typeof voiceControlsRef.current.getState === 'function') {
      try {
        const st = voiceControlsRef.current.getState();
        shouldShowVoicePaused = !!st?.isRecording;
      } catch (_) { /* no-op */ }
    }
    if (shouldShowVoicePaused) {
      try {
        if (voiceControlsRef.current && typeof voiceControlsRef.current.pauseForExit === 'function') {
          voiceControlsRef.current.pauseForExit();
        } else {
          pauseVoiceIfRecording();
        }
      } catch (_) { /* no-op */ }
    }
    setConfirmOpen(true);
  };

  const handleConfirmDiscard = () => {
    // Cancel any in-progress recording and close
    cancelVoiceIfNeeded();
    setConfirmOpen(false);
    handleClose();
  };

  const handleKeepEditing = () => {
    setConfirmOpen(false);
    // Intentionally do not auto-resume recording; user can press Resume
  };

  const handleSelectVoice = () => {
    setStep(STEP_RECORD);
  };

  const handleSelectText = () => {
    setStep(STEP_TEXT_INPUT);
  };

  const handleVoiceSave = (transcriptionData) => {
    setTranscriptionData(transcriptionData);
    setStep(STEP_RECIPIENTS);
  };

  const handleTextSave = (textData) => {
    setTextData(textData);
    setStep(STEP_RECIPIENTS);
  };

  const handleRecipientsNext = async () => {
    const noteData = transcriptionData || textData;
    if (!noteData) {
      notify.warning('No note data available. Please try again.');
      return;
    }

    try {
      setSaving(true);
      const promises = selectedStudents.map(async (stuId) => {
        // Get student data to find classroomId
        const studentDocRef = doc(db, 'students', stuId);
        const studentDocSnap = await getDoc(studentDocRef);
        const studentData = studentDocSnap.data();

        const observationData = {
          // Identity
          studentId: stuId,
          classroomId: studentData?.classroomId || 'unknown',

          // Content
          type: transcriptionData ? 'voice' : 'text',
          text: noteData.text,
          tags: [],

          // Timestamps
          observedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),

          // Creator
          createdBy: currentUser?.uid || 'unknown',
          createdByName: currentUser?.displayName || 'Unknown Teacher',
          createdByEmail: currentUser?.email || 'unknown@email.com',

          // Misc
          editCount: 0,
        };

        // Voice-specific fields (only add if defined to avoid Firestore 'undefined' errors)
        if (transcriptionData) {
          if (typeof transcriptionData.duration === 'number') {
            observationData.duration = transcriptionData.duration;
          }
          if (typeof transcriptionData.sttConfidence === 'number') {
            observationData.sttConfidence = transcriptionData.sttConfidence;
          }
          if (Array.isArray(transcriptionData.sttAlternatives) && transcriptionData.sttAlternatives.length > 0) {
            observationData.sttAlternatives = transcriptionData.sttAlternatives;
          }
          // Language fields removed to reduce user clicks
          // Track STT provider for debugging/analytics
          observationData.sttProvider = transcriptionData.sttProvider || 'OpenAI Whisper';
        }

        // No default spoken language for text notes

        // Prune undefined values defensively before writing to Firestore
        const cleanedObservationData = Object.fromEntries(
          Object.entries(observationData).filter(([, value]) => value !== undefined)
        );

        // Debug log for troubleshooting schema issues
        console.debug('[save] observation payload', cleanedObservationData);

        // Write to per-student subcollection
        await addDoc(collection(db, 'students', stuId, 'observations'), cleanedObservationData);
      });
      await Promise.all(promises);
      // Success notification with quick navigation to the student's Notes page
      const firstStudentId = selectedStudents && selectedStudents.length > 0 ? selectedStudents[0] : null;
      notify.success('Note created successfully!', {
        actionLabel: firstStudentId ? 'View Note' : undefined,
        onUndo: firstStudentId
          ? () => {
              try {
                window.dispatchEvent(new CustomEvent('navigateToStudentNotes', { detail: { studentId: firstStudentId } }));
              } catch (_) { /* noop */ }
              // Close modal immediately if user chooses to view
              handleClose();
            }
          : undefined,
      });
      // Close modal after a short delay to show the success message
      setTimeout(() => {
        handleClose();
      }, 1000);
    } catch (err) {
      console.error('save note error', err);
      notify.error('Error saving note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={(e, reason) => {
        // Intercept backdrop/ESC closes
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
          requestClose(reason);
        }
      }}
      fullWidth
      maxWidth="sm"
      scroll="body"
      PaperProps={{
        sx: {
          // Centered dialog on all viewports
          width: { xs: 'calc(100% - 32px)', sm: 560 },
          maxWidth: { xs: 560, sm: 560 },
          maxHeight: '90vh',
          margin: 'auto',
          borderRadius: 3,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }
      }}
      sx={{
        '& .MuiDialog-container': {
          alignItems: 'center',
          justifyContent: 'center',
          display: 'flex',
          padding: 0
        }
      }}
      >
        {/* Top actions */}
        <Box
          sx={{
            flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}
        >
          <IconButton
            aria-label="Close"
          onClick={() => requestClose('closeButton')}
            sx={{
              position: 'absolute',
              top: 16,
              right: 16,
              color: '#1e293b',
              '&:hover': { backgroundColor: '#f1f5f9' },
              zIndex: 2
            }}
          >
            <Close sx={{ fontSize: 28 }} />
          </IconButton>
        {step === STEP_NOTE_TYPE && (
          <Box
            sx={{
              position: 'relative',
              p: 3,
              pt: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              alignItems: 'center',
              minHeight: 'fit-content'
            }}
          >
            <Typography variant="h6" sx={{ mb: 1, mt: 0 }}>
              What type of note do you want to add?
            </Typography>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                width: '100%'
              }}
            >
              {/* Only two types for now: Text and Voice */}
              {/* Text Note (active) */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  border: '1px solid #e2e8f0',
                  borderRadius: 2,
                  p: 2,
                  width: '100%',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  '&:hover': { 
                    backgroundColor: '#f8fafc',
                    border: '1px solid #4f46e5'
                  }
                }}
                onClick={handleSelectText}
                aria-label="Add text note"
              >
                <TextFields sx={{ fontSize: 32, color: '#64748b' }} />
                <Box>
                  <Typography variant="body1" sx={{ color: '#1e293b' }}>
                    Text Note
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Write text note
                  </Typography>
                </Box>
              </Box>
              {/* Voice Note (active) */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  border: '1px solid #e2e8f0',
                  borderRadius: 2,
                  p: 2,
                  width: '100%',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  '&:hover': { 
                    backgroundColor: '#f8fafc',
                    border: '1px solid #4f46e5'
                  }
                }}
                onClick={handleSelectVoice}
                aria-label="Add voice note"
              >
                <KeyboardVoice sx={{ fontSize: 32, color: '#64748b' }} />
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body1" sx={{ color: '#1e293b' }}>
                      Voice Note
                    </Typography>
                    <NewFeaturePill 
                      label="Latest Feature: Pause and Resume an ongoing voice note!" 
                      size="sm" 
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Record audio note
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        )}

        {step === STEP_RECORD && (
          <Box sx={{ p: 3, flex: 1 }}>
            <VoiceRecorder 
              onSave={handleVoiceSave} 
              onNext={() => setStep(STEP_RECIPIENTS)}
              onBack={() => {
                // Back from voice: confirm if any recording progress exists
                if (voiceDirty) return requestClose('backFromVoice');
                setStep(STEP_NOTE_TYPE);
              }}
              onDirtyChange={setVoiceDirty}
              exposeControls={(controls) => { voiceControlsRef.current = controls; }}
            />
          </Box>
        )}

        {step === STEP_TEXT_INPUT && (
          <Box sx={{ p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <TextInput 
              onSave={handleTextSave} 
              onNext={() => setStep(STEP_RECIPIENTS)}
              onBack={() => {
                // Back from text: confirm if any input exists (even whitespace)
                if (textDirty) return requestClose('backFromText');
                setStep(STEP_NOTE_TYPE);
              }}
              onDirtyChange={setTextDirty}
            />
          </Box>
        )}

        {step === STEP_RECIPIENTS && (
          <Box sx={{ 
            p: 3, 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 3,
            minHeight: 'fit-content'
          }}>

            <Box sx={{ flex: 1, minHeight: 300 }}>
              <ClassroomStudentPicker
                selectedStudents={selectedStudents}
                onStudentsChange={setSelectedStudents}
                currentUser={currentUser}
                userRole={userRole}
                textData={textData}
                onTextDataChange={setTextData}
              />
            </Box>
            {/* Fixed bottom action bar */}
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              pt: 2,
              borderTop: '1px solid #e2e8f0',
              backgroundColor: 'white',
              position: 'sticky',
              bottom: 0,
            }}>
              <Button 
                variant="text" 
                onClick={() => {
                  // Back from recipients: always confirm (final stage)
                  return requestClose('backFromRecipients');
                }}
              >
                Back
              </Button>
              <Button
                variant="contained"
                disabled={saving || selectedStudents.length === 0}
                onClick={handleRecipientsNext}
                sx={{ minWidth: 120 }}
              >
                {saving ? <CircularProgress size={24} /> : 'Save Note'}
              </Button>
            </Box>
          </Box>
        )}
      </Box>
      {/* Exit confirmation dialog */}
      <Dialog
        open={confirmOpen}
        onClose={handleKeepEditing}
        maxWidth="xs"
        fullWidth
      >
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Exit without saving?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            You have an unfinished note. If you exit now, your current progress will be lost.
          </Typography>
          {/* Voice paused notice intentionally omitted in confirm dialog. */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={handleKeepEditing} variant="contained" autoFocus>
              Keep Editing
            </Button>
            <Button onClick={handleConfirmDiscard} color="error" variant="outlined">
              Discard
            </Button>
          </Box>
        </Box>
      </Dialog>
      <Snackbar 
        open={snackbarOpen} 
        autoHideDuration={6000} 
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ 
          top: '80px !important', // Position below app header
          right: { xs: '16px', sm: 'calc(50% - 187.5px + 16px)' }, // Center within mobile container on desktop
          maxWidth: { xs: '343px', sm: '343px' }, // Constrain width to mobile dimensions
          width: { xs: 'calc(100vw - 32px)', sm: '343px' } // Full width on mobile, fixed on desktop
        }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}

export default AddNoteModal; 
