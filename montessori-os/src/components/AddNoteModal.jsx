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
  Chip,
  Checkbox
} from '@mui/material';
import {
  Close,
  KeyboardVoice,
  TextFields,
  AutoFixHigh,
  ArrowBack,
  MenuBook
} from '@mui/icons-material';
import VoiceRecorder from '../VoiceRecorder';
import { cleanUpText } from '../textCleanup';
import { trackEvent, lengthBucket } from '../utils/analytics';
import ClassroomStudentPicker from './ClassroomStudentPicker';
import NewFeaturePill from './NewFeaturePill';
import { collection, addDoc, serverTimestamp, getDoc, doc, query, where, limit, getDocs, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../firebase';
import { makeCoachRequest, parseCoachResponse } from '../coach/coachIO.js';
import { NUDGE_IDS, CHIPS } from '../coach/constants';
import CoachNudge from '../coach/coach_nudge';
import { isSuperAdmin, isAdminRole } from '../utils/roleUtils';

// TextInput Component
function TextInput({ onSave, onNext, onDirtyChange }) {
  const [text, setText] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [cleaning, setCleaning] = useState(false);
  const [cleanedOnce, setCleanedOnce] = useState(false);
  const [prevText, setPrevText] = useState('');

  const handleTextChange = (event) => {
    const newText = event.target.value;
    setText(newText);
    setWordCount(newText.trim() ? newText.trim().split(/\s+/).length : 0);
    // Dirty if user has typed at least one character (even whitespace)
    if (onDirtyChange) onDirtyChange(newText.length > 0);
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
      if (refined) {
        setText(String(refined).trim());
        setCleanedOnce(true);
      } else {
        // No change; keep original text and mark as not cleaned
        setCleanedOnce(false);
      }
      const dt = Math.round(performance.now() - t0);
      trackEvent('polish_success', {
        source: 'text',
        component: 'AddNoteModal.TextInput',
        length_bucket: lengthBucket(text.length),
        latency_ms: dt,
      });
    } catch (e) {
      console.error('Cleanup error:', e);
      // Do not modify text on error; transparency matters
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
      {/* Title centered */}
      <Typography variant="h6" sx={{ textAlign: 'center', mb: 1 }}>
        Write your observation
      </Typography>
      
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
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
          {cleanedOnce && prevText && (
            <Button variant="text" onClick={handleUndoClean} sx={{ color: '#64748b' }}>
              Undo
            </Button>
          )}
        </Box>
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
  userRole,
  onOpenLessonNotePage
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
  const isAdminUser = isAdminRole(userRole);

  // Coach UI state (Duration-only MVP)
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachNudges, setCoachNudges] = useState([]);
  const [coachSelections, setCoachSelections] = useState({});
  const [coachReviewing, setCoachReviewing] = useState(false); // not used in new flow
  const [coachData, setCoachData] = useState(null); // stores AI response data (status, reason, nudgesShown)
  // Analyzing overlay (replaces snackbar for this flow)
  const [analyzingOpen, setAnalyzingOpen] = useState(false);
  const [analyzingMessage, setAnalyzingMessage] = useState('');

  // Lesson tag state (single-student only)
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [lessonNotes, setLessonNotes] = useState([]);
  const [lessonNotesLoading, setLessonNotesLoading] = useState(false);
  const [lessonNotesError, setLessonNotesError] = useState('');
  const [lessonSearch, setLessonSearch] = useState('');
  const [selectedLessonTag, setSelectedLessonTag] = useState(null); // { id, lessonTitle, createdBy }
  const [tagStudentName, setTagStudentName] = useState('');

  // Multi-student guard when a tag exists
  const [multiStudentWarningOpen, setMultiStudentWarningOpen] = useState(false);
  const [pendingStudents, setPendingStudents] = useState(null);

  // ----- Coach helpers (moved to AddNoteModal scope) -----
  const coachActionRef = useRef(null);
  const coachProgramContextRef = useRef(null); // holds { programId } when gating allows coach

  // Normalize cloud function reason codes to schema values
  const normalizeCoachReason = (reason) => {
    const reasonMap = {
      'net': 'net_timeout',
      'ai': 'server_error',
      'parse_ai': 'parse_error',
      'parse_json': 'parse_error'
    };
    return reasonMap[reason] || 'none';
  };

  const resetCoach = () => {
    setCoachOpen(false);
    setCoachNudges([]);
    setCoachSelections({});
    setCoachReviewing(false);
    setCoachData(null);
  };

  // Resolve selected students' programIds via their classrooms; dedupe classroom reads
  async function getSelectedProgramIds(studentIds) {
    try {
      const studentSnaps = await Promise.all(
        (studentIds || []).map((sid) => getDoc(doc(db, 'students', sid)))
      );
      const classroomIds = Array.from(
        new Set(
          studentSnaps
            .filter((s) => s.exists())
            .map((s) => s.data()?.classroomId)
            .filter(Boolean)
        )
      );
      const classroomSnaps = await Promise.all(
        classroomIds.map((cid) => getDoc(doc(db, 'classrooms', cid)))
      );
      const programIds = Array.from(
        new Set(
          classroomSnaps
            .filter((c) => c.exists())
            .map((c) => c.data()?.programId)
            .filter(Boolean)
        )
      );
      return programIds;
    } catch (_) {
      return [];
    }
  }

  async function isCoachEnabledForProgram(programId) {
    try {
      const ref = doc(db, 'ai_prompts', `coach_${programId}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return false;
      const data = snap.data() || {};
      return data.coach_feature_enable === true;
    } catch (_) {
      return false;
    }
  }

  const runCoachReview = async (noteText) => {
    // This function assumes gating is already done by caller.
    resetCoach();
    // Show analyzing overlay with progressive copy (0s / 5s / 10s)
    let timedOut = false;
    setAnalyzingMessage('Coach Pepper is analyzing your note!');
    setAnalyzingOpen(true);
    const t5 = setTimeout(() => {
      if (!timedOut) setAnalyzingMessage('Oh no, Coach Pepper is taking longer than usual. Hang on tight!');
    }, 5000);
    const t10 = setTimeout(() => {
      timedOut = true;
      setAnalyzingMessage('Coach Pepper is running into issues :( saving note as is for now.');
    }, 10000);

    try {
      const payload = makeCoachRequest(noteText, coachProgramContextRef.current || {});
      const call = httpsCallable(cloudFunctions, 'aiCoachReview');
      const res = await call(payload).catch(() => ({ data: { nudges: [] } }));
      if (timedOut) { 
        clearTimeout(t5); 
        clearTimeout(t10); 
        setAnalyzingOpen(false); 
        return { skipped: true, timeout: true, coachData: { status: 'timeout', reason: 'net_timeout', nudgesShown: [] } }; 
      }
      const aiResponse = res?.data || { nudges: [] };
      const parsed = parseCoachResponse(aiResponse);
      clearTimeout(t5); clearTimeout(t10);
      // Hide analyzing overlay now that we have a result
      setAnalyzingOpen(false);
      let nudges = parsed.nudges || [];
      // UI hard-cap using backend-provided maxReturnNudges (defensive double-cap)
      const uiMax = Number.isInteger(aiResponse?.maxReturnNudges) && aiResponse.maxReturnNudges > 0
        ? aiResponse.maxReturnNudges
        : undefined;
      if (uiMax) nudges = nudges.slice(0, uiMax);
      // Sort by PRD priority order for display and telemetry
      const PRIORITY = ['duration', 'modality', 'independence', 'evidence', 'subjective'];
      nudges.sort((a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id));
      
      // Store AI response data for saving
      const coachStatus = aiResponse.status || 'ok';
      const coachReason = normalizeCoachReason(aiResponse.reason || 'none');
      const nudgesShown = nudges.map(n => ({ id: n.id, confidence: n.confidence }));
      
      if (!nudges.length) {
        return { skipped: true, coachData: { status: coachStatus, reason: coachReason, nudgesShown: [] } };
      }
      // Open dialog with available nudges and wait for user interaction
      setCoachNudges(nudges);
      setCoachSelections((s) => ({ ...s, _noteText: String(noteText || '') }));
      
      // Store the coach data for later saving
      setCoachData({ status: coachStatus, reason: coachReason, nudgesShown, maxNudges: uiMax });
      
      setCoachOpen(true);

      return await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (coachActionRef.current != null) {
            const v = coachActionRef.current;
            coachActionRef.current = null;
            clearInterval(interval);
            resolve(v);
          }
        }, 50);
      });
    } catch (_) {
      clearTimeout(t5); clearTimeout(t10);
      // Hide analyzing overlay and skip without blocking save
      setAnalyzingOpen(false);
      return { skipped: true, coachData: { status: 'error', reason: 'server_error', nudgesShown: [] } };
    }
  };

  const handleCoachSkip = () => {
    coachActionRef.current = { skipped: true, coachData }; // proceed to save without changes
    resetCoach();
  };

  const handleCoachApply = ({ updated_text, selections }) => {
    coachActionRef.current = { updated_text, selections, coachData };
    setCoachOpen(false);
  };

  function humanizeDuration(chip) {
    if (!chip) return '';
    if (chip.endsWith('m+')) return chip.replace('m+', '+ min');
    return chip.replace('m', ' min');
  }

  function buildAppendedLines() {
    const out = [];
    for (const n of coachNudges) {
      const sel = coachSelections[n.id] || {};
      switch (n.id) {
        case NUDGE_IDS.DURATION: {
          const range = sel.range || n.metadata?.duration_range;
          if (range && CHIPS[NUDGE_IDS.DURATION].includes(range)) out.push(`Duration: ${humanizeDuration(range)}`);
          break;
        }
        case NUDGE_IDS.MODALITY: {
          const m = sel.modality || n.metadata?.modality;
          if (m && CHIPS[NUDGE_IDS.MODALITY].includes(m)) out.push(`Modality: ${m}`);
          break;
        }
        case NUDGE_IDS.INDEPENDENCE: {
          const g = sel.independence || n.metadata?.independence;
          if (g && CHIPS[NUDGE_IDS.INDEPENDENCE].includes(g)) out.push(`Independence: ${g}`);
          break;
        }
        case NUDGE_IDS.EVIDENCE: {
          const attempts = Number.isInteger(sel.attempts) ? sel.attempts : n.metadata?.evidence_attempts;
          const correct = Number.isInteger(sel.correct) ? sel.correct : n.metadata?.evidence_correct;
          const quote = sel.quote != null ? sel.quote : n.metadata?.evidence_quote;
          if (Number.isInteger(attempts) && Number.isInteger(correct)) {
            out.push(`Evidence: ${correct}/${attempts} correct`);
          } else if (quote && String(quote).trim()) {
            out.push(`Evidence: "${String(quote).trim()}"`);
          }
          break;
        }
        case NUDGE_IDS.SUBJECTIVE: {
          const line = sel.objective_line || n.metadata?.objective_line;
          if (line && String(line).trim()) out.push(`Objective note: ${String(line).trim()}`);
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  function buildFinalText(original) {
    if (!coachNudges.length) return original;
    const lines = buildAppendedLines();
    if (!lines.length) return original;
    const sep = original.endsWith('\n') ? '' : '\n';
    return `${original}${sep}${lines.join('\n')}`;
  }

  function buildCoachStructuredFields() {
    const fields = {};
    for (const n of coachNudges) {
      const sel = coachSelections[n.id] || {};
      switch (n.id) {
        case NUDGE_IDS.DURATION: {
          const range = sel.range || n.metadata?.duration_range;
          if (range && CHIPS[NUDGE_IDS.DURATION].includes(range)) fields.duration_range = range;
          break;
        }
        case NUDGE_IDS.MODALITY: {
          const m = sel.modality || n.metadata?.modality;
          if (m && CHIPS[NUDGE_IDS.MODALITY].includes(m)) fields.modality = m;
          break;
        }
        case NUDGE_IDS.INDEPENDENCE: {
          const g = sel.independence || n.metadata?.independence;
          if (g && CHIPS[NUDGE_IDS.INDEPENDENCE].includes(g)) fields.independence = g;
          break;
        }
        case NUDGE_IDS.EVIDENCE: {
          const attempts = Number.isInteger(sel.attempts) ? sel.attempts : n.metadata?.evidence_attempts;
          const correct = Number.isInteger(sel.correct) ? sel.correct : n.metadata?.evidence_correct;
          const quote = sel.quote != null ? sel.quote : n.metadata?.evidence_quote;
          if (Number.isInteger(attempts) && Number.isInteger(correct)) {
            fields.evidence_attempts = attempts;
            fields.evidence_correct = correct;
          } else if (quote && String(quote).trim()) {
            fields.evidence_quote = String(quote).trim();
          }
          break;
        }
        case NUDGE_IDS.SUBJECTIVE: {
          const line = sel.objective_line || n.metadata?.objective_line;
          if (line && String(line).trim()) fields.objective_line = String(line).trim();
          break;
        }
        default:
          break;
      }
    }
    return fields;
  }

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

  // Clear lesson tag if student selection changes
  useEffect(() => {
    if (!selectedLessonTag) return;
    if (selectedStudents.length !== 1) {
      setSelectedLessonTag(null);
      return;
    }
    if (selectedLessonTag.studentId && selectedStudents[0] !== selectedLessonTag.studentId) {
      setSelectedLessonTag(null);
    }
  }, [selectedStudents, selectedLessonTag]);

  const handleClose = () => {
    setStep(STEP_NOTE_TYPE);
    // Reset all state when closing
    setTranscriptionData(null);
    setTextData(null);
    setSelectedStudents(initialStudents);
    setSaving(false);
    setSnackbarOpen(false);
    setSnackbarMessage('');
    setSelectedLessonTag(null);
    setLessonNotes([]);
    setLessonSearch('');
    setLessonNotesError('');
    setTagDialogOpen(false);
    setPendingStudents(null);
    setMultiStudentWarningOpen(false);
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
      // Load student name for dialog heading
      try {
        const stuSnap = await getDoc(doc(db, 'students', studentId));
        const sdata = stuSnap.data() || {};
        const name = sdata.displayName || sdata.name || [sdata.firstName, sdata.lastName].filter(Boolean).join(' ');
        setTagStudentName(name || '');
      } catch (_) {
        setTagStudentName('');
      }
      // Fetch recent lesson notes for the student (client-side sort to avoid index churn)
      const q = query(
        collection(db, 'students', studentId, 'observations'),
        where('type', '==', 'lesson'),
        limit(25)
      );
      const snap = await getDocs(q);
      const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      notes.sort((a, b) => {
        const da = toDate(a.observedAt || a.createdAt) || new Date(0);
        const dbd = toDate(b.observedAt || b.createdAt) || new Date(0);
        return dbd - da;
      });
      setLessonNotes(notes);
    } catch (err) {
      console.error('Error loading lesson notes for tagging', err);
      setLessonNotesError('Unable to load lesson notes. Try again.');
    } finally {
      setLessonNotesLoading(false);
    }
  };

  const handleOpenTagDialog = async () => {
    if (selectedStudents.length !== 1) {
      notify.info('Tagging is available only when one student is selected.');
      return;
    }
    const stuId = selectedStudents[0];
    setTagDialogOpen(true);
    await loadLessonNotesForStudent(stuId);
  };

  const handleTagButtonClick = () => {
    if (!isAdminUser) return;
    if (!selectedStudents || selectedStudents.length === 0) {
      notify.info('Select a student first to tag a lesson note.');
      return;
    }
    if (selectedStudents.length !== 1) {
      notify.info('Tagging works only when one student is selected.');
      return;
    }
    handleOpenTagDialog();
  };

  const handleSelectLessonTag = (note) => {
    if (!note) return;
    setSelectedLessonTag({
      id: note.id,
      lessonTitle: note.lessonTitle || 'Lesson Note',
      createdBy: note.createdBy || note.createdByEmail || null,
      studentId: selectedStudents?.[0] || null,
    });
    setTagDialogOpen(false);
  };

  const handleClearLessonTag = () => {
    setSelectedLessonTag(null);
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

  const handleStudentsChange = (nextStudents) => {
    if (selectedLessonTag && (nextStudents?.length || 0) > 1) {
      setPendingStudents(nextStudents);
      setMultiStudentWarningOpen(true);
      return;
    }
    setSelectedStudents(nextStudents);
  };

  const handleConfirmDropTag = () => {
    setSelectedLessonTag(null);
    if (pendingStudents) {
      setSelectedStudents(pendingStudents);
    }
    setPendingStudents(null);
    setMultiStudentWarningOpen(false);
  };

  const handleCancelDropTag = () => {
    setPendingStudents(null);
    setMultiStudentWarningOpen(false);
  };

  const handleSelectVoice = () => {
    setStep(STEP_RECORD);
  };

  const handleSelectText = () => {
    setStep(STEP_TEXT_INPUT);
  };

  const handleSelectLesson = () => {
    if (!isSuperAdmin(userRole)) return; // Disabled for non-superadmins
    handleClose();
    if (onOpenLessonNotePage) onOpenLessonNotePage();
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

    // If note has text, evaluate Coach gating by program and run if enabled
    let coachResult = null;
    if (noteData && noteData.text) {
      // Determine selected programs
      const programIds = await getSelectedProgramIds(selectedStudents);
      if (programIds.length === 1) {
        const programId = programIds[0];
        const enabled = await isCoachEnabledForProgram(programId);
        if (enabled) {
          coachProgramContextRef.current = { programId };
          coachResult = await runCoachReview(noteData.text).catch(() => ({ skipped: true }));
          if (!coachResult) return; // safety
        }
        // if not enabled → skip coach silently
      } else {
        // multiple or zero programs → skip coach silently per policy
      }
    }

    const canTagLesson = (
      selectedStudents.length === 1 &&
      selectedLessonTag &&
      selectedLessonTag.studentId === selectedStudents[0] &&
      (isAdminUser || selectedLessonTag.createdBy === currentUser?.uid)
    );
    const taggedLessonId = canTagLesson ? selectedLessonTag.id : null;

    try {
      setSaving(true);
      // Generate groupId for multi-student notes (matching lesson notes pattern)
      const groupId = selectedStudents.length > 1 
        ? `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        : undefined;
      
      const newObservationIds = [];

      const promises = selectedStudents.map(async (stuId) => {
        // Get student data to find classroomId
        const studentDocRef = doc(db, 'students', stuId);
        const studentDocSnap = await getDoc(studentDocRef);
        const studentData = studentDocSnap.data();

        // Prefer exact text from the user’s Apply in the Coach dialog; otherwise save original
        let textToSave = coachResult?.updated_text || noteData.text;

        const observationData = {
          // Identity
          studentId: stuId,
          classroomId: studentData?.classroomId || 'unknown',

          // Content
          type: transcriptionData ? 'voice' : 'text',
          text: textToSave,

          // Timestamps
          observedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),

          // Creator
          createdBy: currentUser?.uid || 'unknown',
          createdByName: currentUser?.displayName || 'Unknown Teacher',
          createdByEmail: currentUser?.email || 'unknown@email.com',
          
          // Group ID for multi-student notes
          ...(groupId ? { groupId } : {}),
          ...(taggedLessonId ? { linkedLessonObservationId: taggedLessonId } : {}),
        };

        // Voice-specific fields (only add if defined to avoid Firestore 'undefined' errors)
        if (transcriptionData) {
          if (typeof transcriptionData.duration === 'number') {
            observationData.durationSec = transcriptionData.duration;
          }
          if (typeof transcriptionData.sttConfidence === 'number') {
            observationData.sttConfidence = transcriptionData.sttConfidence;
          }
          // Drop alternatives/spoken language/provider per schema simplification
        }

        // Coach structured fields - wrap according to DATA_STRUCTURE.md
        // Save coach object if coach was invoked (whether nudges shown or selections made)
        if (coachResult && coachResult.coachData) {
          observationData.coach = {
            status: coachResult.coachData.status || 'ok',
            reason: coachResult.coachData.reason || 'none',
            // Record nudges shown in PRD sort order
            nudgesShown: coachResult.coachData.nudgesShown || []
          };
          // Add selections if any were made
          if (coachResult.selections && Object.keys(coachResult.selections).length > 0) {
            observationData.coach.selections = coachResult.selections;
          }
        }

        // No default spoken language for text notes

        // Prune undefined values defensively before writing to Firestore
        const cleanedObservationData = Object.fromEntries(
          Object.entries(observationData).filter(([, value]) => value !== undefined)
        );

        // Debug log for troubleshooting schema issues
        console.debug('[save] observation payload', cleanedObservationData);

        // Write to per-student subcollection
        const docRef = await addDoc(collection(db, 'students', stuId, 'observations'), cleanedObservationData);
        newObservationIds.push({ studentId: stuId, observationId: docRef.id });
      });
      await Promise.all(promises);

      // Backlink: add this observation to the lesson note's linkedObservations (single student only)
      if (taggedLessonId && newObservationIds.length === 1) {
        try {
          const lessonRef = doc(db, 'students', selectedStudents[0], 'observations', taggedLessonId);
          await updateDoc(lessonRef, {
            linkedObservations: arrayUnion(newObservationIds[0].observationId)
          });
        } catch (err) {
          console.error('Error adding backlink to lesson note', err);
          notify.warning('Note saved, but could not update the linked lesson note.');
        }
      }

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
        {/* Header with back button and close button */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            px: 1,
            py: 0.5,
            minHeight: 40,
            position: 'relative',
            flexShrink: 0
          }}
        >
          {step !== STEP_NOTE_TYPE && (
            <IconButton
              aria-label="Go back"
              onClick={() => {
                if (step === STEP_TEXT_INPUT) {
                  setStep(STEP_NOTE_TYPE);
                } else if (step === STEP_RECORD) {
                  setStep(STEP_NOTE_TYPE);
                } else if (step === STEP_RECIPIENTS) {
                  // Go back to previous step based on how we got here
                  if (textData) {
                    setStep(STEP_TEXT_INPUT);
                  } else if (transcriptionData) {
                    setStep(STEP_RECORD);
                  } else {
                    setStep(STEP_NOTE_TYPE);
                  }
                }
              }}
              sx={{
                color: '#64748b',
                '&:hover': { backgroundColor: 'rgba(100, 116, 139, 0.08)' }
              }}
              size="small"
            >
              <ArrowBack />
            </IconButton>
          )}
          {step === STEP_NOTE_TYPE && <Box />}
          <IconButton
            aria-label="Close"
            onClick={() => requestClose('closeButton')}
            sx={{
              color: '#1e293b',
              '&:hover': { backgroundColor: '#f1f5f9' }
            }}
            size="small"
          >
            <Close />
          </IconButton>
        </Box>
        {/* Content area */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative'
          }}
        >
        {step === STEP_NOTE_TYPE && (
          <Box
            sx={{
              position: 'relative',
              p: 3,
              pt: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              alignItems: 'center',
              minHeight: 'fit-content'
            }}
          >
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
                <TextFields sx={{ fontSize: 32, color: '#4f46e5' }} />
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
                <KeyboardVoice sx={{ fontSize: 32, color: '#4f46e5' }} />
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body1" sx={{ color: '#1e293b' }}>
                      Voice Note
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Record audio note
                  </Typography>
                </Box>
              </Box>
              {/* Lesson Note */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  border: '1px solid #e2e8f0',
                  borderRadius: 2,
                  p: 2,
                  width: '100%',
                  cursor: isSuperAdmin(userRole) ? 'pointer' : 'not-allowed',
                  backgroundColor: isSuperAdmin(userRole) ? 'white' : '#f8fafc',
                  opacity: isSuperAdmin(userRole) ? 1 : 0.5,
                  '&:hover': isSuperAdmin(userRole) ? { 
                    backgroundColor: '#f8fafc',
                    border: '1px solid #4f46e5'
                  } : {}
                }}
                onClick={handleSelectLesson}
                aria-label="Add lesson note"
              >
                <MenuBook sx={{ fontSize: 32, color: isSuperAdmin(userRole) ? '#4f46e5' : '#94a3b8' }} />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="body1" sx={{ color: isSuperAdmin(userRole) ? '#1e293b' : '#94a3b8' }}>
                      Lesson Note
                    </Typography>
                    {isSuperAdmin(userRole) && (
                      <Box sx={{ opacity: 1 }}>
                        <NewFeaturePill label="New" size="sm" />
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Structured lesson observation
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        )}

        {step === STEP_RECORD && (
          <Box sx={{ p: 3, pt: 1, flex: 1 }}>
            <VoiceRecorder 
              onSave={handleVoiceSave} 
              onNext={() => setStep(STEP_RECIPIENTS)}
              onDirtyChange={setVoiceDirty}
              exposeControls={(controls) => { voiceControlsRef.current = controls; }}
              variant="cardless"
            />
          </Box>
        )}

        {step === STEP_TEXT_INPUT && (
          <Box sx={{ p: 3, pt: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <TextInput 
              onSave={handleTextSave} 
              onNext={() => setStep(STEP_RECIPIENTS)}
              onDirtyChange={setTextDirty}
            />
          </Box>
        )}

        {step === STEP_RECIPIENTS && (
          <Box sx={{ 
            p: 3, 
            pt: 1,
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 3,
            minHeight: 'fit-content'
          }}>

            <Box sx={{ flex: 1, minHeight: 300 }}>
              <ClassroomStudentPicker
                selectedStudents={selectedStudents}
                onStudentsChange={handleStudentsChange}
                currentUser={currentUser}
                userRole={userRole}
                textData={textData}
                onTextDataChange={setTextData}
              />
            </Box>
            {/* Fixed bottom action bar */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
                pt: 2,
                borderTop: '1px solid #e2e8f0',
                backgroundColor: 'white',
                position: 'sticky',
                bottom: 0,
              }}
            >
              {selectedLessonTag && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 600 }}>
                    Tagged Lesson Note:
                  </Typography>
                  <Chip
                    label={selectedLessonTag.lessonTitle}
                    onDelete={handleClearLessonTag}
                    color="primary"
                    variant="outlined"
                  />
                </Box>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {isAdminUser && (
                  <Button
                    variant="outlined"
                    onClick={handleTagButtonClick}
                    sx={{ textTransform: 'none' }}
                  >
                    Tag Lesson Note
                  </Button>
                )}
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
          </Box>
        )}

      </Box>
      {/* Tag lesson note dialog */}
      <Dialog
        open={tagDialogOpen}
        onClose={() => setTagDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="h6">
              {`Tag lesson notes${tagStudentName ? ` for ${tagStudentName}` : ''}`}
            </Typography>
            <IconButton
              size="small"
              aria-label="Close tag lesson notes dialog"
              onClick={() => setTagDialogOpen(false)}
              sx={{ alignSelf: 'flex-start' }}
            >
              <Close fontSize="small" />
            </IconButton>
          </Box>
          <TextField
            fullWidth
            placeholder="Search lesson titles"
            value={lessonSearch}
            onChange={(e) => setLessonSearch(e.target.value)}
          />
          <Typography variant="body2" color="text.secondary">
            {lessonNotesLoading
              ? 'Loading lesson notes...'
              : `${lessonNotes.length} lesson note${lessonNotes.length === 1 ? '' : 's'} available`}
          </Typography>
          {lessonNotesError && (
            <Alert severity="error" onClose={() => setLessonNotesError('')}>
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
                  const disabled = !canTag;
                  const checked = selectedLessonTag?.id === note.id;
                  return (
                    <Box
                      key={note.id}
                      sx={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 2,
                        p: 1.25,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        opacity: disabled ? 0.6 : 1,
                        backgroundColor: disabled ? '#f8fafc' : 'white',
                        cursor: disabled ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => {
                        if (disabled) return;
                        handleSelectLessonTag(note);
                      }}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onChange={() => {
                          if (disabled) return;
                          handleSelectLessonTag(note);
                        }}
                      />
                      <Typography variant="body1" sx={{ fontWeight: 600, color: '#1e293b' }}>
                        {note.lessonTitle || 'Lesson Note'}
                      </Typography>
                    </Box>
                  );
                });
              })()}
            </Box>
          )}
        </Box>
      </Dialog>
      {/* Multi-student warning when a tag exists */}
      <Dialog
        open={multiStudentWarningOpen}
        onClose={handleCancelDropTag}
        maxWidth="xs"
        fullWidth
      >
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6">Remove lesson tag?</Typography>
          <Typography variant="body2" color="text.secondary">
            Tagging is for a single student. Selecting another student will drop the tagged lesson note.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={handleCancelDropTag}>Cancel</Button>
            <Button variant="contained" color="primary" onClick={handleConfirmDropTag}>
              Proceed
            </Button>
          </Box>
        </Box>
      </Dialog>
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
        open={false}
        onClose={() => {}}
      >
        <Alert severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>

      {/* Analyzing overlay dialog */}
      <Dialog open={analyzingOpen} onClose={() => {}} fullWidth maxWidth="xs">
        <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={22} />
          <Typography variant="body2" color="text.secondary">{analyzingMessage}</Typography>
        </Box>
      </Dialog>

      {/* Coach nudge popup — duration-only MVP */}
      <Dialog open={coachOpen} onClose={handleCoachSkip} fullWidth maxWidth="sm">
        <Box sx={{ position: 'relative' }}>
          <CoachNudge
            noteText={coachSelections?._noteText || ''}
            onSkip={handleCoachSkip}
            onApply={handleCoachApply}
            forcedNudges={coachNudges.map(n => n.id)}
            maxNudges={coachData?.maxNudges}
          />
          {coachReviewing && (
            <Box
              aria-label="Coach reviewing"
              sx={{
                position: 'absolute',
                top: 8,
                right: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                backgroundColor: 'rgba(15, 23, 42, 0.06)'
              }}
            >
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Reviewing…
              </Typography>
            </Box>
          )}
        </Box>
      </Dialog>
    </Dialog>
  );
}

export default AddNoteModal; 
