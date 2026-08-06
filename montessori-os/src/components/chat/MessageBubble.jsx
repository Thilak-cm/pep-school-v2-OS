import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { ThumbsUp } from '../../icons';
import CopyToClipboardButton from '../CopyToClipboardButton';
import MarkdownMessage from './MarkdownMessage.jsx';
import { formatChatTimestamp, getBubbleAnimationSx, shouldShowAssistantActions } from './chatPresentation.js';

function UserMetaRow({ message }) {
  return (
    <Box
      data-message-meta="user"
      sx={{ display: 'flex', visibility: 'visible', opacity: 1, alignItems: 'center', gap: 0.5, mt: 0.5, minHeight: 24 }}
    >
      {(message.createdAt || message.timestamp) && (
        <Typography variant="caption" sx={{ opacity: 0.82, fontSize: '0.7rem', color: 'white' }}>
          {formatChatTimestamp(message.createdAt || message.timestamp)}
        </Typography>
      )}
      <CopyToClipboardButton text={message.content} ariaLabel="Copy message" sx={{ color: 'white', opacity: 0.82 }} />
    </Box>
  );
}

function AssistantMetaRow({ message }) {
  if (!shouldShowAssistantActions(message)) return null;
  return (
    <Box
      data-message-meta="assistant"
      sx={{ display: 'flex', visibility: 'visible', opacity: 1, alignItems: 'center', gap: 0.5, mt: 0.5, minHeight: 24 }}
    >
      <CopyToClipboardButton text={message.content} ariaLabel="Copy message" sx={{ color: 'text.secondary', opacity: 0.82 }} />
      <IconButton aria-label="Helpful" size="small" sx={{ color: 'text.secondary', visibility: 'visible', opacity: 1, p: 0.5 }}>
        <ThumbsUp size={17} />
      </IconButton>
    </Box>
  );
}

export const UserBubble = ({ message, animate = false }) => (
  <Box sx={{ maxWidth: '85%', p: 2, bgcolor: 'primary.main', color: 'white', borderRadius: '16px 16px 4px 16px', ...getBubbleAnimationSx(animate) }}>
    {message.authorName && <Typography variant="caption" sx={{ opacity: 0.88, display: 'block', mb: 0.5 }}>{message.authorName}</Typography>}
    <MarkdownMessage sx={{ fontSize: '0.925rem', lineHeight: 1.55 }}>{message.content}</MarkdownMessage>
    <UserMetaRow message={message} />
  </Box>
);

export const AssistantBubble = ({ message, animate = false }) => (
  <Box sx={{ maxWidth: '92%', p: 2, bgcolor: 'var(--color-neutral-bg)', borderRadius: '16px 16px 16px 4px', ...getBubbleAnimationSx(animate) }}>
    <MarkdownMessage sx={{ color: 'text.primary', fontSize: '0.925rem', lineHeight: 1.6 }}>{message.content}</MarkdownMessage>
    <AssistantMetaRow message={message} />
  </Box>
);
