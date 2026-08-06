import React from 'react';
import { Fab } from '@mui/material';
import { ChevronDown } from '../../icons';

export default function ScrollToBottomFab({ visible, onClick, isKeyboardOpen = false }) {
  return (
    <Fab size="small" onClick={onClick} aria-label="Scroll to bottom" sx={{ position: 'fixed', bottom: isKeyboardOpen ? 72 : 'calc(176px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)', zIndex: 999, bgcolor: 'white', color: 'text.secondary', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'bottom .15s, opacity .2s' }}>
      <ChevronDown />
    </Fab>
  );
}
