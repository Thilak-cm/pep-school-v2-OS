import { useCallback, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Collapse,
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
import { doc, getDoc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import { trackEvent } from '../utils/analytics';
import NoteBottomSheet from './noteBottomSheet/NoteBottomSheet';

// ── Helpers ──

/**
 * Normalize areas from Firestore - handles legacy string array format,
 * legacy #144 flat-object format ({ question, status, answeredAt, ... }),
 * and produces multi-POV shape with answers array (#216).
 */
function normalizeAreas(areas) {
  if (!areas || typeof areas !== 'object') return {};
  const out = {};
  for (const [area, questions] of Object.entries(areas)) {
    if (!Array.isArray(questions)) continue;
    out[area] = questions.map((q) => {
      if (typeof q === 'string') return { question: q, answers: [] };
      if (q.answers) return q;
      // Legacy #144 flat shape: synthesize answers array from flat fields
      if (q.status === 'answered') {
        return {
          question: q.question,
          answers: [{
            answeredAt: q.answeredAt || null,
            method: q.method || 'voice',
            observationId: q.observationId || null,
            answeredBy: q.answeredBy || { uid: '', name: 'Unknown' },
          }],
        };
      }
      return { question: q.question, answers: [] };
    });
  }
  return out;
}

/**
 * Format a Firestore timestamp (or Date) into a short relative/absolute label.
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

/**
 * Derive month label from a Firestore timestamp for the "July's questions" subtitle.
 */
function getMonthLabel(ts) {
  if (!ts) return '';
  const date = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
  if (isNaN(date.getTime())) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]}'s questions`;
}

/**
 * Determine CTA state for a question row based on answers and current user.
 */
function getQuestionCTAState(question, currentUserUid) {
  const answers = question.answers || [];
  if (answers.length === 0) return 'pending';
  const currentUserAnswered = answers.some((a) => a.answeredBy?.uid === currentUserUid);
  return currentUserAnswered ? 'self-answered' : 'others-answered';
}

// ── Answer list (sub-toggle) ──

