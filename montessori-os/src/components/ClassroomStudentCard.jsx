import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { StickyNote as Notes, User as Person } from '../icons';

export default function ClassroomStudentCard({ student, classroomNotes, onClick }) {
  const studentNoteCount = classroomNotes.filter((n) => n.studentId === student.id).length;

  const last7DaysCount = (() => {
    if (!classroomNotes?.length) return 0;
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return classroomNotes.filter((n) => {
      if (n.studentId !== student.id) return false;
      try {
        let d;
        if (n.observedAt?.toDate) d = n.observedAt.toDate();
        else if (n.observedAt?.seconds) d = new Date(n.observedAt.seconds * 1000);
        else if (n.observedAt) d = new Date(n.observedAt);
        else if (n.timestamp?.toDate) d = n.timestamp.toDate();
        else if (n.timestamp?.seconds) d = new Date(n.timestamp.seconds * 1000);
        else if (n.timestamp) d = new Date(n.timestamp);
        else d = new Date(0);
        return d >= lastWeek;
      } catch {
        return false;
      }
    }).length;
  })();

  const totalText = `${studentNoteCount} note${studentNoteCount !== 1 ? 's' : ''} overall`;
  const recentText = `${last7DaysCount} note${last7DaysCount !== 1 ? 's' : ''} in the last 7 days`;

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
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {totalText} | {recentText}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
