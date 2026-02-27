import React, { useState, useEffect } from 'react';
import { 
  Snackbar, 
  Alert, 
  Button, 
  Box 
} from '@mui/material';
import { 
  SystemUpdateAlt, 
  Refresh 
} from '@mui/icons-material';
import versionManager from '../utils/versionManager';

const UpdateNotification = () => {
  const [open, setOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // Listen for update available events
    const handleUpdateAvailable = () => {
      setUpdateAvailable(true);
      setOpen(true);
    };

    // Listen for custom event from version manager
    window.addEventListener('appUpdateAvailable', handleUpdateAvailable);

    // Check if update is already available
    if (versionManager.isUpdateAvailable()) {
      setUpdateAvailable(true);
      setOpen(true);
    }

    return () => {
      window.removeEventListener('appUpdateAvailable', handleUpdateAvailable);
    };
  }, []);

  const handleClose = () => {
    setOpen(false);
  };

  const handleUpdate = async () => {
    try {
      await versionManager.applyUpdate();
      setOpen(false);
      // The page will reload automatically when the update is applied
    } catch { /* ignored */ }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  if (!updateAvailable) return null;

  return (
    <Snackbar
      open={open}
      autoHideDuration={null} // Don't auto-hide
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert
        severity="info"
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              color="inherit"
              size="small"
              startIcon={<SystemUpdateAlt />}
              onClick={handleUpdate}
              sx={{ minWidth: 'auto' }}
            >
              Update
            </Button>
            <Button
              color="inherit"
              size="small"
              startIcon={<Refresh />}
              onClick={handleRefresh}
              sx={{ minWidth: 'auto' }}
            >
              Refresh
            </Button>
          </Box>
        }
        sx={{ 
          width: '100%',
          maxWidth: '375px', // Mobile-first width
          '& .MuiAlert-action': {
            alignItems: 'center'
          }
        }}
      >
        New version available! Update to get the latest features.
      </Alert>
    </Snackbar>
  );
};

export default UpdateNotification;
