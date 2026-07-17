import { useCallback, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import {
  ChevronDown,
  Circle,
  CircleCheck as CheckCircle,
  Lightbulb,
  Mic,
  X,
} from '../icons';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import { trackEvent } from '../utils/analytics';
import NoteBottomSheet from './noteBottomSheet/NoteBottomSheet';

// ── Helpers ──

/**
 * Normalize areas from Firestore - handles both old string array format
 * and new enriched format. Returns enriched format always.
 */
function normalizeAreas(areas) {
  if (!areas || typeof areas !== 'object') return {};
  const out = {};
  for (const [area, questions] of Object.entries(areas)) {
    if (!Array.isArray(questions)) continue;
    out[area] = questions.map((q) =>
      typeof q === 'string' ? { question: q, status: 'pending' } : q,
    );
  }
  return out;
}

/**
 * Format a Firestore timestamp (or Date) into a short relative/absolute label.
 * Returns strings like "today", "1d ago", "3d ago", "12 Jun", "3 Jan 2025".
 */
function formatRelativeDate(ts) {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 1) return 'today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 7) return `${diffDays}d ago`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  if (year === now.getFullYear()) return `${day} ${month}`;
  return `${day} ${month} ${year}`;
}

// ── Question row ──

function QuestionRow({ q, index, area, onAnswer, onManualMark, onViewNote }) {
  const isAnswered = q.status === 'answered';

  return (
    <Box
      sx={{
        py: 1.5,
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      {/* Question text */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Box sx={{ pt: 0.25, flexShrink: 0 }}>
          {isAnswered ? (
            <CheckCircle size={18} style={{ color: 'var(--color-secondary)' }} />
          ) : (
            <Circle size={18} style={{ color: 'rgba(0,0,0,0.15)' }} />
          )}
        </Box>
        <Typography
          sx={{
            fontSize: '0.84rem',
            color: isAnswered ? 'var(--color-text-soft)' : 'var(--color-text)',
            lineHeight: 1.5,
            flex: 1,
          }}
        >
          {q.question}
        </Typography>
      </Box>

      {/* Action row - below question, indented to align with text */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.75, pl: 4.25 }}>
        {isAnswered ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: '0.7rem', color: 'var(--color-secondary)', fontWeight: 600 }}>
              Answered{q.answeredAt ? ` ${formatRelativeDate(q.answeredAt)}` : ''}{q.answeredBy?.name ? ` by ${q.answeredBy.name}` : ''}
            </Typography>
            {q.observationId && onViewNote && (
              <Box
                component="button"
                onClick={() => onViewNote()}
                sx={{
                  fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-primary)',
                  border: '1px solid rgba(79, 70, 229, 0.25)', borderRadius: '12px',
                  backgroundColor: 'rgba(79, 70, 229, 0.06)', px: 1, py: 0.25,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  '&:hover': { backgroundColor: 'rgba(79, 70, 229, 0.12)' },
                }}
              >
                View note
              </Box>
            )}
          </Box>
        ) : (
          <>
            <Button
              size="small"
              variant="contained"
              startIcon={<Mic size={13} />}
              onClick={() => onAnswer({ area, index, questionText: q.question })}
              sx={{
                fontSize: '0.72rem', textTransform: 'none', backgroundColor: 'var(--color-primary)',
                borderRadius: '14px', px: 1.5, py: 0.25, minHeight: 26, boxShadow: 'none',
                '&:hover': { boxShadow: 'none', backgroundColor: 'var(--color-primary)' },
              }}
            >
              Answer
            </Button>
            <Button
              size="small"
              onClick={() => onManualMark(area, index)}
              sx={{ fontSize: '0.68rem', textTransform: 'none', color: 'var(--color-text-faint)', minWidth: 'auto', px: 0.5, py: 0 }}
            >
              Mark answered
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}

// ── Area accordion ──

function AreaAccordion({ area, questions, onAnswer, onManualMark, onViewNote }) {
  const answered = questions.filter((q) => q.status === 'answered').length;
  const total = questions.length;
  const pct = total > 0 ? (answered / total) * 100 : 0;

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        backgroundColor: 'white',
        borderRadius: '12px !important',
        border: '1px solid rgba(0,0,0,0.08)',
        '&:before': { display: 'none' },
        mb: 1.5,
        overflow: 'hidden',
      }}
    >
      <AccordionSummary
        expandIcon={<ChevronDown size={18} />}
        sx={{
          px: 2,
          py: 0.5,
          minHeight: 52,
          '& .MuiAccordionSummary-content': { my: 0.75, flexDirection: 'column', gap: 0.5 },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', pr: 1 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
            {area}
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-soft)', flexShrink: 0 }}>
            {answered}/{total}
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 4,
            borderRadius: 2,
            backgroundColor: 'rgba(0,0,0,0.06)',
            '& .MuiLinearProgress-bar': {
              backgroundColor: 'var(--color-secondary)',
              borderRadius: 2,
            },
          }}
        />
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, pt: 0, pb: 1 }}>
        {questions.map((q, idx) => (
          <QuestionRow
            key={idx}
            q={q}
            index={idx}
            area={area}
            onAnswer={onAnswer}
            onManualMark={onManualMark}
            onViewNote={q.observationId ? () => onViewNote?.(q.observationId) : undefined}
          />
        ))}
      </AccordionDetails>
    </Accordion>
  );
}

