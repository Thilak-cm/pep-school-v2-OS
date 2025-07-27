import React from 'react';
import { Fab } from '@mui/material';
import { Add } from '@mui/icons-material';

/**
 * Floating action button for adding a new observation note.
 * 
 * Props:
 *  - onClick: function to invoke when FAB is pressed
 *  - showLabel: boolean – if true, shows "Add Note" label next to the plus icon (extended variant)
 *  - sx: additional MUI sx overrides
 */
const AddNoteFab = ({ onClick, showLabel = false, sx = {} }) => {
  return (
    <Fab
      color="primary"
      variant={showLabel ? 'extended' : 'circular'}
      onClick={onClick}
      aria-label="Add note"
      sx={{ 
        // Mobile: fixed to viewport
        position: { xs: 'fixed', sm: 'absolute' },
        bottom: { xs: 24, sm: 24 },
        right: { xs: 16, sm: 16 },
        zIndex: 1300,
        // Ensure minimum touch target size
        minWidth: { xs: 56, sm: showLabel ? 'auto' : 56 },
        minHeight: { xs: 56, sm: 56 },
        // Mobile safe area handling (only for mobile)
        '@media (max-width: 599px)': {
          '@supports (padding: env(safe-area-inset-bottom))': {
            bottom: 'calc(24px + env(safe-area-inset-bottom))'
          }
        },
        ...sx 
      }}
    >
      <Add sx={{ mr: showLabel ? 1 : 0 }} />
      {showLabel && 'Add Note'}
    </Fab>
  );
};

export default AddNoteFab; 