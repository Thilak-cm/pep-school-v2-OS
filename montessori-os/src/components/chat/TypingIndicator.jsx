import React from 'react';
import { keyframes } from '@emotion/react';
import { Box, Typography } from '@mui/material';

const bounce = keyframes`
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
`;

const TypingIndicator = () => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'flex-start',
      mb: 1,
      width: '100%',
      px: 1,
    }}
  >
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        backgroundColor: '#f7f7f8',
        borderRadius: '16px',
        px: 2,
        py: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: '#a0a0a0',
              animation: `${bounce} 1.2s ease-in-out infinite`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
        Thinking...
      </Typography>
    </Box>
  </Box>
);

export default TypingIndicator;
