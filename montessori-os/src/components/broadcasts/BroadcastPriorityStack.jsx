// BroadcastPriorityStack.jsx — Shows current live alerts ordered by priority
// with a marker indicating where the new broadcast fits in.

import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { priorityLabel, priorityTint, classifyBroadcast, labelColor } from './broadcastUtils';

export default function BroadcastPriorityStack({ broadcasts = [], currentPriority = 3 }) {
  // Filter to only live broadcasts
  const liveAlerts = useMemo(() =>
    broadcasts
      .filter(b => classifyBroadcast(b) === 'live')
      .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3)),
    [broadcasts]
  );

  // If no live alerts, show a simple message
  if (liveAlerts.length === 0) {
    return (
      <Box sx={{ py: 0.5 }}>
        <Typography sx={{ fontSize: '0.7rem', color: 'var(--color-text-faint)' }}>
          No other live alerts — this will be first in the queue
        </Typography>
      </Box>
    );
  }

  // Insert "Your broadcast" placeholder at the correct position
  const items = [];
  let inserted = false;
  for (const alert of liveAlerts) {
    const alertPri = alert.priority ?? 3;
    if (!inserted && currentPriority <= alertPri) {
      items.push({ type: 'new', priority: currentPriority });
      inserted = true;
    }
    items.push({ type: 'existing', alert, priority: alertPri });
  }
  if (!inserted) {
    items.push({ type: 'new', priority: currentPriority });
  }

  return (
    <Box sx={{ mt: 0.5 }}>
      <Typography sx={{
        fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-text-faint)',
        mb: 0.5, letterSpacing: 0.5,
      }}>
        ALERT ORDER
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {items.map((item, i) => {
          if (item.type === 'new') {
            const tint = priorityTint(item.priority);
            return (
              <Box key="new" sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1, py: 0.5, borderRadius: '6px',
                border: '1.5px dashed var(--color-primary)',
                backgroundColor: 'var(--color-indigo-bg, rgba(79,70,229,0.06))',
              }}>
                <Box sx={{
                  width: 6, height: 6, borderRadius: '50%',
                  backgroundColor: 'var(--color-primary)',
                  flexShrink: 0,
                }} />
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', flex: 1 }}>
                  Your broadcast
                </Typography>
                <Box sx={{
                  fontSize: '0.55rem', fontWeight: 700, px: 0.75, py: 0.15,
                  borderRadius: '4px', backgroundColor: tint.bg, color: tint.color,
                }}>
                  {priorityLabel(item.priority)}
                </Box>
              </Box>
            );
          }

          const payload = item.alert.payload || {};
          const tint = priorityTint(item.priority);
          return (
            <Box key={item.alert.id || i} sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              px: 1, py: 0.4, borderRadius: '6px',
              backgroundColor: 'var(--color-surface, #f8fafc)',
            }}>
              <Box sx={{
                width: 6, height: 6, borderRadius: '50%',
                backgroundColor: labelColor(payload.label),
                flexShrink: 0,
              }} />
              <Typography sx={{
                fontSize: '0.7rem', fontWeight: 500, color: 'var(--color-text-soft)',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {payload.title || 'Broadcast'}
              </Typography>
              <Box sx={{
                fontSize: '0.55rem', fontWeight: 700, px: 0.75, py: 0.15,
                borderRadius: '4px', backgroundColor: tint.bg, color: tint.color,
              }}>
                {priorityLabel(item.priority)}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
