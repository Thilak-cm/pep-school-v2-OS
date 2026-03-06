import React from 'react';
import { Box, Typography } from '@mui/material';

export const messageContentSx = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  '& ul': {
    margin: 0,
    paddingLeft: 2,
    listStyleType: 'disc',
  },
  '& ol': {
    margin: 0,
    paddingLeft: 2,
  },
  '& p': {
    margin: 0,
    marginBottom: 1,
    '&:last-child': {
      marginBottom: 0,
    },
  },
};

// Format inline markdown (bold, italic, code)
export const formatInlineMarkdown = (text) => {
  if (!text) return '';

  const parts = [];
  let currentIndex = 0;

  const patterns = [
    { regex: /\*\*([^*]+)\*\*/g, type: 'bold' },
    { regex: /\*([^*]+)\*/g, type: 'italic' },
    { regex: /`([^`]+)`/g, type: 'code' },
  ];

  const matches = [];
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: pattern.type,
        content: match[1],
        fullMatch: match[0],
      });
    }
  });

  matches.sort((a, b) => a.start - b.start);

  const filteredMatches = [];
  matches.forEach((match) => {
    const overlaps = filteredMatches.some(
      (m) => match.start < m.end && match.end > m.start
    );
    if (!overlaps) {
      filteredMatches.push(match);
    }
  });

  filteredMatches.forEach((match) => {
    if (match.start > currentIndex) {
      parts.push(text.substring(currentIndex, match.start));
    }

    if (match.type === 'bold') {
      parts.push(<strong key={`bold-${match.start}`}>{match.content}</strong>);
    } else if (match.type === 'italic') {
      parts.push(<em key={`italic-${match.start}`}>{match.content}</em>);
    } else if (match.type === 'code') {
      parts.push(
        <Box
          key={`code-${match.start}`}
          component="code"
          sx={{
            backgroundColor: 'rgba(0,0,0,0.06)',
            padding: '0.1em 0.4em',
            borderRadius: '4px',
            fontSize: '0.875em',
            fontFamily: 'monospace',
          }}
        >
          {match.content}
        </Box>
      );
    }

    currentIndex = match.end;
  });

  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }

  return parts.length > 0 ? parts : text;
};

// Basic markdown formatting function
export const formatMessage = (text) => {
  if (!text) return '';

  const lines = text.split('\n');
  const formatted = [];
  let inList = false;
  let listItems = [];
  let listType = null;

  const flushList = () => {
    if (listItems.length > 0) {
      const ListComponent = listType === 'ol' ? 'ol' : 'ul';
      const listStyleType = listType === 'ol' ? 'decimal' : 'disc';
      formatted.push(
        <Box key={`list-${formatted.length}`} component={ListComponent} sx={{ m: 0, pl: 2, mb: 1, listStyle: listStyleType }}>
          {listItems}
        </Box>
      );
      listItems = [];
      inList = false;
      listType = null;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.match(/^[-*]\s+/)) {
      const content = trimmed.replace(/^[-*]\s+/, '');
      if (!inList || listType !== 'ul') {
        flushList();
        inList = true;
        listType = 'ul';
      }
      listItems.push(
        <Box key={`item-${index}`} component="li" sx={{ mb: 0.5 }}>
          {formatInlineMarkdown(content)}
        </Box>
      );
    } else if (trimmed.match(/^\d+\.\s+/)) {
      const content = trimmed.replace(/^\d+\.\s+/, '');
      if (!inList || listType !== 'ol') {
        flushList();
        inList = true;
        listType = 'ol';
      }
      listItems.push(
        <Box key={`item-${index}`} component="li" sx={{ mb: 0.5 }}>
          {formatInlineMarkdown(content)}
        </Box>
      );
    } else if (!trimmed && inList) {
      // Skip blank lines inside a list
    } else {
      flushList();

      if (trimmed.startsWith('###')) {
        const content = trimmed.replace(/^###\s+/, '');
        formatted.push(
          <Typography key={index} variant="subtitle2" sx={{ fontWeight: 600, mt: index > 0 ? 1.5 : 0, mb: 0.5 }}>
            {formatInlineMarkdown(content)}
          </Typography>
        );
      } else if (trimmed.startsWith('##')) {
        const content = trimmed.replace(/^##\s+/, '');
        formatted.push(
          <Typography key={index} variant="subtitle1" sx={{ fontWeight: 600, mt: index > 0 ? 1.5 : 0, mb: 0.5 }}>
            {formatInlineMarkdown(content)}
          </Typography>
        );
      } else if (trimmed.startsWith('#')) {
        const content = trimmed.replace(/^#\s+/, '');
        formatted.push(
          <Typography key={index} variant="h6" sx={{ fontWeight: 600, mt: index > 0 ? 1.5 : 0, mb: 0.5 }}>
            {formatInlineMarkdown(content)}
          </Typography>
        );
      } else if (trimmed) {
        formatted.push(
          <Box key={index} component="p" sx={{ m: 0, mb: 1 }}>
            {formatInlineMarkdown(trimmed)}
          </Box>
        );
      } else {
        formatted.push(<br key={index} />);
      }
    }
  });

  flushList();

  return formatted;
};
