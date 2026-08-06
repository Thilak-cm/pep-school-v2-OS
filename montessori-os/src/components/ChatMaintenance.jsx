import React from 'react';
import { Alert, Box, Typography } from '@mui/material';

// Temporary deployment safety gate for #220. Keep this explicit and UID-based:
// role checks are intentionally not sufficient while the chat is being rebuilt.
export const CHAT_MAINTENANCE_ALLOWED_UID = 'T1iLA2qjTqMvgS4hamw2PEtNsov1';

export default function ChatMaintenance({ currentUser }) {
  const isAuthorizedTester = currentUser?.uid === CHAT_MAINTENANCE_ALLOWED_UID;

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
