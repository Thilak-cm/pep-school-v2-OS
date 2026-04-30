import React from 'react';
import { Box, Typography, Stack, Button, Skeleton, CircularProgress } from '@mui/material';
import { ErrorOutline } from '@mui/icons-material';
import { BASEBALL_CARD_DEFAULTS } from '../../../scripts/config/baseballCardConstants';

export default function BaseballCardBody({
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
          <ErrorOutline fontSize="small" color="error" />
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

  if (!cardData) {
    return (
      <Typography variant="body2" color="text.secondary">
        No summary available yet. The nightly job will generate it automatically.
      </Typography>
    );
  }

  if (isNoNotes) {
    return (
      <Typography variant="body2" color="error">
        No notes have been logged for {studentLabel} in the past {cardWindowWeeks} weeks.
      </Typography>
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
