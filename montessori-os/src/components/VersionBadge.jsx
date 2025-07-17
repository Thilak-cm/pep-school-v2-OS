import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * A small badge that sticks to the bottom-right corner of the viewport
 * showing the current application version. Using fixed positioning
 * ensures the badge is visible across all routes/pages without having
 * to include it in each screen individually.
 */
const VersionBadge = () => {
  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: 8,
        right: 8,
        zIndex: 2000,
        backgroundColor: 'rgba(0,0,0,0.6)',
        color: 'white',
        px: 1.5,
        py: 0.5,
        borderRadius: 1,
        backdropFilter: 'blur(4px)',
        pointerEvents: 'none',
      }}
    >
      <Typography variant="caption" component="span" sx={{ fontWeight: 600 }}>
        v1.0
      </Typography>
    </Box>
  );
};

export default VersionBadge; 