// ── Main component ──

function QuestionDeck({
  student,
  currentUser,
  onAnswerQuestion,
  reloadKey = 0,
}) {
  const notify = useNotify();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null); // { area, index, questionText }
  const [previewNote, setPreviewNote] = useState(null);

  // ── View note in bottom sheet ──
  const handleViewNote = useCallback(async (observationId) => {
    if (!observationId || !student?.id) return;
    try {
      const obsRef = doc(db, 'students', student.id, 'observations', observationId);
      const obsSnap = await getDoc(obsRef);
      if (obsSnap.exists()) {
        setPreviewNote({ id: obsSnap.id, ...obsSnap.data() });
      }
    } catch (err) {
      console.error('[QuestionDeck] Failed to fetch note:', err);
    }
  }, [student?.id]);

  // ── Fetch open_questions ──
  const fetchData = useCallback(async () => {
    if (!student?.id) return;
    setLoading(true);
    setError('');
    try {
      const ref = doc(db, 'students', student.id, 'ai_summaries', 'open_questions');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const raw = snap.data();
        setData({ ...raw, areas: normalizeAreas(raw.areas) });
      } else {
        setData(null);
      }
    } catch (err) {
      console.error('QuestionDeck: fetch error', err);
      setError('Could not load open questions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [student?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData, reloadKey]);

  // ── Computed areas ──
  const areas = data?.areas ?? {};

  // ── Mark question as answered (manual) ──
  const markAnswered = useCallback(async (area, index) => {
    if (!student?.id) return;
    try {
      const ref = doc(db, 'students', student.id, 'ai_summaries', 'open_questions');
      const snap = await getDoc(ref);
      if (!snap.exists()) { notify.error('Questions have been refreshed - try reloading.'); return; }
      const current = snap.data();
      const normalized = normalizeAreas(current.areas);
      if (!normalized[area]?.[index]) { notify.error('Question no longer available - try refreshing.'); return; }
      const questions = [...normalized[area]];
      questions[index] = {
        ...questions[index],
        status: 'answered',
        answeredAt: Timestamp.now(),
        method: 'manual',
        answeredBy: { uid: currentUser.uid, name: currentUser.displayName || 'Unknown' },
      };
      const updatedAreas = { ...normalized, [area]: questions };
      await setDoc(ref, { ...current, areas: updatedAreas }, { merge: true });
      setData((prev) => {
        if (!prev) return prev;
        return { ...prev, areas: updatedAreas };
      });
      notify.success('Question marked as answered');
      trackEvent('question_deck_mark_answered', { area, method: 'manual', studentId: student.id });
    } catch (err) {
      console.error('QuestionDeck: mark answered error', err);
      notify.error('Failed to update question');
    }
  }, [student?.id, currentUser, notify]);

  // ── Handle manual mark action ──
  const handleManualMark = useCallback((area, index) => {
    const q = data?.areas?.[area]?.[index];
    setConfirmDialog({ area, index, questionText: q?.question || '' });
  }, [data]);

  // ── Confirm dialog actions ──
  const handleConfirmRecord = useCallback(() => {
    if (!confirmDialog) return;
    const { area, index, questionText } = confirmDialog;
    setConfirmDialog(null);
    onAnswerQuestion?.({ area, index, questionText });
    trackEvent('question_deck_record_answer', { area, studentId: student?.id });
  }, [confirmDialog, onAnswerQuestion, student?.id]);

  const handleConfirmMark = useCallback(() => {
    if (!confirmDialog) return;
    const { area, index } = confirmDialog;
    setConfirmDialog(null);
    markAnswered(area, index);
  }, [confirmDialog, markAnswered]);

  // ── Render states ──

  const isEmpty = !data || !data.areas || Object.keys(data.areas).length === 0;
  const studentName = student?.displayName || 'this student';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: 600,
        mx: 'auto',
      }}
    >
      {/* ── Body ── */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 2 }}>
        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pt: 8 }}>
            <CircularProgress size={32} sx={{ color: 'var(--color-primary)' }} />
          </Box>
        )}

        {/* Error */}
        {!loading && error && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              pt: 6,
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontSize: '0.9rem', color: 'var(--color-error)', fontWeight: 600 }}>
              {error}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={fetchData}
              sx={{ textTransform: 'none', borderRadius: '16px' }}
            >
              Retry
            </Button>
          </Box>
        )}

        {/* Empty state */}
        {!loading && !error && isEmpty && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              pt: 8,
              textAlign: 'center',
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: 4,
                background: 'linear-gradient(135deg, rgba(63, 81, 181, 0.08) 0%, rgba(63, 81, 181, 0.04) 100%)',
                border: '1px solid rgba(63, 81, 181, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
              }}
            >
              <Lightbulb size={26} />
            </Box>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>
              No open questions yet
            </Typography>
            <Typography
              sx={{
                fontSize: '0.8rem',
                color: 'var(--color-text-soft)',
                maxWidth: 280,
                lineHeight: 1.5,
              }}
            >
              Once Pep generates a soul for {studentName}, questions will appear here.
            </Typography>
          </Box>
        )}

        {/* Content */}
        {!loading && !error && !isEmpty && (
          <>
            <Typography
              sx={{
                fontSize: '0.88rem',
                fontWeight: 600,
                color: 'var(--color-text-soft)',
                mb: 2,
              }}
            >
              Coach Pepper is curious about {studentName}
            </Typography>

            {/* ── Area accordions ── */}
            {Object.entries(areas).sort(([a], [b]) => a.localeCompare(b)).map(([area, questions]) => (
              <AreaAccordion
                key={area}
                area={area}
                questions={questions}
                onAnswer={onAnswerQuestion}
                onManualMark={handleManualMark}
                onViewNote={handleViewNote}
              />
            ))}
          </>
        )}
      </Box>

      {/* ── Confirmation dialog ── */}
      <Dialog
        open={Boolean(confirmDialog)}
        onClose={() => setConfirmDialog(null)}
        PaperProps={{
          sx: {
            borderRadius: '16px',
            maxWidth: 340,
            mx: 2,
          },
        }}
      >
        <DialogTitle sx={{ fontSize: '0.95rem', fontWeight: 700, pb: 0.5, pr: 5 }}>
          Already answered this?
          <IconButton
            onClick={() => setConfirmDialog(null)}
            size="small"
            sx={{ position: 'absolute', top: 8, right: 8, color: 'var(--color-text-soft)' }}
            aria-label="Close"
          >
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-text-soft)', lineHeight: 1.5 }}>
            You can record a voice answer or just mark it as done.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2, flexDirection: 'column', gap: 1 }}>
          <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Mic size={14} />}
              onClick={handleConfirmRecord}
              sx={{
                textTransform: 'none',
                borderRadius: '16px',
                fontSize: '0.8rem',
                borderColor: 'var(--color-primary)',
                color: 'var(--color-primary)',
                flex: 1,
              }}
            >
              Record an answer
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={handleConfirmMark}
              sx={{
                textTransform: 'none',
                borderRadius: '16px',
                fontSize: '0.8rem',
                backgroundColor: 'var(--color-primary)',
                boxShadow: 'none',
                flex: 1,
                '&:hover': { boxShadow: 'none' },
              }}
            >
              Mark as answered
            </Button>
          </Stack>
          <Button
            fullWidth
            size="small"
            onClick={() => setConfirmDialog(null)}
            sx={{
              textTransform: 'none',
              fontSize: '0.8rem',
              color: 'var(--color-text-soft)',
              borderRadius: '16px',
            }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      <NoteBottomSheet
        open={!!previewNote}
        onClose={() => setPreviewNote(null)}
        observation={previewNote}
        student={student}
        currentUser={currentUser}
        userRole={null}
        isClassroomContext={false}
      />
    </Box>
  );
}

export default QuestionDeck;
