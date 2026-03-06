import React from 'react';
import { Box, Typography } from '@mui/material';
import { collectInlineMatches, classifyLine } from './chatUtils';

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

// Render inline markdown matches (bold, italic, code) to JSX
export const formatInlineMarkdown = (text) => {
  if (!text) return '';

  const matches = collectInlineMatches(text);
  if (matches.length === 0) return text;

  const parts = [];
  let currentIndex = 0;

  matches.forEach((match) => {
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

  return parts;
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
    const cls = classifyLine(line);

    if (cls.type === 'ul') {
      if (!inList || listType !== 'ul') {
        flushList();
        inList = true;
        listType = 'ul';
      }
      listItems.push(
        <Box key={`item-${index}`} component="li" sx={{ mb: 0.5 }}>
          {formatInlineMarkdown(cls.content)}
        </Box>
      );
    } else if (cls.type === 'ol') {
      if (!inList || listType !== 'ol') {
        flushList();
        inList = true;
        listType = 'ol';
      }
      listItems.push(
        <Box key={`item-${index}`} component="li" sx={{ mb: 0.5 }}>
          {formatInlineMarkdown(cls.content)}
        </Box>
      );
    } else if (cls.type === 'blank' && inList) {
      // Skip blank lines inside a list
    } else {
      flushList();

      if (cls.type === 'h3') {
        formatted.push(
          <Typography key={index} variant="subtitle2" sx={{ fontWeight: 600, mt: index > 0 ? 1.5 : 0, mb: 0.5 }}>
            {formatInlineMarkdown(cls.content)}
          </Typography>
        );
      } else if (cls.type === 'h2') {
        formatted.push(
          <Typography key={index} variant="subtitle1" sx={{ fontWeight: 600, mt: index > 0 ? 1.5 : 0, mb: 0.5 }}>
            {formatInlineMarkdown(cls.content)}
          </Typography>
        );
      } else if (cls.type === 'h1') {
        formatted.push(
          <Typography key={index} variant="h6" sx={{ fontWeight: 600, mt: index > 0 ? 1.5 : 0, mb: 0.5 }}>
            {formatInlineMarkdown(cls.content)}
          </Typography>
        );
      } else if (cls.type === 'paragraph') {
        formatted.push(
          <Box key={index} component="p" sx={{ m: 0, mb: 1 }}>
            {formatInlineMarkdown(cls.content)}
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
