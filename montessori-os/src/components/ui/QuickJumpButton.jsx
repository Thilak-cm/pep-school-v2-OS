// QuickJumpButton — shared action button (icon + label) used in LandingPage, StudentDashboard, etc.
import React from 'react';
import { ButtonBase, Box, Typography } from '@mui/material';

function QuickJumpButton({ icon, label, iconColor, onClick }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        py: 1.5, px: 1, borderRadius: 3,
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-border)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' },
        '&:active': { transform: 'scale(0.96)' },
      }}
    >
      <Box sx={{ color: iconColor, display: 'flex' }}>
        {icon}
      </Box>
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'var(--color-text)' }}>
        {label}
      </Typography>
    </ButtonBase>
  );
}

export default QuickJumpButton;
