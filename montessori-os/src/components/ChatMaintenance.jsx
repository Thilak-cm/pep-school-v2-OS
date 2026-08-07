import React from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { isChatAllowed } from './chat/chatAccess.js';

export default function ChatMaintenance({ currentUser }) {
  const isAuthorizedTester = isChatAllowed(currentUser?.uid);

  return (
    <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6">Coach Pepper</Typography>
      <Alert severity="info">
        {isAuthorizedTester
          ? 'Coach Pepper chat is being rebuilt. This account is authorized for testing once the new chat is ready.'
          : 'Coach Pepper chat is under maintenance. Please check back in a few days.'}
      </Alert>
    </Box>
  );
}
