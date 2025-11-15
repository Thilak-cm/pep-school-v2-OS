import React, { useEffect } from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import LessonNotes from './LessonNotes';
import { isSuperAdmin } from '../utils/roleUtils';

function LessonNotesPage({ currentUser, userRole, onClose }) {
  // Block access if user is not a superadmin
  useEffect(() => {
    // Only redirect if role is loaded and user is not superadmin
    if (userRole !== null && userRole !== undefined && !isSuperAdmin(userRole)) {
      // Automatically close/redirect if not superadmin
      onClose();
    }
  }, [userRole, onClose]);

  // Show access denied message if not superadmin
  if (!isSuperAdmin(userRole)) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          <Alert severity="error" sx={{ mb: 2 }}>Access Denied</Alert>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Only super admins can access the Lesson Notes page.
          </Typography>
          <Button 
            variant="contained" 
            startIcon={<ArrowBack />} 
            onClick={onClose} 
            fullWidth
          >
            Go Back
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 4 } }}>
        <LessonNotes
          currentUser={currentUser}
          userRole={userRole}
          onCancel={onClose}
          onSaved={onClose}
        />
      </Box>
    </Box>
  );
}

export default LessonNotesPage;
