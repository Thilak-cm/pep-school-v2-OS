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
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
  Divider
} from '@mui/material';
import { keyframes } from '@emotion/react';
import {
  Close,
  KeyboardVoice,
  TextFields,
  AutoFixHigh,
  AutoAwesome,
  ArrowBack,
  MenuBook,
  PhotoLibrary,
  CloudUpload,
  Edit,
  CheckCircle,
  Movie,
  Mic,
  Brush,
  ContentCopy
} from '@mui/icons-material';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import VoiceRecorder from '../VoiceRecorder';
import { cleanUpText } from '../textCleanup';
import { trackEvent, lengthBucket } from '../utils/analytics';
import ClassroomStudentPicker from './ClassroomStudentPicker';
import { collection, getDoc, doc, query, where, limit, getDocs } from 'firebase/firestore';
import { db, cloudFunctions } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import { httpsCallable } from 'firebase/functions';
import { makeCoachRequest, parseCoachResponse } from '../coach/coachIO.js';
import { NUDGE_IDS, CHIPS } from '../coach/constants';
import CoachNudge from '../coach/coach_nudge';
import { isAdminRole } from '../utils/roleUtils';
import MentionTextArea from './MentionTextArea';
import useMentionableStudents from '../hooks/useMentionableStudents';
import useTranscriptStudentSuggestions from '../hooks/useTranscriptStudentSuggestions';
import LessonNoteTagDialog from './LessonNoteTagDialog';
import NewFeaturePill from './NewFeaturePill';
import { enqueueSaveQueueItems } from '../services/saveQueue';
import { reportCaughtError } from '../utils/reportCaughtError.js';

// Confetti Animation Component
const confettiFall = keyframes`
  0% {
    transform: translateY(-20px) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(400px) rotate(360deg);
    opacity: 0;
  }
`;

const confettiColors = ['#4f46e5', '#059669', '#f59e0b', '#db2777', '#3b82f6', '#8b5cf6'];
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const IMAGE_FILE_EXTENSION_RE = /\.(heic|heif|jpg|jpeg|png|webp|gif|bmp)$/i;
const HEIF_FILE_EXTENSION_RE = /\.(heic|heif)$/i;
const HEIF_MIME_RE = /^image\/hei(f|c)$/i;
const POLISH_BUTTON_SX = {
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
};

function ConfettiAnimation() {
  const particles = React.useMemo(() => 
    Array.from({ length: 50 }, (_, i) => {
      const isWide = Math.random() > 0.5; // Mix of wide and tall rectangles
      const width = isWide ? 12 + Math.random() * 8 : 6 + Math.random() * 4;
      const height = isWide ? 6 + Math.random() * 4 : 12 + Math.random() * 8;
      return {
        id: i,
        left: `${Math.random() * 100}%`,
        delay: Math.random() * 2.5, // Spread over the full 2.5 seconds
        duration: 2.5 + Math.random() * 0.5, // 2.5-3 seconds for smooth fall
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        width,
        height,
        rotation: Math.random() * 360, // Random starting rotation
      };
    }), []
  );

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      {particles.map((particle) => (
        <Box
          key={particle.id}
          sx={{
            position: 'absolute',
            left: particle.left,
            top: '-10px',
            width: particle.width,
            height: particle.height,
            backgroundColor: particle.color,
            borderRadius: '2px', // Slight rounding for softer look
            transform: `rotate(${particle.rotation}deg)`,
            animation: `${confettiFall} ${particle.duration}s ease-out ${particle.delay}s forwards`,
          }}
        />
      ))}
    </Box>
  );
}

