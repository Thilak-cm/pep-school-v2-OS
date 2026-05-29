/**
 * PEP-282: Plan feedback bottom sheet for admins.
 *
 * Allows classroom admins and superadmins to submit structured + free-text
 * feedback on a student's monthly plan. Each submission creates a standalone
 * doc at students/{id}/ai_summaries/monthly_plan/feedback/{autoId}.
 */
import { useState, useCallback, forwardRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Typography, Box, Chip, IconButton, Slide,
} from '@mui/material';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Mic, X } from '../icons';
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

const SECTION_TAGS = [
  'General', 'Language', 'Sensorial', 'Math', 'Practical Life', 'Grace & Courtesy',
];

const Transition = forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// ── Component ─────────────────────────────────────────────────────
export default function PlanFeedbackDialog({
  open,
  onClose,
  studentId,
  planMonth,
}) {
  const [difficulty, setDifficulty] = useState(null);
  const [pace, setPace] = useState(null);
  const [section, setSection] = useState('General');
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
    setSection('General');
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
        section,
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
        TransitionComponent={Transition}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            position: 'fixed',
            bottom: 0,
            m: 0,
            borderRadius: '16px 16px 0 0',
            maxHeight: '80vh',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0.5, fontSize: '1rem', fontWeight: 600 }}>
          {submitted ? 'Feedback submitted' : "How's this plan?"}
          <IconButton size="small" onClick={handleClose} aria-label="Close feedback">
            <X size={18} />
          </IconButton>
        </DialogTitle>

        {!submitted && (
          <DialogContent sx={{ pt: 1 }}>
            {/* Difficulty axis */}
            <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', mb: 0.5, display: 'block' }}>
              Difficulty
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
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

            {/* Pace axis */}
            <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', mb: 0.5, display: 'block' }}>
              Pace
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
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

            {/* Section tag */}
            <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', mb: 0.5, display: 'block' }}>
              About
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
              {SECTION_TAGS.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant="outlined"
                  onClick={() => setSection(tag)}
                  sx={chipSx(section === tag)}
                />
              ))}
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
          </DialogContent>
        )}

        {!submitted && (
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              variant="contained"
              size="small"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
              sx={{ textTransform: 'none', borderRadius: 2 }}
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
