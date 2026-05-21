import React from 'react';
import { Box, Card, CardContent, Typography, Skeleton } from '@mui/material';
import { StickyNote as Notes, User as Person } from '../icons';

export default function ClassroomStudentCard({ student, totalNotes, notesLast7Days, loading, onClick }) {
  const totalText = `${totalNotes ?? 0} note${totalNotes !== 1 ? 's' : ''} overall`;
  const recentText = `${notesLast7Days ?? 0} note${notesLast7Days !== 1 ? 's' : ''} in the last 7 days`;

  return (
    <Card
      sx={{
        cursor: 'pointer',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
        transition: 'all 0.2s ease-in-out',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}
      onClick={onClick}
      aria-label={`View timeline for ${student.displayName || student.firstName}`}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Person size={16} style={{ color: 'var(--color-primary)' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'primary.main' }}>
            {student.displayName || `${student.firstName} ${student.lastName}`}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Notes size={14} style={{ color: 'var(--color-text-soft)' }} />
          {loading ? (
            <Skeleton width={180} height={16} />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {totalText} | {recentText}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
