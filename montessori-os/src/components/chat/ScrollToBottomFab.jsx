import React from 'react';
import { Fab } from '@mui/material';
import { ChevronDown as KeyboardArrowDown } from '../../icons';

const ScrollToBottomFab = ({ visible, onClick, isKeyboardOpen = false }) => (
  <Fab
    size="small"
    onClick={onClick}
    aria-label="Scroll to bottom"
    sx={{
      position: 'absolute',
      bottom: isKeyboardOpen
        ? { xs: '16px', sm: '96px' }
        : { xs: 'calc(96px + env(safe-area-inset-bottom, 0px))', sm: '96px' },
      transition: 'bottom 0.15s ease-out, opacity 0.2s ease, transform 0.2s ease',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 999,
      backgroundColor: 'white',
      color: 'text.secondary',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      '&:hover': {
        backgroundColor: 'var(--color-neutral-bg-warm)',
      },
    }}
  >
    <KeyboardArrowDown />
  </Fab>
);

export default ScrollToBottomFab;
