import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import CopyToClipboardButton from '../CopyToClipboardButton';
import { formatMessage, messageContentSx } from './formatMessage';

function MetaRow({ message, formatTimestamp, user }) {
  const [visible, setVisible] = useState(false);
  return (
    <Box onTouchStart={() => setVisible((value) => !value)} onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, minHeight: 24, opacity: visible ? 1 : 0, transition: 'opacity .2s' }}>
      {(message.createdAt || message.timestamp) && <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.7rem', color: user ? 'white' : 'text.secondary' }}>{formatTimestamp(message.createdAt || message.timestamp)}</Typography>}
      <CopyToClipboardButton text={message.content} ariaLabel="Copy message" sx={{ color: user ? 'white' : 'text.secondary', opacity: 0.7 }} />
    </Box>
  );
}

export const UserBubble = ({ message, formatTimestamp }) => (
  <Box sx={{ maxWidth: '85%', p: 2, bgcolor: 'primary.main', color: 'white', borderRadius: '16px 16px 4px 16px' }}>
    {message.authorName && <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', mb: 0.5 }}>{message.authorName}</Typography>}
    <Box component="div" sx={{ ...messageContentSx, fontSize: '0.925rem', lineHeight: 1.55 }}>{formatMessage(message.content)}</Box>
    <MetaRow message={message} formatTimestamp={formatTimestamp} user />
  </Box>
);

export const AssistantBubble = ({ message, formatTimestamp }) => (
  <Box sx={{ maxWidth: '92%', p: 2, bgcolor: 'var(--color-neutral-bg)', borderRadius: '16px 16px 16px 4px' }}>
    <Box component="div" sx={{ ...messageContentSx, color: 'text.primary', fontSize: '0.925rem', lineHeight: 1.6 }}>{formatMessage(message.content)}</Box>
    <MetaRow message={message} formatTimestamp={formatTimestamp} />
  </Box>
);