// TextInput Component
function TextInput({
  onSave,
  onDirtyChange,
  initialText = '',
  initialTags = [],
  mentionableStudents = [],
  onTagsChange = () => {}
}) {
  const [text, setText] = useState(initialText);
  const [wordCount, setWordCount] = useState(0);
  const [cleaning, setCleaning] = useState(false);
  const [cleanedOnce, setCleanedOnce] = useState(false);
  const [prevText, setPrevText] = useState('');
  const [tags, setTags] = useState(initialTags);

  useEffect(() => {
    setText(initialText || '');
    setTags(initialTags || []);
    setWordCount(initialText?.trim() ? initialText.trim().split(/\s+/).length : 0);
    setCleanedOnce(false);
    setPrevText('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

  const handleTextChange = (event) => {
    const newText = typeof event === 'string'
      ? event
      : event?.target?.value ?? '';
    setText(newText);
    setWordCount(newText.trim() ? newText.trim().split(/\s+/).length : 0);
    // Dirty if user has typed at least one character (even whitespace)
    if (onDirtyChange) onDirtyChange(newText.length > 0);
  };

  const handleSave = () => {
    if (!text.trim()) {
      return;
    }
    onSave({ text: text.trim(), cleaned: cleanedOnce, mentionedStudents: tags });
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
    } catch {
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
      <Typography variant="h6" sx={{ textAlign: 'center', mb: -1 }}>
        Write your observation
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: -1, textAlign: 'center', display: 'block' }}
      >
        Rough notes are okay — AI will polish for you.
      </Typography>
      <Box sx={{ position: 'relative' }}>
        <MentionTextArea
          value={text}
          onChange={handleTextChange}
          placeholder="Quick select students using @"
          students={mentionableStudents}
          tags={tags}
          onTagsChange={(nextTags) => {
            setTags(nextTags);
            onTagsChange(nextTags);
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
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            onClick={handleCleanUp}
            disabled={!text.trim() || cleaning || cleanedOnce}
            startIcon={cleaning ? <CircularProgress size={16} color="inherit" /> : <AutoFixHigh />}
            sx={POLISH_BUTTON_SX}
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
const STEP_COACH = 'coach';
const STEP_MEDIA = 'media';

function AddNoteModal({
  open,
  onClose,
  initialStudents = [],
  currentUser,
  userRole,
  onOpenLessonNotePage
}) {
  const notify = useNotify();
  const [step, setStep] = useState(STEP_NOTE_TYPE);
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [textData, setTextData] = useState(null);
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState(initialStudents);
  const [mentionedStudents, setMentionedStudents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [_snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, _setSnackbarSeverity] = useState('success');
  const isAdminUser = isAdminRole(userRole);

  // Media note state
  const [mediaMode, setMediaMode] = useState(null); // 'photo' | 'pdf'
  const [mediaItems, setMediaItems] = useState([]); // [{ id, kind, source, previewUrl, teacherComment }]
  const [pdfSource, setPdfSource] = useState(null); // { file, size, contentType, extension, originalName }
  const [mediaTeacherComment, setMediaTeacherComment] = useState(''); // PDF comment only
  const [mediaItemCommentCleaning, setMediaItemCommentCleaning] = useState({});
  const [mediaItemCommentCleanedOnce, setMediaItemCommentCleanedOnce] = useState({});
  const [mediaItemCommentPrevText, setMediaItemCommentPrevText] = useState({});
  const [mediaPdfCommentCleaning, setMediaPdfCommentCleaning] = useState(false);
  const [mediaPdfCommentCleanedOnce, setMediaPdfCommentCleanedOnce] = useState(false);
  const [mediaPdfCommentPrevText, setMediaPdfCommentPrevText] = useState('');
  const [mediaDictationOpen, setMediaDictationOpen] = useState(false);
  const mediaCommentRef = useRef(null);
  const [mediaDictationSelection, setMediaDictationSelection] = useState({ start: null, end: null });
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaDirty, setMediaDirty] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [pdfDisplayName, setPdfDisplayName] = useState('');
  const [pdfNameEditing, setPdfNameEditing] = useState(false);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfEssence, setPdfEssence] = useState('');
  const [pdfTitleLoading, setPdfTitleLoading] = useState(false);
  const [pdfEssenceLoading, setPdfEssenceLoading] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState(null);
  const [_pdfExtractedText, setPdfExtractedText] = useState('');
  const pdfWorkerSetupRef = useRef(false);
  const [handwritingDetectionLoading, setHandwritingDetectionLoading] = useState(false);
  const handwritingDetectionFailedRef = useRef(new Set());

  // Coach UI state (Duration-only MVP)
  const [coachNudges, setCoachNudges] = useState([]);
  const [coachSelections, setCoachSelections] = useState({});
  const [coachData, setCoachData] = useState(null); // stores AI response data (status, reason, nudgesShown)
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachLoadingMessage, setCoachLoadingMessage] = useState('');
  const [coachPerfectNote, setCoachPerfectNote] = useState(false); // shows success message when no nudges

  // Lesson tag state (single-student only; supports multiple lesson links)
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [lessonNotes, setLessonNotes] = useState([]);
  const [lessonNotesLoading, setLessonNotesLoading] = useState(false);
  const [lessonNotesError, setLessonNotesError] = useState('');
  const [lessonSearch, setLessonSearch] = useState('');
  const [selectedLessonIds, setSelectedLessonIds] = useState([]); // array of lesson observation IDs
  const [tagStudentName, setTagStudentName] = useState('');

  // Multi-student guard when a tag exists
  const [multiStudentWarningOpen, setMultiStudentWarningOpen] = useState(false);
  const [pendingStudents, setPendingStudents] = useState(null);

  // ----- Coach helpers (moved to AddNoteModal scope) -----
  const coachProgramContextRef = useRef(null); // holds { programId } when gating allows coach
  const coachRequestIdRef = useRef(0);
  const coachTimerRef = useRef({ t5: null, t10: null });
  const lastCoachSignatureRef = useRef(null);
  const mediaFileInputRef = useRef(null);

  const { students: mentionableStudents } = useMentionableStudents({ currentUser, userRole });
  const transcriptSuggestions = useTranscriptStudentSuggestions(
    transcriptionData?.text || '',
    mentionableStudents
  );

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

  const buildCoachSignature = (noteData, studentIds, noteType = 'text') => {
    const sorted = Array.from(new Set(studentIds || [])).sort();
    return JSON.stringify({
      text: noteData?.text || '',
      students: sorted,
      noteType,
    });
  };

  const clearCoachTimers = () => {
    const { t5, t10 } = coachTimerRef.current || {};
    if (t5) clearTimeout(t5);
    if (t10) clearTimeout(t10);
    coachTimerRef.current = { t5: null, t10: null };
  };

  const resetCoach = () => {
    clearCoachTimers();
    setCoachNudges([]);
    setCoachSelections({});
    setCoachData(null);
    setCoachLoading(false);
    setCoachLoadingMessage('');
    setCoachPerfectNote(false);
    lastCoachSignatureRef.current = null;
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

  const runCoachReview = async (noteText, signature) => {
    // This function assumes gating is already done by caller.
    resetCoach();
    const reqId = ++coachRequestIdRef.current;
    clearCoachTimers();
    let timedOut = false;
    setCoachLoading(true);
    setCoachLoadingMessage('Coach Pepper is analyzing your note!');
    coachTimerRef.current.t5 = setTimeout(() => {
      if (coachRequestIdRef.current === reqId && !timedOut) {
        setCoachLoadingMessage('Oh no, Coach Pepper is taking longer than usual. Hang on tight!');
      }
    }, 5000);
    coachTimerRef.current.t10 = setTimeout(() => {
      if (coachRequestIdRef.current === reqId) {
        timedOut = true;
        setCoachLoadingMessage('Coach Pepper is running into issues :( saving note as is for now.');
      }
    }, 10000);

    try {
      const payload = makeCoachRequest(noteText, coachProgramContextRef.current || {});
      const call = httpsCallable(cloudFunctions, 'aiCoachReview');
      const res = await call(payload).catch(() => ({ data: { nudges: [] } }));

      if (coachRequestIdRef.current !== reqId) {
        clearCoachTimers();
        return null; // cancelled or superseded
      }

      const aiResponse = res?.data || { nudges: [] };
      const parsed = parseCoachResponse(aiResponse);

      if (timedOut) {
        clearCoachTimers();
        setCoachLoading(false);
        return { skipped: true, timeout: true, coachData: { status: 'timeout', reason: 'net_timeout', nudgesShown: [] } };
      }

      clearCoachTimers();
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
        setCoachLoading(false);
        setCoachLoadingMessage('Coach Pepper thinks this is a perfect note!');
        setCoachPerfectNote(true);
        return { skipped: true, perfectNote: true, coachData: { status: coachStatus, reason: coachReason, nudgesShown: [] } };
      }

      setCoachNudges(nudges);
      setCoachData({ status: coachStatus, reason: coachReason, nudgesShown, maxNudges: uiMax });
      setCoachLoading(false);
      setCoachLoadingMessage('');
      lastCoachSignatureRef.current = signature;
      return { ready: true };
    } catch (_) {
      if (coachRequestIdRef.current !== reqId) {
        clearCoachTimers();
        return null;
      }
      clearCoachTimers();
      setCoachLoading(false);
      setCoachLoadingMessage('');
      return { skipped: true, coachData: { status: 'error', reason: 'server_error', nudgesShown: [] } };
    }
  };

  const handleCoachSkip = () => {
    if (saving) return;
    const result = {
      skipped: true,
      coachData: coachData || { status: 'ok', reason: 'none', nudgesShown: [] }
    };
    saveNote(result);
  };

  const handleCoachBack = () => {
    coachRequestIdRef.current += 1; // cancel any in-flight request
    clearCoachTimers();
    setCoachLoading(false);
    setCoachLoadingMessage('');
    setStep(STEP_RECIPIENTS);
  };

  const handleCoachApply = ({ updated_text, selections }) => {
    if (saving) return;
    saveNote({ updated_text, selections, coachData });
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

  function _buildFinalText(original) {
    if (!coachNudges.length) return original;
    const lines = buildAppendedLines();
    if (!lines.length) return original;
    const sep = original.endsWith('\n') ? '' : '\n';
    return `${original}${sep}${lines.join('\n')}`;
  }

  function _buildCoachStructuredFields() {
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
    setMentionedStudents([]);
  }, [initialStudents]);

  // Clear lesson tags if student selection changes
  useEffect(() => {
    if (!selectedLessonIds || selectedLessonIds.length === 0) return;
    if (selectedStudents.length !== 1) {
      setSelectedLessonIds([]);
      return;
    }
    // We only ever load lesson notes for the currently selected student,
    // so if the selected student changes, drop any existing tags.
  }, [selectedStudents, selectedLessonIds]);

  // Invalidate cached coach nudges if the note or recipients change
  useEffect(() => {
    if (!lastCoachSignatureRef.current) return;
    const currentNoteData = transcriptionData || textData;
    const noteType = currentNoteData === transcriptionData ? 'voice' : 'text';
    const sig = buildCoachSignature(currentNoteData, selectedStudents, noteType);
    if (sig !== lastCoachSignatureRef.current) {
      resetCoach();
    }
  }, [textData, transcriptionData, selectedStudents]);

  // Auto-trigger VLM handwriting detection once photos are added
  useEffect(() => {
    if (step !== STEP_MEDIA || mediaMode !== 'photo') return;
    if (handwritingDetectionLoading) return;

    const undetected = mediaItems.filter((it) => it.kind === 'photo' && it.handwritten === undefined && !handwritingDetectionFailedRef.current.has(it.id));
    if (undetected.length === 0) return;

    runHandwritingDetection(undetected).catch((error) => {
      reportCaughtError(error, 'AddNoteModal', 'empty promise catch at runHandwritingDetection');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mediaMode, mediaItems, handwritingDetectionLoading]);

  const handleClose = () => {
    setStep(STEP_NOTE_TYPE);
    coachRequestIdRef.current += 1;
    resetCoach();
    // Reset all state when closing
    setTranscriptionData(null);
    setTextData(null);
    setVoiceTranscribing(false);
    setVoiceDirty(false);
    setSelectedStudents(initialStudents);
    setMentionedStudents([]);
    setSaving(false);
    setSnackbarOpen(false);
    setSnackbarMessage('');
    setSelectedLessonIds([]);
    setLessonNotes([]);
    setLessonSearch('');
    setLessonNotesError('');
    setTagDialogOpen(false);
    setPendingStudents(null);
    setMultiStudentWarningOpen(false);
    resetMediaState();
    onClose();
  };

  // Derive if the modal has unsaved work
  const hasUnsavedWork = () => {
    if (step === STEP_NOTE_TYPE) return false; // silent close for window 1
    if (step === STEP_TEXT_INPUT) return textDirty;
    if (step === STEP_RECORD) return voiceDirty;
    if (step === STEP_MEDIA) return mediaDirty || mediaUploading;
    if (step === STEP_RECIPIENTS) {
      return (
        selectedStudents.length > 0 ||
        !!textData || !!transcriptionData ||
        textDirty || voiceDirty
      );
    }
    if (step === STEP_COACH) {
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
  }, [open, step, textDirty, voiceDirty, selectedStudents, textData, transcriptionData, mediaDirty, mediaUploading, mediaItems, pdfSource, saving]);

  useEffect(() => {
    return () => clearCoachTimers();
  }, []);

  const pauseVoiceIfRecording = () => {
    try {
      const c = voiceControlsRef.current;
      if (c && typeof c.pauseIfRecording === 'function') c.pauseIfRecording();
    } catch (_) {
      reportCaughtError(_, 'AddNoteModal', 'swallow-only try/catch at L786');
    }
  };

  const cancelVoiceIfNeeded = () => {
    try {
      const c = voiceControlsRef.current;
      if (c && typeof c.cancelRecording === 'function') c.cancelRecording();
    } catch (_) {
      reportCaughtError(_, 'AddNoteModal', 'swallow-only try/catch at L793');
    }
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
    } catch {
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

  const handleClearLessonTag = () => {
    setSelectedLessonIds([]);
  };

  // Centralized close request handler (backdrop, ESC, X, back buttons)
  const requestClose = (_reason) => {
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
      } catch (_) {
        reportCaughtError(_, 'AddNoteModal', 'swallow-only try/catch at L879');
      }
    }
    if (shouldShowVoicePaused) {
      try {
        if (voiceControlsRef.current && typeof voiceControlsRef.current.pauseForExit === 'function') {
          voiceControlsRef.current.pauseForExit();
        } else {
          pauseVoiceIfRecording();
        }
      } catch (_) {
        reportCaughtError(_, 'AddNoteModal', 'swallow-only try/catch at L888');
      }
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
    if ((selectedLessonIds?.length || 0) > 0 && (nextStudents?.length || 0) > 1) {
      setPendingStudents(nextStudents);
      setMultiStudentWarningOpen(true);
      return;
    }
    setSelectedStudents(nextStudents);
  };

  const handleConfirmDropTag = () => {
    setSelectedLessonIds([]);
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

  const revokeMediaPreview = (item) => {
    if (item?.previewUrl) {
      try { URL.revokeObjectURL(item.previewUrl); } catch (_) {
        reportCaughtError(_, 'AddNoteModal', 'swallow-only try/catch at L930');
      }
    }
  };

  const clearMediaItemPolishState = (itemId) => {
    setMediaItemCommentCleaning((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setMediaItemCommentCleanedOnce((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setMediaItemCommentPrevText((prev) => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleMediaTeacherCommentChange = (value) => {
    setMediaTeacherComment(value);
    setMediaDirty(true);
  };

  const resetMediaState = () => {
    (mediaItems || []).forEach(revokeMediaPreview);
    setMediaMode(null);
    setMediaItems([]);
    setPdfSource(null);
    setMediaTeacherComment('');
    setMediaItemCommentCleaning({});
    setMediaItemCommentCleanedOnce({});
    setMediaItemCommentPrevText({});
    setMediaPdfCommentCleaning(false);
    setMediaPdfCommentCleanedOnce(false);
    setMediaPdfCommentPrevText('');
    setMediaDictationOpen(false);
    setMediaDictationSelection({ start: null, end: null });
    setMediaUploading(false);
    setMediaDirty(false);
    setMediaError('');
    setPdfDisplayName('');
    setPdfNameEditing(false);
    setPdfTitle('');
    setPdfEssence('');
    setPdfTitleLoading(false);
    setPdfEssenceLoading(false);
    setPdfPageCount(null);
    setPdfExtractedText('');
  };

  const openMediaDictation = () => {
    const el = mediaCommentRef.current;
    const start = el && Number.isInteger(el.selectionStart) ? el.selectionStart : null;
    const end = el && Number.isInteger(el.selectionEnd) ? el.selectionEnd : null;
    setMediaDictationSelection({ start, end });
    setMediaDictationOpen(true);
  };

  const closeMediaDictation = () => {
    setMediaDictationOpen(false);
    setMediaDictationSelection({ start: null, end: null });
  };

  const handleMediaDictationSave = (transcriptionData) => {
    const insertText = transcriptionData?.text?.trim();
    if (!insertText) {
      closeMediaDictation();
      return;
    }
    const current = mediaTeacherComment || '';
    let nextValue;
    if (mediaDictationSelection.start != null && mediaDictationSelection.end != null) {
      nextValue = current.slice(0, mediaDictationSelection.start) + insertText + current.slice(mediaDictationSelection.end);
    } else {
      nextValue = current ? current + ' ' + insertText : insertText;
    }
    handleMediaTeacherCommentChange(nextValue);
    closeMediaDictation();
  };

  const getPdfBaseName = (name) => {
    const raw = String(name || '');
    if (raw.toLowerCase().endsWith('.pdf')) return raw.slice(0, -4);
    return raw;
  };

  const buildPdfName = (base) => {
    const trimmed = String(base || '').trim();
    if (!trimmed) return 'document.pdf';
    return `${trimmed}.pdf`;
  };

  const handleSelectVoice = () => {
    setVoiceTranscribing(false);
    setTextData(null);
    setStep(STEP_RECORD);
  };

  const handleSelectLesson = () => {
    handleClose();
    if (onOpenLessonNotePage) onOpenLessonNotePage();
  };

  const handleSelectMedia = (kind = null) => {
    resetMediaState();
    setStep(STEP_MEDIA);
    setMediaMode(kind || 'photo');
  };

  const handleVoiceSave = (transcriptionData) => {
    setVoiceTranscribing(false);
    setTextData(null);
    setTranscriptionData(transcriptionData);
    setVoiceDirty(false);
    setStep(STEP_RECIPIENTS);
  };

  const handleTextSave = (nextTextData) => {
    const tagged = nextTextData?.mentionedStudents || [];
    setMentionedStudents(tagged);
    setSelectedStudents((prev) => {
      const merged = new Set([...(prev || []), ...tagged.map((t) => t.id)]);
      return Array.from(merged);
    });
    setTranscriptionData(null);
    setTextData(nextTextData);
    setStep(STEP_RECIPIENTS);
  };

  const handleVoiceRecordAgain = () => {
    setTranscriptionData(null);
    setVoiceTranscribing(false);
    setVoiceDirty(false);
    setStep(STEP_RECORD);
  };

  const handleTranscriptionStart = () => {
    setVoiceTranscribing(true);
    // Show combined view while transcription runs
    setStep(STEP_RECIPIENTS);
  };

  const handleTranscriptionError = () => {
    setVoiceTranscribing(false);
    // Return to recorder so user can retry
    setStep(STEP_RECORD);
  };

  const isImageFile = (file) => {
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('image/') || IMAGE_FILE_EXTENSION_RE.test(name);
  };

  const loadImageForCompression = async (file, objectUrl) => {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        return {
          width: bitmap.width || 0,
          height: bitmap.height || 0,
          draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
          dispose: () => bitmap.close?.(),
        };
      } catch {
        // Fallback to HTMLImageElement decoding when ImageBitmap is unavailable.
      }
    }

    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to load image for compression'));
      img.src = objectUrl;
    });

    return {
      width: image.naturalWidth || image.width || 0,
      height: image.naturalHeight || image.height || 0,
      draw: (ctx, w, h) => ctx.drawImage(image, 0, 0, w, h),
      dispose: () => {},
    };
  };

  const convertImageToWebP = async (file) => {
    const url = URL.createObjectURL(file);
    let imageSource = null;
    try {
      imageSource = await loadImageForCompression(file, url);
      const initialWidth = Number(imageSource?.width || 0);
      const initialHeight = Number(imageSource?.height || 0);
      if (!initialWidth || !initialHeight) {
        throw new Error('Unable to process image dimensions');
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to process image');

      const renderToBlob = async (w, h, q) => {
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        imageSource.draw(ctx, w, h);
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', q));
      };

      const maxDim = 1600;
      let width = initialWidth;
      let height = initialHeight;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      let quality = 0.82;
      let blob = await renderToBlob(width, height, quality);
      while (blob && blob.size > MAX_PHOTO_BYTES && quality > 0.22) {
        quality -= 0.08;
        blob = await renderToBlob(width, height, quality);
      }

      while (blob && blob.size > MAX_PHOTO_BYTES && (width > 640 || height > 640)) {
        width = Math.max(640, Math.round(width * 0.82));
        height = Math.max(640, Math.round(height * 0.82));
        quality = Math.min(quality, 0.6);
        blob = await renderToBlob(width, height, quality);
        while (blob && blob.size > MAX_PHOTO_BYTES && quality > 0.18) {
          quality -= 0.07;
          blob = await renderToBlob(width, height, quality);
        }
      }

      while (blob && blob.size > MAX_PHOTO_BYTES && (width > 320 || height > 320)) {
        width = Math.max(320, Math.round(width * 0.78));
        height = Math.max(320, Math.round(height * 0.78));
        quality = Math.min(quality, 0.48);
        blob = await renderToBlob(width, height, quality);
      }

      if (!blob) throw new Error('Unable to compress image');
      if (blob.size > MAX_PHOTO_BYTES) {
        throw new Error('Photo is still above 2MB after compression. Try another photo.');
      }
      return { blob, width, height };
    } finally {
      try {
        imageSource?.dispose?.();
      } catch {
        // Ignore cleanup failures.
      }
      URL.revokeObjectURL(url);
    }
  };

  const captureVideoThumbnail = async (file) => {
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = url;

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Unable to load video'));
      });

      const targetTime = Math.min(1, Math.max(0, (video.duration || 0) / 2));
      await new Promise((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error('Unable to process video'));
        video.currentTime = targetTime;
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 180;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to process video');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const thumbBlob = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.8)
      );
      if (!thumbBlob) throw new Error('Unable to capture video thumbnail');
      return URL.createObjectURL(thumbBlob);
    } finally {
      try { URL.revokeObjectURL(url); } catch (_) {
        reportCaughtError(_, 'AddNoteModal', 'swallow-only try/catch at L1227');
      }
    }
  };

  const extractPdfTextFromFile = async (file) => {
    if (pdfjsLib.GlobalWorkerOptions && !pdfWorkerSetupRef.current) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
      pdfWorkerSetupRef.current = true;
    }
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const parts = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const strings = content.items.map((i) => i.str).join(' ');
      parts.push(strings);
    }
    return { text: parts.join('\n').trim(), pageCount: pdf.numPages };
  };

  const runPdfSuggestions = async (text, pageCount, fileName) => {
    const payload = { extractedText: text, pageCount, fileName };
    const suggestFn = httpsCallable(cloudFunctions, 'suggestPdfTitle');
    const essenceFn = httpsCallable(cloudFunctions, 'extractPdfEssence');
    setPdfTitleLoading(true);
    setPdfEssenceLoading(true);
    const [titleRes, essenceRes] = await Promise.allSettled([
      suggestFn(payload),
      essenceFn(payload)
    ]);
    if (titleRes.status === 'fulfilled' && titleRes.value?.data?.title) {
      setPdfTitle(titleRes.value.data.title);
    } else {
      notify.warning('Could not suggest a title automatically.');
    }
    if (essenceRes.status === 'fulfilled' && essenceRes.value?.data?.essence_text) {
      setPdfEssence(essenceRes.value.data.essence_text);
    } else {
      notify.warning('Could not generate a summary automatically.');
    }
    setPdfTitleLoading(false);
    setPdfEssenceLoading(false);
  };

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const runHandwritingDetection = async (items) => {
    const photoItems = items.filter((it) => it.kind === 'photo' && it.source?.blob);
    if (photoItems.length === 0) return;
    setHandwritingDetectionLoading(true);

    const vlmFn = httpsCallable(cloudFunctions, 'detectHandwritingVLM');
    const results = await Promise.allSettled(
      photoItems.map(async (item) => {
        try {
          const imageBase64 = await blobToBase64(item.source.blob);
          const res = await vlmFn({ imageBase64, contentType: item.source.contentType || 'image/webp' });
          return { itemId: item.id, handwritten: res.data?.handwritten === true };
        } catch (err) {
          err.itemId = item.id;
          throw err;
        }
      })
    );
    const updates = {};
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        updates[r.value.itemId] = r.value.handwritten;
      } else if (r.status === 'rejected') {
        handwritingDetectionFailedRef.current.add(r.reason?.itemId);
      }
    });
    setMediaItems((prev) => prev.map((it) => (it.id in updates ? { ...it, handwritten: updates[it.id] } : it)));
    if (Object.keys(updates).length < photoItems.length) {
      notify.warning('Could not detect handwriting for some photos.');
    }
    setHandwritingDetectionLoading(false);
  };

  const createMediaItemId = () =>
    `media_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  const handlePdfFileChosen = async (file) => {
    if (!file) return;
    setMediaDirty(true);
    setMediaError('');
    try {
      if (!(file.type?.includes('pdf') || file.name?.toLowerCase().endsWith('.pdf'))) {
        notify.error('Please select a PDF file.');
        return;
      }
      setPdfTitle('');
      setPdfEssence('');
      setPdfExtractedText('');
      setPdfPageCount(null);
      setPdfSource({
        file,
        size: file.size,
        contentType: 'application/pdf',
        extension: 'pdf',
        originalName: file.name
      });
      setPdfDisplayName(file.name);
      setPdfNameEditing(false);
      const { text, pageCount } = await extractPdfTextFromFile(file);
      setPdfExtractedText(text);
      setPdfPageCount(pageCount);
      runPdfSuggestions(text, pageCount, file.name).catch((error) => { reportCaughtError(error, 'AddNoteModal', 'empty promise catch at L1314'); });
    } catch (err) {
      setMediaError(err?.message || 'Could not process file');
      notify.error(err?.message || 'Could not process file');
    }
  };

  const handleMediaFilesChosen = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setMediaDirty(true);
    setMediaError('');
    const nextItems = [];
    const files = Array.from(fileList);

    for (const file of files) {
      try {
        if (file.type === 'video/mp4' || file.name?.toLowerCase().endsWith('.mp4')) {
          let previewUrl = '';
          try {
            previewUrl = await captureVideoThumbnail(file);
          } catch (err) {
            reportCaughtError(err, 'AddNoteModal', 'swallow-only try/catch at L1322');
          }
          nextItems.push({
            id: createMediaItemId(),
            kind: 'video',
            source: {
              file,
              size: file.size,
              contentType: 'video/mp4',
              extension: 'mp4',
              originalName: file.name
            },
            previewUrl,
            teacherComment: ''
          });
          continue;
        }

        if (!isImageFile(file)) {
          notify.error('Please choose images or mp4 videos only.');
          setMediaError('Please choose images or mp4 videos only.');
          continue;
        }

        const { blob, width, height } = await convertImageToWebP(file);
        const previewUrl = URL.createObjectURL(blob);
        nextItems.push({
          id: createMediaItemId(),
          kind: 'photo',
          source: {
            blob,
            size: blob.size,
            width,
            height,
            contentType: 'image/webp',
            extension: 'webp',
            originalName: file.name
          },
          previewUrl,
          teacherComment: ''
        });
      } catch (err) {
        setMediaError(err?.message || 'Could not process file');
        notify.error(err?.message || 'Could not process file');
      }
    }

    if (nextItems.length > 0) {
      setMediaItems((prev) => [...prev, ...nextItems]);
    }
  };

  const handleRemoveMediaItem = (itemId) => {
    setMediaItems((prev) => {
      const target = prev.find((item) => item.id === itemId);
      if (target) revokeMediaPreview(target);
      return prev.filter((item) => item.id !== itemId);
    });
    clearMediaItemPolishState(itemId);
    setMediaDirty(true);
  };

  const handleMediaItemCommentChange = (itemId, value) => {
    setMediaItems((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, teacherComment: value } : item
    )));
    setMediaDirty(true);
  };

  const handleToggleCopied = (itemId) => {
    setMediaItems((prev) => prev.map((item) => (
      item.id === itemId ? { ...item, copied: !item.copied } : item
    )));
    setMediaDirty(true);
  };

  const handlePolishMediaItemComment = async (itemId) => {
    const item = mediaItems.find((entry) => entry.id === itemId);
    const currentComment = String(item?.teacherComment || '');
    if (!item || !currentComment.trim() || mediaItemCommentCleaning[itemId] || mediaItemCommentCleanedOnce[itemId]) {
      return;
    }
    try {
      trackEvent('polish_click', {
        source: 'media_comment',
        component: 'AddNoteModal.MediaItemComment',
        length_bucket: lengthBucket(currentComment.length),
      });

      const t0 = performance.now();
      setMediaItemCommentCleaning((prev) => ({ ...prev, [itemId]: true }));
      setMediaItemCommentPrevText((prev) => ({ ...prev, [itemId]: currentComment }));
      const refined = await cleanUpText(currentComment).catch(() => null);
      if (refined) {
        handleMediaItemCommentChange(itemId, String(refined).trim());
        setMediaItemCommentCleanedOnce((prev) => ({ ...prev, [itemId]: true }));
      } else {
        setMediaItemCommentCleanedOnce((prev) => ({ ...prev, [itemId]: false }));
      }
      const dt = Math.round(performance.now() - t0);
      trackEvent('polish_success', {
        source: 'media_comment',
        component: 'AddNoteModal.MediaItemComment',
        length_bucket: lengthBucket(currentComment.length),
        latency_ms: dt,
      });
    } catch (_) {
      trackEvent('polish_error', {
        source: 'media_comment',
        component: 'AddNoteModal.MediaItemComment',
        length_bucket: lengthBucket(currentComment.length),
        error: 'cleanup_failed',
      });
    } finally {
      setMediaItemCommentCleaning((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const handleUndoPolishMediaItemComment = (itemId) => {
    const previousText = mediaItemCommentPrevText[itemId];
    if (!previousText) return;
    handleMediaItemCommentChange(itemId, previousText);
    setMediaItemCommentPrevText((prev) => ({ ...prev, [itemId]: '' }));
    setMediaItemCommentCleanedOnce((prev) => ({ ...prev, [itemId]: false }));
    trackEvent('polish_undo', {
      source: 'media_comment',
      component: 'AddNoteModal.MediaItemComment',
      length_bucket: lengthBucket(previousText.length),
    });
  };

  const handlePolishMediaPdfComment = async () => {
    const currentComment = String(mediaTeacherComment || '');
    if (!currentComment.trim() || mediaPdfCommentCleaning || mediaPdfCommentCleanedOnce) return;
    try {
      trackEvent('polish_click', {
        source: 'media_comment',
        component: 'AddNoteModal.MediaPdfComment',
        length_bucket: lengthBucket(currentComment.length),
      });

      const t0 = performance.now();
      setMediaPdfCommentCleaning(true);
      setMediaPdfCommentPrevText(currentComment);
      const refined = await cleanUpText(currentComment).catch(() => null);
      if (refined) {
        handleMediaTeacherCommentChange(String(refined).trim());
        setMediaPdfCommentCleanedOnce(true);
      } else {
        setMediaPdfCommentCleanedOnce(false);
      }
      const dt = Math.round(performance.now() - t0);
      trackEvent('polish_success', {
        source: 'media_comment',
        component: 'AddNoteModal.MediaPdfComment',
        length_bucket: lengthBucket(currentComment.length),
        latency_ms: dt,
      });
    } catch (_) {
      trackEvent('polish_error', {
        source: 'media_comment',
        component: 'AddNoteModal.MediaPdfComment',
        length_bucket: lengthBucket(currentComment.length),
        error: 'cleanup_failed',
      });
    } finally {
      setMediaPdfCommentCleaning(false);
    }
  };

  const handleUndoPolishMediaPdfComment = () => {
    if (!mediaPdfCommentPrevText) return;
    handleMediaTeacherCommentChange(mediaPdfCommentPrevText);
    setMediaPdfCommentPrevText('');
    setMediaPdfCommentCleanedOnce(false);
    trackEvent('polish_undo', {
      source: 'media_comment',
      component: 'AddNoteModal.MediaPdfComment',
      length_bucket: lengthBucket(mediaPdfCommentPrevText.length),
    });
  };

  const handleCreateMediaNote = async () => {
    const isPdf = mediaMode === 'pdf';
    const hasMedia = isPdf ? !!pdfSource : mediaItems.length > 0;
    if (!hasMedia) {
      notify.warning(isPdf ? 'Choose a PDF first.' : 'Choose one or more photos/videos first.');
      return;
    }
    if (mediaUploading) return;
    if (!selectedStudents || selectedStudents.length === 0) {
      notify.warning('Select at least one student.');
      return;
    }
    if (!currentUser?.uid) {
      notify.error('Your session expired. Please sign in again and retry.');
      return;
    }

    setSaving(true);
    setMediaUploading(true);

    const batchId = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const itemsToUpload = isPdf
      ? [{
          id: 'pdf',
          kind: 'pdf',
          source: pdfSource,
          displayName: pdfDisplayName,
          teacherComment: mediaTeacherComment
        }]
      : mediaItems;
    const studentsToUpload = [...selectedStudents];

    const queueEntries = [];
    studentsToUpload.forEach((studentId) => {
      itemsToUpload.forEach((item) => {
        if (!item?.source) return;
        const mediaLabel = item.kind === 'pdf' ? 'PDF upload' : item.kind === 'video' ? 'Video upload' : 'Photo upload';
        queueEntries.push({
          kind: 'media',
          studentId,
          groupId: batchId,
          title: mediaLabel,
          summary: item.source?.originalName || '',
          persistent: false,
          maxAttempts: 2,
          payload: {
            studentId,
            mediaKind: item.kind,
            source: item.source,
            displayName: item.displayName || '',
            teacherComment: item.teacherComment || '',
            batchId,
            pdfTitle: item.kind === 'pdf' ? String(pdfTitle || '').trim() : '',
            pdfEssence: item.kind === 'pdf' ? String(pdfEssence || '').trim() : '',
            ...(item.kind === 'photo' ? { copied: item.copied === true, handwritten: item.handwritten === true } : {}),
            createdBy: currentUser.uid,
            createdByName: currentUser?.displayName || 'Unknown Teacher',
            createdByEmail: currentUser?.email || 'unknown@email.com',
          }
        });
      });
    });

    if (queueEntries.length === 0) {
      setSaving(false);
      setMediaUploading(false);
      notify.error('No media items were selected. Please re-select files and retry.');
      return;
    }

    enqueueSaveQueueItems(queueEntries);

    notify.success('Media saving in the background — you may continue your work', {
      duration: 4000,
    });

    setSaving(false);
    setMediaUploading(false);
    handleClose();
  };

  const saveNote = async (coachResult = null) => {
    const noteData = transcriptionData || textData;
    if (!noteData) {
      notify.warning('No note data available. Please try again.');
      return;
    }
    const textToSave = String(coachResult?.updated_text || noteData.text || '').trim();
    if (!textToSave) {
      notify.warning('Please add note content before saving.');
      return;
    }
    if (!currentUser?.uid) {
      notify.error('Your session expired. Please sign in again and retry.');
      return;
    }

    const normalizedSelectedLessonIds = Array.from(new Set(selectedLessonIds || []));
    const selectedLessonObjects = lessonNotes.filter((n) =>
      normalizedSelectedLessonIds.includes(n.id)
    );

    const canTagLesson = (
      selectedStudents.length === 1 &&
      normalizedSelectedLessonIds.length > 0 &&
      selectedLessonObjects.length === normalizedSelectedLessonIds.length &&
      (isAdminUser || selectedLessonObjects.every((n) => n.createdBy && n.createdBy === currentUser?.uid))
    );
    const taggedLessonIds = canTagLesson ? normalizedSelectedLessonIds : [];

    try {
      setSaving(true);
      const groupId = selectedStudents.length > 1
        ? `group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        : undefined;

      const coachPayload = coachResult?.coachData
        ? {
            status: coachResult.coachData.status || 'ok',
            reason: coachResult.coachData.reason || 'none',
            nudgesShown: coachResult.coachData.nudgesShown || [],
            ...(coachResult?.selections && Object.keys(coachResult.selections).length > 0
              ? { selections: coachResult.selections }
              : {}),
          }
        : null;

      const queueEntries = selectedStudents.map((studentId) => ({
        kind: 'text_voice',
        studentId,
        groupId: groupId || null,
        title: transcriptionData ? 'Voice note save' : 'Text note save',
        summary: textToSave.slice(0, 120),
        payload: {
          studentId,
          noteType: transcriptionData ? 'voice' : 'text',
          text: textToSave,
          createdBy: currentUser.uid,
          createdByName: currentUser?.displayName || 'Unknown Teacher',
          createdByEmail: currentUser?.email || 'unknown@email.com',
          ...(groupId ? { groupId } : {}),
          ...(canTagLesson ? { linkedLessonObservationId: taggedLessonIds } : {}),
          ...(canTagLesson && taggedLessonIds.length > 0 ? { lessonBacklinkIds: taggedLessonIds } : {}),
          ...(transcriptionData && typeof transcriptionData.duration === 'number'
            ? { durationSec: transcriptionData.duration }
            : {}),
          ...(transcriptionData && typeof transcriptionData.sttConfidence === 'number'
            ? { sttConfidence: transcriptionData.sttConfidence }
            : {}),
          ...(transcriptionData && transcriptionData.detectedLanguage != null && transcriptionData.detectedLanguage !== ''
            ? { detectedLanguage: transcriptionData.detectedLanguage }
            : {}),
          ...(coachPayload ? { coach: coachPayload } : {}),
        },
      }));

      if (queueEntries.length === 0) {
        notify.warning('Select at least one student.');
        return;
      }

      enqueueSaveQueueItems(queueEntries);

      notify.success('Note saving in the background — you may continue your work', {
        duration: 4000,
      });
      handleClose();
    } catch {
      notify.error('Unable to start note save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecipientsNext = async () => {
    const noteData = transcriptionData || textData;
    if (!noteData) {
      notify.warning('No note data available. Please try again.');
      return;
    }

    const programIds = await getSelectedProgramIds(selectedStudents);
    if (programIds.length !== 1) {
      await saveNote(null);
      return;
    }
    const programId = programIds[0];
    const enabled = await isCoachEnabledForProgram(programId);
    if (!enabled) {
      await saveNote(null);
      return;
    }

    coachProgramContextRef.current = { programId };
    const noteType = noteData === transcriptionData ? 'voice' : 'text';
    const signature = buildCoachSignature(noteData, selectedStudents, noteType);

    // If nothing changed and nudges already exist, reuse without rerun
    if (lastCoachSignatureRef.current === signature && coachNudges.length > 0) {
      setCoachLoading(false);
      setCoachLoadingMessage('');
      setStep(STEP_COACH);
      return;
    }

    setStep(STEP_COACH);
    const coachResult = await runCoachReview(noteData.text, signature).catch(() => ({ skipped: true }));
    if (!coachResult) return; // cancelled or superseded
    if (coachResult.skipped) {
      // If perfect note (no nudges), show success message then auto-save after delay
      if (coachResult.perfectNote) {
        // Wait 2.5 seconds to show the success message, then save and close
        setTimeout(async () => {
          await saveNote(coachResult);
        }, 2500);
        return;
      }
      // Otherwise (timeout/error), save immediately
      await saveNote(coachResult);
      return;
    }
    // Otherwise stay on Coach step for user action
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
                } else if (step === STEP_COACH) {
                  handleCoachBack();
                } else if (step === STEP_RECIPIENTS) {
                  // Go back to previous step based on how we got here
                  if (textData) {
                    setStep(STEP_TEXT_INPUT);
                  } else if (transcriptionData) {
                    setStep(STEP_RECORD);
                  } else {
                    setStep(STEP_NOTE_TYPE);
                  }
                } else if (step === STEP_MEDIA) {
                  setStep(STEP_NOTE_TYPE);
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
              {/* Available note types for creation */}
              {/* Voice Note */}
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
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  '&:hover': { 
                    backgroundColor: '#f8fafc',
                    border: '1px solid #4f46e5'
                  }
                }}
                onClick={handleSelectLesson}
                aria-label="Add lesson note"
              >
                <MenuBook sx={{ fontSize: 32, color: '#4f46e5' }} />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="body1" sx={{ color: '#1e293b' }}>
                      Lesson Note
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Structured lesson observation
                  </Typography>
                </Box>
              </Box>
              {/* Media Note */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  border: '1px solid',
                  borderColor: 'divider',
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
                onClick={() => handleSelectMedia('photo')}
                aria-label="Add media note"
              >
                <PhotoLibrary sx={{ fontSize: 32, color: '#4f46e5' }} />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                    <Typography variant="body1" sx={{ color: '#1e293b' }}>
                      Media Note
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Attach photos, videos, or PDFs
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        )}

        {step === STEP_MEDIA && (
          <Box
            sx={{
              p: 2,
              pt: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              pb: 1.5
            }}
          >
            <input
              key={mediaMode}
              ref={mediaFileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept={mediaMode === 'pdf' ? 'application/pdf' : 'image/*,video/mp4'}
              multiple={mediaMode !== 'pdf'}
              onChange={(e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                if (mediaMode === 'pdf') {
                  handlePdfFileChosen(files[0]);
                } else {
                  handleMediaFilesChosen(files);
                }
                e.target.value = '';
              }}
            />
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant={mediaMode === 'pdf' ? 'outlined' : 'contained'}
                      onClick={() => {
                        resetMediaState();
                        setMediaMode('photo');
                      }}
                    >
                      Photo / Video
                    </Button>
                    <Button
                      variant={mediaMode === 'pdf' ? 'contained' : 'outlined'}
                      onClick={() => {
                        resetMediaState();
                        setMediaMode('pdf');
                      }}
                    >
                      PDF
                    </Button>
                  </Box>
                </Box>

                <Box
                  sx={{
                    border: '1px dashed #cbd5e1',
                    borderRadius: 2,
                    p: 2,
                    minHeight: 140,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 1,
                    backgroundColor: '#f8fafc',
                    cursor: 'pointer',
                  }}
                  onClick={() => mediaFileInputRef.current?.click()}
                >
                  {mediaMode === 'pdf' ? (
                    pdfSource ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                          {pdfNameEditing ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <TextField
                                size="small"
                                value={getPdfBaseName(pdfDisplayName || pdfSource.originalName || '')}
                                onChange={(e) => {
                                  setPdfDisplayName(buildPdfName(e.target.value));
                                  setMediaDirty(true);
                                }}
                                onBlur={() => setPdfNameEditing(false)}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => e.stopPropagation()}
                                autoFocus
                                sx={{ width: 200 }}
                              />
                              <Typography variant="body2" color="text.disabled">
                                .pdf
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {pdfDisplayName || pdfSource.originalName || 'PDF'}
                            </Typography>
                          )}
                          <IconButton
                            size="small"
                            aria-label={pdfNameEditing ? 'Save file name' : 'Edit file name'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPdfNameEditing((prev) => !prev);
                            }}
                          >
                            {pdfNameEditing ? <CheckCircle sx={{ fontSize: 18 }} /> : <Edit sx={{ fontSize: 18 }} />}
                          </IconButton>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {pdfPageCount ? `${pdfPageCount} page${pdfPageCount > 1 ? 's' : ''}` : 'Ready to upload'}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CloudUpload sx={{ fontSize: 14, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">
                            Tap to upload another PDF.
                          </Typography>
                        </Box>
                      </Box>
                    ) : (
                      <>
                        <PhotoLibrary sx={{ fontSize: 32, color: '#4f46e5' }} />
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          Click to choose a file
                        </Typography>
                        <Typography variant="caption" color="text.secondary" align="center">
                          Upload a PDF to get title & summary suggestions.
                        </Typography>
                      </>
                    )
                  ) : (
                    mediaItems.length > 0 ? (
                      <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1 }}>
                          {mediaItems.map((item) => (
                            <Box
                              key={item.id}
                              sx={{
                                borderRadius: 2,
                                border: '1px solid',
                                borderColor: 'divider',
                                backgroundColor: 'background.paper',
                                overflow: 'hidden',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Box
                                sx={{
                                  position: 'relative',
                                  width: '100%',
                                  aspectRatio: '1 / 1',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: 'background.default'
                                }}
                              >
                                {item.previewUrl ? (
                                  <Box
                                    component="img"
                                    src={item.previewUrl}
                                    alt={item.source.originalName || (item.kind === 'photo' ? 'Photo' : 'Video')}
                                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <Movie color="primary" />
                                )}
                                <IconButton
                                  size="small"
                                  aria-label="Remove file"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveMediaItem(item.id);
                                  }}
                                  sx={{
                                    position: 'absolute',
                                    top: 4,
                                    right: 4,
                                    backgroundColor: 'background.paper'
                                  }}
                                >
                                  <Close sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Box>
                              <Box sx={{ p: 1 }}>
                                {item.kind === 'photo' && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                    <ToggleButtonGroup
                                      value={item.copied ? 'copied' : 'original'}
                                      exclusive
                                      onChange={() => handleToggleCopied(item.id)}
                                      size="small"
                                      sx={{
                                        height: 30,
                                        '& .MuiToggleButton-root': {
                                          textTransform: 'none',
                                          fontSize: '0.7rem',
                                          fontWeight: 600,
                                          px: 1.2,
                                          py: 0,
                                          gap: 0.5,
                                          border: '1px solid',
                                          borderColor: 'divider',
                                          '&.Mui-selected': {
                                            color: '#fff',
                                          },
                                        },
                                      }}
                                    >
                                      <ToggleButton
                                        value="original"
                                        sx={{
                                          borderRadius: '16px 0 0 16px !important',
                                          '&.Mui-selected': {
                                            bgcolor: 'success.main',
                                            '&:hover': { bgcolor: 'success.dark' },
                                          },
                                        }}
                                      >
                                        <Brush sx={{ fontSize: 14 }} />
                                        Own work
                                      </ToggleButton>
                                      <ToggleButton
                                        value="copied"
                                        sx={{
                                          borderRadius: '0 16px 16px 0 !important',
                                          '&.Mui-selected': {
                                            bgcolor: 'warning.main',
                                            '&:hover': { bgcolor: 'warning.dark' },
                                          },
                                        }}
                                      >
                                        <ContentCopy sx={{ fontSize: 14 }} />
                                        Copied
                                      </ToggleButton>
                                    </ToggleButtonGroup>
                                    {handwritingDetectionLoading && item.handwritten === undefined ? (
                                      <CircularProgress size={14} sx={{ color: '#7c3aed' }} />
                                    ) : item.handwritten === true ? (
                                      <Chip label="Handwritten" size="small" color="info" variant="outlined" />
                                    ) : null}
                                  </Box>
                                )}
                                <TextField
                                  label="Comment (optional)"
                                  value={item.teacherComment || ''}
                                  onChange={(e) => handleMediaItemCommentChange(item.id, e.target.value)}
                                  fullWidth
                                  multiline
                                  minRows={2}
                                  placeholder="Add context for this file"
                                />
                                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Button
                                    variant="contained"
                                    onClick={() => handlePolishMediaItemComment(item.id)}
                                    disabled={
                                      !String(item.teacherComment || '').trim() ||
                                      !!mediaItemCommentCleaning[item.id] ||
                                      !!mediaItemCommentCleanedOnce[item.id]
                                    }
                                    startIcon={mediaItemCommentCleaning[item.id]
                                      ? <CircularProgress size={16} color="inherit" />
                                      : <AutoFixHigh />}
                                    sx={{ ...POLISH_BUTTON_SX, py: 0.5 }}
                                  >
                                    {mediaItemCommentCleanedOnce[item.id]
                                      ? 'Polished'
                                      : (mediaItemCommentCleaning[item.id] ? 'Polishing…' : 'Polish with AI')}
                                  </Button>
                                  {mediaItemCommentCleanedOnce[item.id] && mediaItemCommentPrevText[item.id] && (
                                    <Button
                                      variant="text"
                                      onClick={() => handleUndoPolishMediaItemComment(item.id)}
                                      sx={{ color: '#64748b', textTransform: 'none', minWidth: 'auto', px: 1 }}
                                    >
                                      Undo
                                    </Button>
                                  )}
                                </Box>
                              </Box>
                            </Box>
                          ))}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                          <CloudUpload sx={{ fontSize: 14, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">
                            Tap to add more photos/videos.
                          </Typography>
                        </Box>
                      </Box>
                    ) : (
                      <>
                        <PhotoLibrary sx={{ fontSize: 32, color: '#4f46e5' }} />
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          Click to choose files
                        </Typography>
                        <Typography variant="caption" color="text.secondary" align="center">
                          Upload photos or videos.
                        </Typography>
                      </>
                    )
                  )}
                </Box>


                {mediaError && (
                  <Alert severity="error" onClose={() => setMediaError('')}>
                    {mediaError}
                  </Alert>
                )}

                {mediaMode === 'pdf' && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      label="PDF Title"
                      value={pdfTitle}
                      onChange={(e) => {
                        setPdfTitle(e.target.value);
                        setMediaDirty(true);
                      }}
                      fullWidth
                    />
                    <TextField
                      label="Essence (2-3 sentences)"
                      value={pdfEssence}
                      onChange={(e) => {
                        setPdfEssence(e.target.value);
                        setMediaDirty(true);
                      }}
                      fullWidth
                      multiline
                      minRows={3}
                    />
                    <TextField
                      label="Teacher comment (optional)"
                      value={mediaTeacherComment}
                      onChange={(e) => handleMediaTeacherCommentChange(e.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                      inputRef={mediaCommentRef}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label="Dictate teacher comment"
                              onClick={openMediaDictation}
                              color="primary"
                              size="small"
                              sx={{
                                border: 1,
                                borderColor: 'divider',
                                bgcolor: 'action.hover'
                              }}
                            >
                              <Mic fontSize="small" />
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Button
                        variant="contained"
                        onClick={handlePolishMediaPdfComment}
                        disabled={!mediaTeacherComment.trim() || mediaPdfCommentCleaning || mediaPdfCommentCleanedOnce}
                        startIcon={mediaPdfCommentCleaning ? <CircularProgress size={16} color="inherit" /> : <AutoFixHigh />}
                        sx={POLISH_BUTTON_SX}
                      >
                        {mediaPdfCommentCleanedOnce ? 'Polished' : (mediaPdfCommentCleaning ? 'Polishing…' : 'Polish with AI')}
                      </Button>
                      {mediaPdfCommentCleanedOnce && mediaPdfCommentPrevText && (
                        <Button
                          variant="text"
                          onClick={handleUndoPolishMediaPdfComment}
                          sx={{ color: '#64748b', textTransform: 'none', minWidth: 'auto', px: 1 }}
                        >
                          Undo
                        </Button>
                      )}
                    </Box>
                  </Box>
                )}

                {null}
              </Box>

              <Box sx={{ flex: 1, minHeight: { xs: 'auto', md: 320 } }}>
                <ClassroomStudentPicker
                  selectedStudents={selectedStudents}
                  onStudentsChange={handleStudentsChange}
                  currentUser={currentUser}
                  userRole={userRole}
                  disabledStudentIds={[]}
                  textData={null}
                  voiceData={null}
                />
              </Box>
            </Box>

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
                pt: 1.5,
                borderTop: '1px solid #e2e8f0',
                backgroundColor: 'white',
                position: 'sticky',
                bottom: 0,
                mt: 0.5
              }}
            >
              <Button
                variant="outlined"
                onClick={() => requestClose('media-cancel')}
                disabled={saving || mediaUploading}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleCreateMediaNote}
                disabled={
                  saving ||
                  mediaUploading ||
                  (mediaMode === 'pdf' ? !pdfSource : mediaItems.length === 0) ||
                  selectedStudents.length === 0
                }
              >
                Create Media Note
              </Button>
            </Box>
          </Box>
        )}

        {(step === STEP_RECORD || voiceTranscribing) && (
          <Box
            sx={{
              p: step === STEP_RECORD ? 3 : 0,
              pt: step === STEP_RECORD ? 1 : 0,
              flex: 1,
              display: step === STEP_RECORD ? 'block' : 'none'
            }}
          >
            <VoiceRecorder 
              onSave={handleVoiceSave} 
              onNext={() => setStep(STEP_RECIPIENTS)}
              onDirtyChange={setVoiceDirty}
              exposeControls={(controls) => { voiceControlsRef.current = controls; }}
              variant="cardless"
              autoAdvanceOnSave
              onTranscriptionStart={handleTranscriptionStart}
              onTranscriptionError={handleTranscriptionError}
            />
          </Box>
        )}

        {step === STEP_TEXT_INPUT && (
          <Box sx={{ p: 3, pt: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <TextInput 
              onSave={handleTextSave} 
              onNext={() => setStep(STEP_RECIPIENTS)}
              onDirtyChange={setTextDirty}
              initialText={textData?.text || ''}
              initialTags={mentionedStudents}
              mentionableStudents={mentionableStudents}
              onTagsChange={setMentionedStudents}
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
                voiceData={transcriptionData}
                onVoiceDataChange={setTranscriptionData}
                onVoiceRecordAgain={handleVoiceRecordAgain}
                voiceLoading={voiceTranscribing}
                suggestedStudents={transcriptSuggestions}
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
              {selectedLessonIds && selectedLessonIds.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 600 }}>
                    Tagged Lesson Notes:
                  </Typography>
                  {selectedLessonIds.map((id) => {
                    const note = lessonNotes.find((n) => n.id === id);
                    const label = note?.lessonTitle || 'Lesson Note';
                    return (
                      <Chip
                        key={id}
                        label={label}
                        onDelete={() => {
                          setSelectedLessonIds((prev) => prev.filter((x) => x !== id));
                        }}
                        color="primary"
                        variant="outlined"
                      />
                    );
                  })}
                  <Button
                    size="small"
                    variant="text"
                    onClick={handleClearLessonTag}
                    sx={{ textTransform: 'none', ml: 0.5 }}
                  >
                    Clear all
                  </Button>
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

        {step === STEP_COACH && (
          <Box
            sx={{
              p: 3,
              pt: 1,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 'fit-content'
            }}
          >
            {coachLoading ? (
              <Box
                sx={{
                  flex: 1,
                  minHeight: 320,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2
                }}
              >
                <CircularProgress />
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                  {coachLoadingMessage || 'Coach Pepper is analyzing your note!'}
                </Typography>
              </Box>
            ) : coachPerfectNote ? (
              <Box
                sx={{
                  flex: 1,
                  minHeight: 320,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <ConfettiAnimation />
                <Typography 
                  variant="h6" 
                  sx={{ 
                    textAlign: 'center', 
                    color: '#059669',
                    fontWeight: 600,
                    position: 'relative',
                    zIndex: 2
                  }}
                >
                  {coachLoadingMessage || 'Coach Pepper thinks this is a perfect note!'}
                </Typography>
                <Typography 
                  variant="body2" 
                  color="text.secondary" 
                  sx={{ 
                    textAlign: 'center',
                    position: 'relative',
                    zIndex: 2
                  }}
                >
                  Saving your note...
                </Typography>
              </Box>
            ) : (
              <Box sx={{ position: 'relative' }}>
                <CoachNudge
                  noteText={(transcriptionData || textData)?.text || ''}
                  onSkip={handleCoachSkip}
                  onApply={handleCoachApply}
                  forcedNudges={coachNudges.map(n => n.id)}
                  maxNudges={coachData?.maxNudges}
                  initialSelections={coachSelections}
                  onSelectionsChange={setCoachSelections}
                />
              </Box>
            )}
          </Box>
        )}

      </Box>
      {/* Tag lesson note dialog */}
      <LessonNoteTagDialog
        open={tagDialogOpen}
        onClose={() => setTagDialogOpen(false)}
        title={`Tag lesson notes${tagStudentName ? ` for ${tagStudentName}` : ''}`}
        lessonNotes={lessonNotes}
        lessonNotesLoading={lessonNotesLoading}
        lessonNotesError={lessonNotesError}
        onLessonNotesErrorClear={() => setLessonNotesError('')}
        lessonSearch={lessonSearch}
        onLessonSearchChange={setLessonSearch}
        currentUser={currentUser}
        userRole={userRole}
        selectedLessonIds={selectedLessonIds}
        onSelectionChange={setSelectedLessonIds}
        saving={lessonNotesLoading}
      />
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
      {/* PDF processing dialog */}
      <Dialog
        open={step === STEP_MEDIA && mediaMode === 'pdf' && (pdfTitleLoading || pdfEssenceLoading)}
        maxWidth="xs"
        fullWidth
      >
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress />
          <Typography variant="h6" sx={{ textAlign: 'center' }}>
            Coach Pepper is scanning your PDF
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            This takes a few seconds. We’ll fill in the title and summary when it’s ready.
          </Typography>
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

      {/* Media teacher comment dictation dialog */}
      <Dialog
        open={mediaDictationOpen}
        onClose={closeMediaDictation}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden'
          }
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1.5, py: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Dictate teacher comment
          </Typography>
          <IconButton aria-label="Close dictation" onClick={closeMediaDictation}>
            <Close />
          </IconButton>
        </Box>
        <Divider />
        <Box sx={{ p: 2 }}>
          <VoiceRecorder
            variant="cardless"
            onSave={handleMediaDictationSave}
            onNext={closeMediaDictation}
            autoAdvanceOnSave
          />
        </Box>
      </Dialog>
    </Dialog>
  );
}

export default AddNoteModal; 
