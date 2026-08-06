import React from 'react';
import { Fab } from '@mui/material';
import { ChevronDown } from '../../icons';
import { SCROLL_TO_BOTTOM_FAB_LAYER_SX } from './chatPresentation.js';

export default function ScrollToBottomFab({ visible, onClick }) {
  return (
    <Fab size="small" onClick={onClick} aria-label="Scroll to bottom" sx={{ ...SCROLL_TO_BOTTOM_FAB_LAYER_SX, bottom: 12, left: '50%', transform: 'translateX(-50%)', bgcolor: 'white', color: 'text.secondary', opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity .2s' }}>
      <ChevronDown />
    </Fab>
  );
}
