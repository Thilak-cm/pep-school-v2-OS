import React from 'react';
import { Box, Card, CardContent, Stack, Typography, IconButton, Chip } from '@mui/material';
import { RefreshCw as Refresh } from '../icons';
import { BASEBALL_CARD_DEFAULTS } from '../../../scripts/config/baseballCardConstants';
import BaseballCardBody from './BaseballCardBody';

// Utility function to calculate age in "5y3m" format (similar to functions/index.js)
function calculateAgeFromDob(dobValue) {
  if (!dobValue) return null;

  // Normalize timestamp value (handle Firestore Timestamp, Date, or ISO string)
  let dobDate = null;
  if (typeof dobValue?.toDate === 'function') {
    dobDate = dobValue.toDate();
  } else if (typeof dobValue?.seconds === 'number') {
    dobDate = new Date(dobValue.seconds * 1000);
  } else if (dobValue instanceof Date) {
    dobDate = dobValue;
  } else if (typeof dobValue === 'string') {
    dobDate = new Date(dobValue);
  }

  if (!dobDate || isNaN(dobDate.getTime())) {
    return null;
  }

  const today = new Date();
  const birthDate = new Date(dobDate);

  // Calculate years
  let years = today.getFullYear() - birthDate.getFullYear();
  let months = today.getMonth() - birthDate.getMonth();
  let days = today.getDate() - birthDate.getDate();

  // Adjust for negative days
  if (days < 0) {
    months--;
    const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += lastMonth.getDate();
  }

  // Adjust for negative months
  if (months < 0) {
    years--;
    months += 12;
  }

  // Format as "5y3m" (only show months if > 0, only show years if > 0)
  const parts = [];
  if (years > 0) {
    parts.push(`${years}y`);
  }
  if (months > 0) {
    parts.push(`${months}m`);
  }

  return parts.length > 0 ? parts.join('') : null;
}

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
  student = null,
  onOpenFeedback,
  onDobMissing,
  feedbackMessage,
  loadingVariant,
  loadingMessage,
  footer,
  summaryScrollRef,
  onSummaryScroll,
  showScrollFade,
  minHeight,
  maxHeight = '70vh'
}) {
  const resolvedWindowDays = Number.isFinite(windowDays)
    ? windowDays
    : BASEBALL_CARD_DEFAULTS.windowDays;
  const resolvedCardWindowDays = Number.isFinite(cardWindowDays)
    ? cardWindowDays
    : resolvedWindowDays;
  const hasTopRight = Boolean(onRegenerateClick || topRightActions);
  const ageString = calculateAgeFromDob(student?.dob || student?.dateOfBirth);

  return (
    <Card
      sx={{
        borderRadius: 2,
        border: '1px solid var(--color-border)',
        background: 'linear-gradient(135deg, var(--color-bg) 0%, var(--color-paper) 100%)',
        minHeight: minHeight || 0,
        maxHeight,
        flex: 1,
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
                  border: '1px solid var(--color-indigo-soft)',
                  color: 'var(--color-primary)',
                  backgroundColor: 'rgba(79, 70, 229, 0.06)',
                  '&:hover': {
                    backgroundColor: 'rgba(79, 70, 229, 0.12)'
                  }
                }}
                aria-label="Regenerate student summary"
              >
                <Refresh size={20} />
              </IconButton>
            )}
            {topRightActions}
          </Stack>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box>
              <Typography variant="h6" component="h3" sx={{ color: 'var(--color-text)', fontWeight: 700 }}>
                {title}
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>
                {Number.isFinite(noteCount) ? noteCount : '-'} notes over last {resolvedWindowDays} days
              </Typography>
              <Box
                sx={{
                  mt: 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1.5,
                  width: '100%',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 24 }}>
                  {coverage}
                </Box>
                {ageString ? (
                  <Chip
                    label={ageString}
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      backgroundColor: 'var(--color-violet-bg, rgba(139, 92, 246, 0.08))',
                      color: 'var(--color-violet, #8b5cf6)',
                      border: '1px solid var(--color-violet-soft, rgba(139, 92, 246, 0.2))',
                      '& .MuiChip-label': {
                        px: 1
                      }
                    }}
                  />
                ) : (
                  <Chip
                    label="DoB missing"
                    size="small"
                    onClick={onDobMissing}
                    sx={{
                      height: 24,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      backgroundColor: 'rgba(245, 158, 11, 0.08)',
                      color: 'var(--color-amber-text, #92400e)',
                      border: '1px solid rgba(245, 158, 11, 0.2)',
                      cursor: onDobMissing ? 'pointer' : 'default',
                      '& .MuiChip-label': {
                        px: 1
                      }
                    }}
                  />
                )}
              </Box>
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
              student={student}
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
              borderTop: '1px solid var(--color-border)',
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
