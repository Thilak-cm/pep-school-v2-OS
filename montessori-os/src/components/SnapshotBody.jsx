import React from 'react';
import { Box, Typography, Stack, Button, Skeleton, CircularProgress } from '@mui/material';
import { CircleAlert as ErrorOutline, ClipboardList } from '../icons';
import { BASEBALL_CARD_DEFAULTS } from '../../../scripts/config/baseballCardConstants';

export default function SnapshotBody({
  cardData,
  cardLoading,
  cardError,
  cardWindowDays,
  studentLabel = 'Student',
  loadingVariant = 'skeleton',
  loadingMessage,
  onOpenFeedback,
  feedbackMessage
}) {
  const resolvedWindowDays = Number.isFinite(cardWindowDays)
    ? cardWindowDays
    : BASEBALL_CARD_DEFAULTS.windowDays;
  const cardWindowWeeks = Math.max(1, Math.round(resolvedWindowDays / 7));
  const cardNoteCount = cardData?.noteCount;
  const cardStatus = cardData?.status || null;
  const isNoNotes = cardStatus === 'no_notes' || cardNoteCount === 0;
  const showFeedback = Boolean(onOpenFeedback && feedbackMessage);

  if (cardLoading) {
    if (loadingVariant === 'spinner') {
      const message = loadingMessage || `Coach Pepper is preparing ${studentLabel}'s snapshot...`;
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            py: 4,
            mt: 1
          }}
        >
          <CircularProgress
            size={40}
            sx={{
              color: 'var(--color-primary)',
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
              }
            }}
          />
          <Typography variant="body1" sx={{ color: 'var(--color-text-soft)', textAlign: 'center' }}>
            {message}
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
        <Skeleton variant="text" width="70%" />
        <Skeleton variant="text" width="90%" />
        <Skeleton variant="text" width="80%" />
      </Box>
    );
  }

  if (cardError) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <ErrorOutline size={20} style={{ color: 'var(--color-error)' }} />
          <Typography variant="body2" color="error">
            {cardError}
          </Typography>
        </Stack>
        {showFeedback && (
          <Button variant="outlined" size="small" onClick={() => onOpenFeedback?.(feedbackMessage)}>
            Send feedback
          </Button>
        )}
      </Box>
    );
  }

  if (!cardData || isNoNotes) {
    const message = isNoNotes
      ? `No notes have been logged for ${studentLabel} in the past ${cardWindowWeeks} weeks`
      : 'No weekly snapshot available';
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        minHeight: 'calc(100% - 48px)',
        textAlign: 'center',
      }}>
        <Box sx={{
          width: 56, height: 56,
          borderRadius: 4,
          background: 'linear-gradient(135deg, var(--color-violet-bg) 0%, rgba(79, 70, 229, 0.08) 100%)',
          border: '1px solid var(--color-violet-soft, rgba(124, 58, 237, 0.2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-violet)',
        }}>
          <ClipboardList size={26} />
        </Box>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>
          Weekly Snapshot
        </Typography>
        <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-text-soft)', maxWidth: 240, lineHeight: 1.5 }}>
          {message}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
      {cardData.summary ? (
        <Typography
          variant="body2"
          sx={{
            color: 'var(--grey-700)',
            whiteSpace: 'pre-line',
          }}
        >
          {cardData.summary}
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No summary returned.
        </Typography>
      )}
    </Box>
  );
}
