import React from 'react';
import { Fab } from '@mui/material';
import { Plus as Add } from '../icons';

/**
 * Floating action button for adding a new observation note.
 * 
 * Props:
 *  - onClick: function to invoke when FAB is pressed
 *  - sx: additional MUI sx overrides
 */
const AddNoteFab = ({ onClick, sx = {} }) => {
  return (
    <Fab
      color="primary"
      onClick={onClick}
      aria-label="Add note"
      sx={{
        // Mobile: fixed to viewport
        position: { xs: 'fixed', sm: 'absolute' },
        bottom: { xs: 24, sm: 24 },
        right: { xs: 16, sm: 16 },
        zIndex: 1300,
        // Ensure minimum touch target size
        minWidth: { xs: 56, sm: 56 },
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
      <Add />
    </Fab>
  );
};

export default AddNoteFab; 