import React from 'react';
import { keyframes } from '@emotion/react';
import { Box, Typography } from '@mui/material';

const bounce = keyframes`0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); }`;

export default function TypingIndicator() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 1, width: '100%', px: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'var(--color-neutral-bg)', borderRadius: 4, px: 2, py: 1.5 }}>
        <Box sx={{ display: 'flex', gap: 0.5 }}>{[0, 1, 2].map((index) => <Box key={index} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'var(--color-text-faint)', animation: `${bounce} 1.2s ease-in-out infinite`, animationDelay: `${index * 0.15}s` }} />)}</Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>Coach Pepper is thinking...</Typography>
      </Box>
    </Box>
  );
}
