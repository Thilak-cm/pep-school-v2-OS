import React, { useState } from 'react';
import { IconButton, Tooltip, Zoom, Box } from '@mui/material';
import { ContentCopy, Check } from '@mui/icons-material';
import useNotify from '../notifications/useNotify.js';

/**
 * Small copy-to-clipboard button with success feedback.
 * Props:
 *  - text: string to copy
 *  - size: 'small' | 'medium' (default 'small')
 *  - ariaLabel: optional aria-label for accessibility
 *  - sx: optional style overrides
 *  - onCopied: optional callback after successful copy
 */
export default function CopyToClipboardButton({ text = '', size = 'small', ariaLabel = 'Copy note text', sx = {}, onCopied }) {
  const [copied, setCopied] = useState(false);
  const notify = useNotify();

  const handleCopy = async (e) => {
    // Prevent parent click handlers (like opening dialogs)
    e?.stopPropagation?.();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied && onCopied();
      notify.success('Copied to clipboard', { duration: 2000 });
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
    }
  };

  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy text'} placement="top">
      <IconButton
        aria-label={ariaLabel}
        size={size}
        onClick={handleCopy}
        sx={{
          color: 'inherit',
          backgroundColor: 'transparent',
          border: 'none',
          padding: 0.5,
          minWidth: 'auto',
          minHeight: 'auto',
          '&:hover': { 
            backgroundColor: 'transparent',
            opacity: 0.7,
          },
          ...sx,
        }}
      >
        {/* Smooth icon transition */}
        <Box sx={{ position: 'relative', width: 18, height: 18 }}>
          <Zoom in={!copied} timeout={{ enter: 160, exit: 160 }}>
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ContentCopy fontSize="inherit" />
            </Box>
          </Zoom>
          <Zoom in={copied} timeout={{ enter: 160, exit: 160 }}>
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check fontSize="inherit" />
            </Box>
          </Zoom>
        </Box>
      </IconButton>
    </Tooltip>
  );
}
