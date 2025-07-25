import React from 'react';
import { Box, Typography, Button } from '@mui/material';
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
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
        If you believe this is a mistake, please contact your administrator.
      </Typography>
      <Button
        variant="outlined"
        color="primary"
        startIcon={<Close />}
        onClick={onSignOut}
        sx={{ borderRadius: 3, px: 4, py: 1.5 }}
      >
        Sign Out
      </Button>
    </Box>
  );
}

export default AccessDenied; 