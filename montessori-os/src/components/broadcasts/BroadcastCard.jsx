// BroadcastCard.jsx — Single broadcast card for the desk page
// Three variants: live (ack bar), scheduled (dashed border), done (muted)

import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { Clock } from '../../icons';
import {
  classifyBroadcast, relativeExpiry, relativeStartsAt,
  labelColor, priorityLabel, priorityTint, getAudienceSummary,
} from './broadcastUtils';

export default function BroadcastCard({ broadcast, classrooms = [], onClick }) {
  const status = classifyBroadcast(broadcast);
  const payload = broadcast.payload || {};
  const ackCount = broadcast.dismissedBy ? Object.keys(broadcast.dismissedBy).length : 0;
  const reach = broadcast.reach || 0;
  const ackFraction = reach > 0 ? ackCount / reach : 0;

  const audience = payload.audience
    || getAudienceSummary(broadcast.targetClassrooms, broadcast.targetTeachers, classrooms);
  const reachText = reach > 0 ? `${reach} people` : '';
  const audienceLine = [audience, reachText].filter(Boolean).join(' · ');

  const pLabel = priorityLabel(broadcast.priority);
  const pTint = priorityTint(broadcast.priority);
  const lColor = labelColor(payload.label);

  if (status === 'scheduled') {
    return (
      <Paper
        elevation={0}
        onClick={onClick}
        sx={{
          mb: 1.5, p: 2, borderRadius: 3,
          border: '1.5px dashed var(--color-border)',
          cursor: 'pointer',
          '&:active': { opacity: 0.85 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Clock size={14} style={{ color: 'var(--color-text-faint)' }} />
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-soft)' }}>
            goes live {relativeStartsAt(broadcast.startsAt)}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {payload.title || ''}
        </Typography>
        <Typography variant="caption" sx={{ color: 'var(--color-text-faint)' }}>
          {audienceLine}
        </Typography>
      </Paper>
    );
  }

  const isDone = status === 'done';

  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        mb: 1.5, p: 2, borderRadius: 3,
        border: '1px solid var(--color-border)',
        opacity: isDone ? 0.7 : 1,
        cursor: 'pointer',
        '&:active': { opacity: 0.85 },
      }}
    >
      {/* Meta row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, flexWrap: 'wrap' }}>
        <Typography sx={{
          fontSize: '0.6rem', fontWeight: 800, letterSpacing: 1.2,
          textTransform: 'uppercase', color: lColor, lineHeight: 1,
        }}>
          {payload.label || 'BROADCAST'}
        </Typography>

        {/* Priority pill */}
        <Box sx={{
          display: 'inline-flex', alignItems: 'center',
          px: 1, py: 0.15, borderRadius: '6px',
          backgroundColor: pTint.bg, color: pTint.color,
          fontSize: '0.6rem', fontWeight: 700, lineHeight: 1,
        }}>
          {pLabel}
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Relative expiry */}
        <Typography sx={{ fontSize: '0.65rem', color: 'var(--color-text-faint)', fontWeight: 500 }}>
          {relativeExpiry(broadcast.expiresAt)}
        </Typography>
      </Box>

      {/* Title */}
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
        {payload.title || ''}
      </Typography>

      {/* Audience line */}
      <Typography variant="caption" sx={{ color: 'var(--color-text-faint)', display: 'block', mb: 1 }}>
        {audienceLine}
      </Typography>

      {/* Ack progress bar */}
      {reach > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{
            flex: 1, height: 5, borderRadius: '3px',
            backgroundColor: 'var(--color-surface, #eef0f4)',
            overflow: 'hidden',
          }}>
            <Box sx={{
              width: `${Math.min(ackFraction * 100, 100)}%`,
              height: '100%', borderRadius: '3px',
              backgroundColor: ackFraction >= 1
                ? 'var(--color-success, #16a34a)'
                : 'var(--color-primary)',
              transition: 'width 0.3s ease',
            }} />
          </Box>
          <Typography sx={{
            fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-soft)',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {ackCount}/{reach} read
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
