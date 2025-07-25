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
      sx={{ position: 'absolute', bottom: 24, right: 16, zIndex: 1200, ...sx }}
    >
      <Add sx={{ mr: showLabel ? 1 : 0 }} />
      {showLabel && 'Add Note'}
    </Fab>
  );
};

export default AddNoteFab; 