import React from 'react';
import { Box, Typography } from '@mui/material';
import { collectInlineMatches, classifyLine } from './chatUtils';

export const messageContentSx = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  '& ul, & ol': { margin: 0, paddingLeft: 2 },
  '& p': { margin: 0, marginBottom: 1, '&:last-child': { marginBottom: 0 } },
};

export const formatInlineMarkdown = (text) => {
  if (!text) return '';
  const matches = collectInlineMatches(text);
  if (!matches.length) return text;
  const parts = [];
  let cursor = 0;
  matches.forEach((match) => {
    if (match.start > cursor) parts.push(text.slice(cursor, match.start));
    if (match.type === 'bold') parts.push(<strong key={`bold-${match.start}`}>{match.content}</strong>);
    if (match.type === 'italic') parts.push(<em key={`italic-${match.start}`}>{match.content}</em>);
    if (match.type === 'code') {
      parts.push(<Box key={`code-${match.start}`} component="code" sx={{ bgcolor: 'rgba(0,0,0,0.06)', px: 0.4, borderRadius: 1, fontFamily: 'monospace' }}>{match.content}</Box>);
    }
    cursor = match.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
};

export const formatMessage = (text) => {
  if (!text) return '';
  const formatted = [];
  let listItems = [];
  let listType = null;
  const flushList = () => {
    if (!listItems.length) return;
    formatted.push(<Box key={`list-${formatted.length}`} component={listType} sx={{ m: 0, pl: 2, mb: 1 }}>{listItems}</Box>);
    listItems = [];
    listType = null;
  };

  text.split('\n').forEach((line, index) => {
    const item = classifyLine(line);
    if (item.type === 'ul' || item.type === 'ol') {
      if (listType && listType !== item.type) flushList();
      listType = item.type;
      listItems.push(<Box key={`item-${index}`} component="li" sx={{ mb: 0.5 }}>{formatInlineMarkdown(item.content)}</Box>);
      return;
    }
    if (item.type === 'blank' && listType) return;
    flushList();
    if (item.type === 'blank') formatted.push(<br key={index} />);
    else if (item.type === 'paragraph') formatted.push(<Box key={index} component="p" sx={{ m: 0, mb: 1 }}>{formatInlineMarkdown(item.content)}</Box>);
    else {
      const variant = item.type === 'h1' ? 'h6' : item.type === 'h2' ? 'subtitle1' : 'subtitle2';
      formatted.push(<Typography key={index} variant={variant} sx={{ fontWeight: 600, mt: index ? 1.5 : 0, mb: 0.5 }}>{formatInlineMarkdown(item.content)}</Typography>);
    }
  });
  flushList();
  return formatted;
};
