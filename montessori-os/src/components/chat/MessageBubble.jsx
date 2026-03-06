import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import CopyToClipboardButton from '../CopyToClipboardButton';
import { formatMessage, messageContentSx } from './formatMessage';

const MetaRow = ({ message, formatTimestamp, variant }) => {
  const [visible, setVisible] = useState(false);

  const isUser = variant === 'user';

  return (
    <Box
      onTouchStart={() => setVisible((v) => !v)}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        mt: 0.5,
        minHeight: 24,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
    >
      {message.timestamp && (
        <Typography
          variant="caption"
          sx={{
            opacity: 0.7,
            fontSize: '0.7rem',
            color: isUser ? 'white' : 'text.secondary',
          }}
        >
          {formatTimestamp(message.timestamp)}
        </Typography>
      )}
      <CopyToClipboardButton
        text={message.content}
        ariaLabel="Copy message"
        sx={{
          color: isUser ? 'white' : 'text.secondary',
          opacity: 0.7,
          transition: 'opacity 0.2s ease',
          '&:hover': { opacity: 1 },
        }}
      />
    </Box>
  );
};

export const UserBubble = ({ message, formatTimestamp }) => (
  <Box
    sx={{
      maxWidth: '85%',
      p: 2,
      backgroundColor: 'primary.main',
      color: 'white',
      borderRadius: '16px 16px 4px 16px',
      position: 'relative',
    }}
  >
    {message.authorName && (
      <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', mb: 0.5 }}>
        {message.authorName}
      </Typography>
    )}
    <Box component="div" sx={{ ...messageContentSx, fontSize: '0.925rem', lineHeight: 1.55 }}>
      {formatMessage(message.content)}
    </Box>
    <MetaRow message={message} formatTimestamp={formatTimestamp} variant="user" />
  </Box>
);

export const AssistantBubble = ({ message, formatTimestamp }) => (
  <Box
    sx={{
      maxWidth: '92%',
      p: 2,
      backgroundColor: '#f7f7f8',
      borderRadius: '16px 16px 16px 4px',
      position: 'relative',
    }}
  >
    <Box
      component="div"
      sx={{
        ...messageContentSx,
        color: 'text.primary',
        fontSize: '0.925rem',
        lineHeight: 1.6,
      }}
    >
      {formatMessage(message.content)}
    </Box>
    <MetaRow message={message} formatTimestamp={formatTimestamp} variant="assistant" />
  </Box>
);