function AnswerList({ answers, onViewNote }) {
  const [expanded, setExpanded] = useState(false);
  const count = answers?.length || 0;
  if (count === 0) return null;

  return (
    <Box sx={{ pl: 4.25, mt: 0.5 }}>
      <Box
        component="button"
        onClick={() => setExpanded((v) => !v)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-soft)',
          background: 'none', border: 'none', cursor: 'pointer', p: 0,
          '&:hover': { color: 'var(--color-text)' },
        }}
      >
        {count} {count === 1 ? 'answer' : 'answers'}
        <ChevronDown size={14} style={{
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }} />
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ mt: 0.75 }}>
          {answers.map((a, idx) => (
            <Box key={idx} sx={{
              display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
              py: 0.5, borderBottom: idx < count - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
            }}>
              <Typography sx={{ fontSize: '0.68rem', color: 'var(--color-text-soft)' }}>
                {a.answeredBy?.name || 'Unknown'} · {formatRelativeDate(a.answeredAt)}
              </Typography>
              {a.method === 'manual' && (
                <Typography sx={{ fontSize: '0.65rem', color: 'var(--color-text-faint)', fontStyle: 'italic' }}>
                  marked as answered
                </Typography>
              )}
              {a.observationId && onViewNote && (
                <Box
                  component="button"
                  onClick={() => onViewNote(a.observationId)}
                  sx={{
                    fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-primary)',
                    border: '1px solid rgba(79, 70, 229, 0.25)', borderRadius: '12px',
                    backgroundColor: 'rgba(79, 70, 229, 0.06)', px: 0.75, py: 0.15,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    '&:hover': { backgroundColor: 'rgba(79, 70, 229, 0.12)' },
                  }}
                >
                  View note
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

// ── Question row ──

function QuestionRow({ q, index, area, currentUser, onAnswer, onManualMark, onViewNote }) {
  const ctaState = getQuestionCTAState(q, currentUser?.uid);
  const isAnswered = ctaState !== 'pending';
  const answers = q.answers || [];

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

      {/* Answer sub-toggle */}
      {answers.length > 0 && (
        <AnswerList answers={answers} onViewNote={onViewNote} />
      )}

      {/* Action row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.75, pl: 4.25 }}>
        {ctaState === 'pending' && (
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
              Add answer
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

        {ctaState === 'others-answered' && (
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
            Add another answer
          </Button>
        )}

        {ctaState === 'self-answered' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ fontSize: '0.7rem', color: 'var(--color-text-faint)', fontWeight: 500 }}>
              Already answered
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Mic size={12} />}
              onClick={() => onAnswer({ area, index, questionText: q.question })}
              sx={{
                fontSize: '0.68rem', textTransform: 'none',
                borderColor: 'rgba(79, 70, 229, 0.3)', color: 'var(--color-primary)',
                borderRadius: '14px', px: 1.25, py: 0.15, minHeight: 24, boxShadow: 'none',
                '&:hover': { boxShadow: 'none', borderColor: 'var(--color-primary)', backgroundColor: 'rgba(79, 70, 229, 0.04)' },
              }}
            >
              Add more
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ── Area accordion ──

function AreaAccordion({ area, questions, currentUser, onAnswer, onManualMark, onViewNote }) {
  const answered = questions.filter((q) => (q.answers?.length || 0) > 0).length;
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
            currentUser={currentUser}
            onAnswer={onAnswer}
            onManualMark={onManualMark}
            onViewNote={q.answers?.some((a) => a.observationId) ? (obsId) => onViewNote?.(obsId) : undefined}
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
      notify.error('Could not load note. Please try again.');
    }
  }, [student?.id, notify]);

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

  // ── Mark question as answered (manual) - wrapped in transaction (#216) ──
  const markAnswered = useCallback(async (area, index) => {
    if (!student?.id) return;
    try {
      const ref = doc(db, 'students', student.id, 'ai_summaries', 'open_questions');
      const updatedAreas = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error('doc-missing');
        const current = snap.data();
        const normalized = normalizeAreas(current.areas);
        if (!normalized[area]?.[index]) throw new Error('question-missing');
        const questions = [...normalized[area]];
        const newAnswer = {
          answeredAt: Timestamp.now(),
          method: 'manual',
          answeredBy: { uid: currentUser.uid, name: currentUser.displayName || 'Unknown' },
        };
        questions[index] = {
          ...questions[index],
          answers: [...(questions[index].answers || []), newAnswer],
        };
        const newAreas = { ...normalized, [area]: questions };
        transaction.set(ref, { ...current, areas: newAreas }, { merge: true });
        return newAreas;
      });
      setData((prev) => {
        if (!prev) return prev;
        return { ...prev, areas: updatedAreas };
      });
      notify.success('Question marked as answered');
      trackEvent('question_deck_mark_answered', { area, method: 'manual', studentId: student.id });
    } catch (err) {
      console.error('QuestionDeck: mark answered error', err);
      if (err.message === 'doc-missing') {
        notify.error('Questions have been refreshed - try reloading.');
      } else if (err.message === 'question-missing') {
        notify.error('Question no longer available - try refreshing.');
      } else {
        notify.error('Failed to update question');
      }
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

  // ── Handle answer action (#216) ──
  const handleAnswerQuestion = useCallback((oq) => {
    onAnswerQuestion?.(oq);
    const q = data?.areas?.[oq.area]?.[oq.index];
    const ctaState = getQuestionCTAState(q, currentUser?.uid);
    if (ctaState === 'self-answered') {
      trackEvent('question_deck_add_more', { area: oq.area, studentId: student?.id });
    }
  }, [data, currentUser?.uid, onAnswerQuestion, student?.id]);

  // ── Render states ──

  const isEmpty = !data || !data.areas || Object.keys(data.areas).length === 0;
  const studentName = student?.displayName || 'this student';
  const monthLabel = getMonthLabel(data?.updatedAt);

  // Sort areas: most progress first, then alphabetically (#216)
  const sortedAreas = Object.entries(areas).sort(([aName, aQs], [bName, bQs]) => {
    const aTotal = aQs.length;
    const bTotal = bQs.length;
    const aAnswered = aQs.filter((q) => (q.answers?.length || 0) > 0).length;
    const bAnswered = bQs.filter((q) => (q.answers?.length || 0) > 0).length;
    const aRatio = aTotal > 0 ? aAnswered / aTotal : 0;
    const bRatio = bTotal > 0 ? bAnswered / bTotal : 0;
    if (bRatio !== aRatio) return bRatio - aRatio;
    return aName.localeCompare(bName);
  });

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
            {/* Header - restyled tagline + month subtitle (#216) */}
            <Typography
              sx={{
                fontSize: '0.78rem',
                fontStyle: 'italic',
                color: 'var(--color-text-soft)',
                mb: 0.25,
              }}
            >
              Coach Pepper is curious about {studentName}
            </Typography>
            {monthLabel && (
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-faint)',
                  mb: 2,
                }}
              >
                {monthLabel}
              </Typography>
            )}

            {/* ── Area accordions - sorted by progress desc, then alpha (#216) ── */}
            {sortedAreas.map(([area, questions]) => (
              <AreaAccordion
                key={area}
                area={area}
                questions={questions}
                currentUser={currentUser}
                onAnswer={handleAnswerQuestion}
                onManualMark={handleManualMark}
                onViewNote={handleViewNote}
              />
            ))}
          </>
        )}
      </Box>

      {/* ── Confirmation dialog - only for pending questions (#216) ── */}
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
