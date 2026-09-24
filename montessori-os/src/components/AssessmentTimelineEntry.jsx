import React from 'react';
import { Card, CardContent, Typography, Box, Link } from '@mui/material';
import { ListChecks } from '../icons';

/**
 * #290 assessment entries for student and classroom timelines.
 *
 * Two variants (Rahul, 2026-09-23):
 * - Classroom timeline keeps the original one-line pointer (`text` + `onClick`);
 *   the matrix/PDF popups carry the detail.
 * - Student timeline passes `details` to show the assessment name and this
 *   student's own result row inline ("without opening it, it shows the grade
 *   there"), with a "see more" link opening the existing bottom drawer.
 */
export default function AssessmentTimelineEntry({ text, onClick, details }) {
  if (details) {
    const { title, caption, rows = [], onSeeMore } = details;
    return (
      <Card
        sx={{
          borderLeft: '3px solid',
          borderLeftColor: 'primary.main',
          borderRadius: 2,
        }}
      >
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: rows.length > 0 ? 0.75 : 0.5 }}>
            <ListChecks size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
              {title}
            </Typography>
          </Box>
          {rows.map((row, index) => (
            <Box
              key={`${row.label}-${index}`}
              sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, ml: 3, py: 0.25 }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                {row.label}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                {row.value}
              </Typography>
            </Box>
          ))}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, ml: 3, mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {caption}
            </Typography>
            <Link
              component="button"
              type="button"
              variant="caption"
              onClick={onSeeMore}
              sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}
            >
              see more
            </Link>
          </Box>
        </CardContent>
      </Card>
    );
  }

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
