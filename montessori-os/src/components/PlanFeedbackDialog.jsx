/**
 * PEP-282: Plan feedback bottom sheet for admins.
 *
 * Allows classroom admins and superadmins to submit structured + free-text
 * feedback on a student's monthly plan. Each submission creates a standalone
 * doc at students/{id}/ai_summaries/monthly_plan/feedback/{autoId}.
 */
import { useState, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogActions, Stack,
  Button, TextField, Typography, Box, Chip, IconButton,
} from '@mui/material';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Mic, ThumbsUp } from '../icons';
import useNotify from '../notifications/useNotify';
import VoiceRecorder from '../VoiceRecorder';

// ── Option definitions ────────────────────────────────────────────
const DIFFICULTY_OPTIONS = [
  { value: 'too_easy', label: 'Too easy' },
  { value: 'about_right', label: 'About right' },
  { value: 'too_tough', label: 'Too tough' },
];

const PACE_OPTIONS = [
  { value: 'too_slow', label: 'Too slow' },
  { value: 'good_pace', label: 'Good pace' },
  { value: 'too_fast', label: 'Too fast' },
];

// ── Component ─────────────────────────────────────────────────────
export default function PlanFeedbackDialog({
  open,
  onClose,
  studentId,
  planMonth,
}) {
  const [difficulty, setDifficulty] = useState(null);
  const [pace, setPace] = useState(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const notify = useNotify();

  const canSubmit = !!(difficulty || pace || text.trim());

  const resetForm = useCallback(() => {
    setDifficulty(null);
    setPace(null);
    setText('');
    setSubmitted(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    try {
      const feedbackRef = collection(
        db, 'students', studentId, 'ai_summaries', 'monthly_plan', 'feedback',
      );
      await addDoc(feedbackRef, {
        ...(difficulty && { difficulty }),
        ...(pace && { pace }),
        ...(text.trim() && { text: text.trim() }),
        planMonth: planMonth || null,
        createdBy: auth.currentUser?.uid || null,
        createdByName: auth.currentUser?.displayName || null,
        createdAt: serverTimestamp(),
      });

      notify.success('Feedback saved');
      setSubmitted(true);
      setTimeout(() => handleClose(), 1200);
    } catch {
      notify.error('Could not save feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoiceSave = ({ text: transcribed }) => {
    if (transcribed) setText((prev) => prev ? `${prev} ${transcribed}` : transcribed);
    setVoiceOpen(false);
  };

  const chipSx = (selected) => ({
    cursor: 'pointer',
    fontWeight: selected ? 600 : 400,
    borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)',
    backgroundColor: selected ? 'rgba(79, 70, 229, 0.08)' : 'transparent',
    color: selected ? 'var(--color-primary)' : 'var(--color-text)',
    '&:hover': { backgroundColor: selected ? 'rgba(79, 70, 229, 0.13)' : 'rgba(0,0,0,0.04)' },
  });

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 3,
            background: 'linear-gradient(180deg, var(--color-indigo-bg) 0%, var(--color-paper) 55%)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 18px 50px rgba(15, 23, 42, 0.18)',
          },
        }}
      >
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={2}>
            {/* Header row — icon + title */}
            <Stack direction="row" spacing={2} alignItems="center">
              <Box sx={{
                width: 48, height: 48, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.08) 70%)',
                border: '1px solid rgba(99,102,241,0.35)',
              }}>
                <ThumbsUp size={22} style={{ color: 'var(--color-primary)' }} />
              </Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'var(--grey-900)' }}>
                {submitted ? 'Feedback submitted' : "How's this plan?"}
              </Typography>
            </Stack>

            {!submitted && (
              <>
                {/* Difficulty axis */}
                <Box>
                  <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', mb: 0.5, display: 'block' }}>
                    Difficulty
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <Chip
                        key={opt.value}
                        label={opt.label}
                        size="small"
                        variant="outlined"
                        onClick={() => setDifficulty(difficulty === opt.value ? null : opt.value)}
                        sx={chipSx(difficulty === opt.value)}
                      />
                    ))}
                  </Box>
                </Box>

                {/* Pace axis */}
                <Box>
                  <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', mb: 0.5, display: 'block' }}>
                    Pace
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {PACE_OPTIONS.map((opt) => (
                      <Chip
                        key={opt.value}
                        label={opt.label}
                        size="small"
                        variant="outlined"
                        onClick={() => setPace(pace === opt.value ? null : opt.value)}
                        sx={chipSx(pace === opt.value)}
                      />
                    ))}
                  </Box>
                </Box>

                {/* Text input + mic */}
                <Box sx={{ position: 'relative' }}>
                  <TextField
                    multiline
                    minRows={2}
                    maxRows={4}
                    fullWidth
                    placeholder="What did you notice?"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    size="small"
                    sx={{ '& .MuiOutlinedInput-root': { pr: 5 } }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => setVoiceOpen(true)}
                    sx={{ position: 'absolute', right: 8, top: 8, color: 'var(--color-primary)' }}
                    aria-label="Record voice feedback"
                  >
                    <Mic size={18} />
                  </IconButton>
                </Box>
              </>
            )}
          </Stack>
        </DialogContent>

        {!submitted && (
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button onClick={handleClose} disabled={submitting} sx={{ textTransform: 'none', color: 'var(--grey-600)' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
              sx={{ textTransform: 'none', borderRadius: 999, px: 3, boxShadow: '0 10px 20px rgba(79, 70, 229, 0.25)' }}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      {/* VoiceRecorder dialog for STT */}
      <VoiceRecorder
        dialog
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onSave={handleVoiceSave}
        autoAdvanceOnSave
      />
    </>
  );
}
