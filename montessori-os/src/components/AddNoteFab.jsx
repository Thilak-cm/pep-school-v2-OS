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
        position: 'fixed',
        bottom: { xs: 24, sm: 32 },
        right: { xs: 16, sm: 24 },
        zIndex: 1300, // Higher than modal backdrop
        // Ensure minimum touch target size
        minWidth: { xs: 56, sm: showLabel ? 'auto' : 56 },
        minHeight: { xs: 56, sm: 56 },
        // Mobile safe area handling
        '@supports (padding: env(safe-area-inset-bottom))': {
          bottom: 'calc(24px + env(safe-area-inset-bottom))'
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