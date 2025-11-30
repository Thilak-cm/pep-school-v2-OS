import React, { useEffect } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { prepareNotificationsFeature } from '../utils/notificationsFeature';

function NotificationsPage() {
  useEffect(() => {
    prepareNotificationsFeature();
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper
        elevation={0}
        sx={{
          p: 3,
          backgroundColor: 'white',
          borderRadius: 2,
          border: '1px solid #e2e8f0',
          textAlign: 'center'
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#1e293b' }}>
          Notifications
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Feature coming soon. Stay tuned!
        </Typography>
      </Paper>
    </Box>
  );
}

export default NotificationsPage;
