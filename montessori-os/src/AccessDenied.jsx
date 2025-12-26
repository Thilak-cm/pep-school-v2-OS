import React from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import { HighlightOff, Close } from '@mui/icons-material';

function AccessDenied({ userEmail, onSignOut }) {
  return (
    <Box
      sx={{
        width: '375px',
        height: '812px',
        backgroundColor: '#f8fafc',
        boxShadow: '0 0 24px rgba(0,0,0,0.10)',
        borderRadius: '32px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        px: 4,
        gap: 2,
      }}
    >
      <HighlightOff sx={{ fontSize: 96, color: '#dc2626' }} />
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        Access Denied
      </Typography>
      {userEmail && (
        <Typography variant="body2" color="text.secondary">
          {userEmail}
        </Typography>
      )}
      <Stack spacing={2} sx={{ width: '100%', maxWidth: 300 }}>
        <Typography variant="caption" color="text.secondary">
          You don't have access to this application. Please contact an administrator.
        </Typography>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<Close />}
          onClick={onSignOut}
          aria-label="Sign out"
          sx={{ borderRadius: 3, py: 1.25 }}
        >
          Sign Out
        </Button>
      </Stack>
    </Box>
  );
}

export default AccessDenied; 