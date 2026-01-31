import React from 'react';
import { Box, Typography, Button, Stack, Card, CardContent } from '@mui/material';
import { HighlightOff, Close } from '@mui/icons-material';

function AccessDenied({ userEmail, onSignOut }) {
  return (
    <Box
      sx={{
        width: '100%',
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 3, sm: 4 },
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 3,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        <CardContent
          sx={{
            p: { xs: 3, sm: 4 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 2,
          }}
        >
          <HighlightOff sx={{ fontSize: 96, color: 'error.main' }} />
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Access Denied
          </Typography>
          {userEmail && (
            <Typography variant="body2" color="text.secondary">
              {userEmail}
            </Typography>
          )}
          <Stack spacing={2} sx={{ width: '100%', maxWidth: 320, mt: 1 }}>
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
        </CardContent>
      </Card>
    </Box>
  );
}

export default AccessDenied; 