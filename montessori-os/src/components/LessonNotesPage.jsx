import React from 'react';
import { Box } from '@mui/material';
import LessonNotes from './LessonNotes';

function LessonNotesPage({ currentUser, userRole, onClose, onSaved, initialClassroomId = null, initialStudentId = null, editObservation = null }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--color-bg)' }}>
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 4 } }}>
        <LessonNotes
          currentUser={currentUser}
          userRole={userRole}
          initialClassroomId={initialClassroomId}
          initialStudentId={initialStudentId}
          editObservation={editObservation}
          onCancel={onClose}
          onSaved={onSaved || onClose}
        />
      </Box>
    </Box>
  );
}

export default LessonNotesPage;
