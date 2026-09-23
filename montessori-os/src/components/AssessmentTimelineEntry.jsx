import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { ListChecks } from '../icons';

/**
 * #290 one-line assessment notification for student and classroom timelines.
 * Deliberately minimal (no full card body): timelines are pointers; the
 * matrix/PDF popups carry the detail ("we can come here and see everything"
 * - Rahul, 2026-09-18).
 */
export default function AssessmentTimelineEntry({ text, onClick }) {
  return (
    <Card
      onClick={onClick}
      sx={{
        borderLeft: '3px solid',
        borderLeftColor: 'primary.main',
        borderRadius: 2,
        cursor: 'pointer',
        '&:hover': { backgroundColor: 'rgba(0,0,0,0.03)' },
      }}
    >
      <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <ListChecks size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 2 }} />
          <Typography
            variant="body2"
            sx={{
              color: 'primary.main',
              textDecoration: 'underline',
              // Wrap up to 3 lines, then ellipsis.
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              wordBreak: 'break-word',
            }}
          >
            {text}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
