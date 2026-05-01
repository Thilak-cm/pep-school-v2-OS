import React from 'react';
import { Fab } from '@mui/material';
import { ChevronDown as KeyboardArrowDown } from '../../icons';

const ScrollToBottomFab = ({ visible, onClick }) => (
  <Fab
    size="small"
    onClick={onClick}
    aria-label="Scroll to bottom"
    sx={{
      position: 'absolute',
      bottom: { xs: 'calc(96px + env(safe-area-inset-bottom, 0px))', sm: '96px' },
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 999,
      backgroundColor: 'white',
      color: 'text.secondary',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      '&:hover': {
        backgroundColor: 'var(--color-neutral-bg-warm)',
      },
    }}
  >
    <KeyboardArrowDown />
  </Fab>
);

export default ScrollToBottomFab;
