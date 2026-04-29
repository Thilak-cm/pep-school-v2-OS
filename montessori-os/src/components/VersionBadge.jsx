import React from 'react';
import { Box, Typography } from '@mui/material';
import { isAdminRole } from '../utils/roleUtils';

/**
 * A version badge that can be displayed either:
 * 1. Universally (bottom-left corner) - only for admins
 * 2. In profile page - for all users
 */
const VersionBadge = ({ userRole, showInProfile = false }) => {
  // For universal display: only show for admin users
  if (!showInProfile && !isAdminRole(userRole)) {
    return null;
  }

  // For profile page: show for all users with elegant styling
  if (showInProfile) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          mt: 4,
          pt: 3,
        }}
      >
        <Typography 
          variant="body2" 
          color="text.secondary"
          sx={{ 
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontSize: '0.75rem'
          }}
        >
          App Version
        </Typography>
        <Typography 
          variant="h6" 
          component="span" 
          sx={{ 
            fontWeight: 700,
            color: 'primary.main',
            fontFamily: 'monospace',
            fontSize: '1.1rem'
          }}
        >
          v10.14.0
        </Typography>
      </Box>
    );
  }

  // Universal display (bottom-left corner) - only for admins
  return (
    <Box
      sx={{
        // Mobile: fixed to viewport, Desktop: absolute to container
        position: { xs: 'fixed', sm: 'absolute' },
        bottom: { xs: 16, sm: 16 },
        left: { xs: 16, sm: 16 },
        zIndex: 1000, // Lower than FAB (1300)
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: 'white',
        px: { xs: 1.5, sm: 2 },
        py: { xs: 0.5, sm: 0.75 },
        borderRadius: { xs: 1, sm: 1.5 },
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        fontSize: { xs: '0.7rem', sm: '0.75rem' },
        // Mobile safe area handling (only for mobile)
        '@media (max-width: 599px)': {
          '@supports (padding: env(safe-area-inset-bottom))': {
            bottom: 'calc(16px + env(safe-area-inset-bottom))',
            left: 'calc(16px + env(safe-area-inset-left))'
          }
        },
      }}
    >
      <Typography
        variant="caption"
        component="span"
        sx={{
          fontWeight: 600,
          fontSize: 'inherit'
        }}
      >
        v10.14.0
      </Typography>
    </Box>
  );
};

export default VersionBadge; 
