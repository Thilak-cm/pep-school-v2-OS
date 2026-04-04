import React from 'react';
import { Box } from '@mui/material';
import { AutoFixHigh } from '@mui/icons-material';

/**
 * Small gradient pill for temporary "New Feature" highlighting.
 *
 * Props:
 *  - label: string (default: 'New Feature')
 *  - showIcon: boolean (default: true)
 *  - size: 'sm' | 'md' (default: 'sm')
 *  - sx: optional MUI sx overrides
 */
const NewFeaturePill = ({ label = 'New Feature', showIcon = true, size = 'sm', sx = {} }) => {
  const paddings = size === 'md' ? { px: 2, py: 0.75 } : { px: 1.5, py: 0.5 };
  const fontSize = size === 'md' ? '0.75rem' : '0.7rem';

  return (
    <Box
      role="note"
      aria-label={`${label}`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        borderRadius: '999px',
        background: 'linear-gradient(90deg, #fde68a 0%, #fca5a5 50%, #a78bfa 100%)',
        color: '#111827',
        fontWeight: 800,
        fontSize,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        lineHeight: 1,
        ...paddings,
        ...sx,
      }}
    >
      {showIcon && <AutoFixHigh sx={{ fontSize: size === 'md' ? 16 : 14 }} aria-hidden />}
      {label}
    </Box>
  );
};

export default NewFeaturePill;
