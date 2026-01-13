import React from 'react';
import { Box, Card, CardContent, Stack, Typography, IconButton } from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { BASEBALL_CARD_DEFAULTS } from '../../../config/baseballCardConstants';
import BaseballCardBody from './BaseballCardBody';

export default function BaseballCardSnapshotCard({
  title = 'Weekly Snapshot',
  noteCount,
  windowDays,
  coverage,
  topRightActions,
  onRegenerateClick,
  regenDisabled = false,
  cardData,
  cardLoading,
  cardError,
  cardWindowDays,
  studentLabel,
  onOpenFeedback,
  feedbackMessage,
  loadingVariant,
  loadingMessage,
  footer,
  summaryScrollRef,
  onSummaryScroll,
  showScrollFade,
  minHeight,
  maxHeight = '60vh'
}) {
  const resolvedWindowDays = Number.isFinite(windowDays)
    ? windowDays
    : BASEBALL_CARD_DEFAULTS.windowDays;
  const resolvedCardWindowDays = Number.isFinite(cardWindowDays)
    ? cardWindowDays
    : resolvedWindowDays;
  const hasTopRight = Boolean(onRegenerateClick || topRightActions);

  return (
    <Card
      sx={{
        borderRadius: 2,
        border: '1px solid #e2e8f0',
        background: 'linear-gradient(135deg, #f8fafc 0%, #fff 100%)',
        minHeight,
        maxHeight,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflow: 'hidden' }}>
        {hasTopRight && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ position: 'absolute', top: 12, right: 12 }}>
            {onRegenerateClick && (
              <IconButton
                disabled={regenDisabled}
                onClick={onRegenerateClick}
                sx={{
                  width: 40,
                  height: 40,
                  border: '1px solid #a5b4fc',
                  color: '#4f46e5',
                  backgroundColor: 'rgba(79, 70, 229, 0.06)',
                  '&:hover': {
                    backgroundColor: 'rgba(79, 70, 229, 0.12)'
                  }
                }}
                aria-label="Regenerate student summary"
              >
                <Refresh sx={{ fontSize: 20 }} />
              </IconButton>
            )}
            {topRightActions}
          </Stack>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box>
              <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 700 }}>
                {title}
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                {Number.isFinite(noteCount) ? noteCount : '-'} notes over last {resolvedWindowDays} days
              </Typography>
              {coverage && (
                <Box sx={{ mt: 0.5 }}>
                  {coverage}
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, display: 'flex' }}>
          <Box
            ref={summaryScrollRef}
            onScroll={onSummaryScroll}
            sx={{ flex: 1, overflowY: 'auto', pr: 1, pb: 6, minHeight: 0 }}
            aria-label="Student summary (scroll for more)"
          >
            <BaseballCardBody
              cardData={cardData}
              cardLoading={cardLoading}
              cardError={cardError}
              cardWindowDays={resolvedCardWindowDays}
              studentLabel={studentLabel}
              onOpenFeedback={onOpenFeedback}
              feedbackMessage={feedbackMessage}
              loadingVariant={loadingVariant}
              loadingMessage={loadingMessage}
            />
          </Box>
          {showScrollFade && (
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 56,
                pointerEvents: 'none',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 55%, rgba(255,255,255,1) 100%)',
              }}
            />
          )}
        </Box>
        {footer && (
          <Box
            sx={{
              mt: 1.5,
              pt: 1.5,
              borderTop: '1px solid #e2e8f0',
              flexShrink: 0
            }}
          >
            {footer}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
