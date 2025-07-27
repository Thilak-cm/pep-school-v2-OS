import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * A small badge that sticks to the bottom-left corner of the viewport
 * showing the current application version. Using fixed positioning
 * ensures the badge is visible across all routes/pages without having
 * to include it in each screen individually.
 */
const VersionBadge = () => {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: { xs: 16, sm: 24 },
        left: { xs: 16, sm: 24 },
        zIndex: 1000, // Lower than FAB (1300)
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: 'white',
        px: { xs: 1.5, sm: 2 },
        py: { xs: 0.5, sm: 0.75 },
        borderRadius: { xs: 1, sm: 1.5 },
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
        fontSize: { xs: '0.7rem', sm: '0.75rem' },
        // Mobile safe area handling
        '@supports (padding: env(safe-area-inset-bottom))': {
          bottom: 'calc(16px + env(safe-area-inset-bottom))',
          left: 'calc(16px + env(safe-area-inset-left))'
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
        v1.0
      </Typography>
    </Box>
  );
};

export default VersionBadge; 