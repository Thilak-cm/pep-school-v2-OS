import React from 'react';
import { Box, Typography, Paper, Stack } from '@mui/material';
import { Sparkles as AutoAwesome } from '../icons';

// eslint-disable-next-line no-unused-vars
function InterviewsPage({ currentUser, userRole, manageableClassrooms }) {
  return (
    <Box sx={{ px: 2, pb: 10, pt: 1, display: 'flex', justifyContent: 'center' }}>
      <Paper
        elevation={0}
        sx={{
          p: 4,
          mt: 6,
          borderRadius: 3,
          border: '1px solid var(--color-indigo-bg-light)',
          bgcolor: 'var(--color-violet-bg)',
          textAlign: 'center',
          maxWidth: 360,
          width: '100%',
        }}
      >
        <Stack spacing={1.5} alignItems="center">
          <AutoAwesome size={36} style={{ color: 'var(--color-primary)' }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--color-indigo-deeper)' }}>
            AI Interviews
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--color-primary-light)', lineHeight: 1.6 }}>
            Our latest feature — Coach Pepper will conduct personalized interviews
            with you about each child, building a deeper understanding over time.
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--color-indigo-soft)', fontWeight: 600, mt: 1 }}>
            Coming soon
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

export default InterviewsPage;
