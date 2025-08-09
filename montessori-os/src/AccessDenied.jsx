import React, { useState } from 'react';
import { Box, Typography, Button, Alert, Stack } from '@mui/material';
import { HighlightOff, Close, Send } from '@mui/icons-material';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';

function AccessDenied({ userEmail, onSignOut }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleRequestAccess = async () => {
    setError('');
    setSubmitting(true);
    try {
      const fn = httpsCallable(cloudFunctions, 'requestAccess');
      await fn({ userAgent: navigator.userAgent });
      setSubmitted(true);
    } catch (e) {
      setError('Failed to submit request. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  };
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
      {!submitted ? (
        <Stack spacing={2} sx={{ width: '100%', maxWidth: 300 }}>
          <Typography variant="caption" color="text.secondary">
            If you believe this is a mistake, tap Request Access and we’ll notify an admin.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Button
            variant="contained"
            color="primary"
            startIcon={<Send />}
            onClick={handleRequestAccess}
            disabled={submitting}
            aria-label="Request access"
            sx={{ borderRadius: 3, py: 1.25 }}
          >
            {submitting ? 'Submitting…' : 'Request Access'}
          </Button>
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
      ) : (
        <Stack spacing={2} sx={{ width: '100%', maxWidth: 300 }}>
          <Alert severity="success">Thanks! Your request has been sent to admins.</Alert>
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
      )}
    </Box>
  );
}

export default AccessDenied; 