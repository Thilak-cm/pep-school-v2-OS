import React from 'react';
import { Box } from '@mui/material';
import LessonNotes from './LessonNotes';

function LessonNotesPage({ currentUser, userRole, onClose, initialClassroomId = null, initialStudentId = null }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 4 } }}>
        <LessonNotes
          currentUser={currentUser}
          userRole={userRole}
          initialClassroomId={initialClassroomId}
          initialStudentId={initialStudentId}
          onCancel={onClose}
          onSaved={onClose}
        />
      </Box>
    </Box>
  );
}

export default LessonNotesPage;
