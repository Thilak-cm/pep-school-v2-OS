import React from 'react';
import { Fab } from '@mui/material';
import { ChevronDown } from '../../icons';

export default function ScrollToBottomFab({ visible, onClick }) {
  return (
    <Fab size="small" onClick={onClick} aria-label="Scroll to bottom" sx={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 2, bgcolor: 'white', color: 'text.secondary', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity .2s' }}>
      <ChevronDown />
    </Fab>
  );
}
