import React, { useState } from 'react';
import { Fab, Box, Typography } from '@mui/material';
import { Plus, Mic, BookOpen, Image } from '../icons';

const MENU_ITEMS = [
  { key: 'media', label: 'Media', Icon: Image },
  { key: 'lesson', label: 'Lesson', Icon: BookOpen },
  { key: 'voice', label: 'Voice', Icon: Mic },
];

/**
 * Floating action button that expands into a card menu
 * with 3 note-type rows (Voice, Lesson, Media — bottom to top).
 */
const AddNoteFab = ({ onVoice, onLesson, onMedia, sx = {} }) => {
  const [open, setOpen] = useState(false);

  const handleToggle = () => setOpen((o) => !o);
  const handleClose = () => setOpen(false);

  const handleSelect = (key) => {
    setOpen(false);
    if (key === 'voice') onVoice?.();
    else if (key === 'lesson') onLesson?.();
    else if (key === 'media') onMedia?.();
  };

  return (
    <>
      {/* Scrim overlay */}
      {open && (
        <Box
          onClick={handleClose}
          sx={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: 1299,
          }}
        />
      )}

      {/* FAB + menu container */}
      <Box
        sx={{
          position: { xs: 'fixed', sm: 'absolute' },
          bottom: { xs: 24, sm: 24 },
          right: { xs: 16, sm: 16 },
          zIndex: 1300,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 1.5,
          pointerEvents: 'none',
          '@media (max-width: 599px)': {
            '@supports (padding: env(safe-area-inset-bottom))': {
              bottom: 'calc(24px + env(safe-area-inset-bottom))'
            }
          },
          ...sx
        }}
      >
        {/* Menu card */}
        <Box
          sx={{
            backgroundColor: 'var(--color-paper, #FFF8F0)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
            overflow: 'hidden',
            opacity: open ? 1 : 0,
            transform: open ? 'scale(1) translateY(0)' : 'scale(0.5) translateY(24px)',
            transition: open
              ? 'opacity 0.25s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
              : 'opacity 0.15s ease, transform 0.15s ease',
            transformOrigin: 'bottom right',
            pointerEvents: open ? 'auto' : 'none',
            minWidth: 180,
          }}
        >
          {MENU_ITEMS.map((item, index) => (
            <Box
              key={item.key}
              onClick={() => handleSelect(item.key)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1.5,
                cursor: 'pointer',
                borderBottom: index < MENU_ITEMS.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                '&:hover': {
                  backgroundColor: 'rgba(0,0,0,0.04)',
                },
                '&:active': {
                  backgroundColor: 'rgba(0,0,0,0.08)',
                },
              }}
            >
              <Typography
                variant="body1"
                sx={{
                  fontWeight: 500,
                  color: 'var(--color-text)',
                  fontSize: '0.95rem',
                }}
              >
                {item.label}
              </Typography>

              <item.Icon size={20} style={{ color: 'var(--color-text-soft)' }} />
            </Box>
          ))}
        </Box>

        {/* Main FAB button */}
        <Fab
          color="primary"
          onClick={handleToggle}
          aria-label={open ? 'Close menu' : 'Add note'}
          sx={{
            minWidth: 56,
            minHeight: 56,
            pointerEvents: 'auto',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
              transform: open ? 'rotate(135deg)' : 'rotate(0deg)',
            }}
          >
            <Plus size={24} />
          </Box>
        </Fab>
      </Box>
    </>
  );
};

export default AddNoteFab;
