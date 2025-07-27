import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * A small badge that sticks to the bottom-left corner
 * showing the current application version. Uses different positioning
 * for mobile (fixed to viewport) vs desktop (absolute to container).
 */
const VersionBadge = () => {
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
        v1.1.3
      </Typography>
    </Box>
  );
};

export default VersionBadge; 