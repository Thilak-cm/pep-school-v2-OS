import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Box, Typography } from '@mui/material';
import { safeLinkProps } from './chatPresentation.js';

const markdownSx = {
  wordBreak: 'break-word',
  '& > :first-child': { mt: 0 },
  '& > :last-child': { mb: 0 },
};

const markdownComponents = {
  h1: ({ children }) => <Typography component="h1" variant="h6" sx={{ mt: 1.5, mb: 0.75, fontWeight: 700 }}>{children}</Typography>,
  h2: ({ children }) => <Typography component="h2" variant="subtitle1" sx={{ mt: 1.25, mb: 0.5, fontWeight: 700 }}>{children}</Typography>,
  h3: ({ children }) => <Typography component="h3" variant="subtitle2" sx={{ mt: 1, mb: 0.5, fontWeight: 700 }}>{children}</Typography>,
  p: ({ children }) => <Box component="p" sx={{ m: 0, mb: 1 }}>{children}</Box>,
  ul: ({ children }) => <Box component="ul" sx={{ mt: 0, mb: 1, pl: 2.5 }}>{children}</Box>,
  ol: ({ children }) => <Box component="ol" sx={{ mt: 0, mb: 1, pl: 2.5 }}>{children}</Box>,
  li: ({ children }) => <Box component="li" sx={{ mb: 0.5 }}>{children}</Box>,
  em: ({ children }) => <Box component="em">{children}</Box>,
  strong: ({ children }) => <Box component="strong">{children}</Box>,
  pre: ({ children }) => <Box component="pre" sx={{ m: 0, mb: 1, p: 1.25, overflowX: 'auto', borderRadius: 1.5, bgcolor: 'rgba(0,0,0,.08)' }}>{children}</Box>,
  code: ({ className, children }) => <Box component="code" className={className} sx={{ px: 0.45, py: 0.15, borderRadius: 0.75, fontFamily: 'monospace', fontSize: '0.9em' }}>{children}</Box>,
  a: ({ href, children }) => {
    const props = safeLinkProps(href);
    return props.href ? <Box component="a" {...props} sx={{ color: 'inherit', textDecoration: 'underline' }}>{children}</Box> : <span>{children}</span>;
  },
};

export default function MarkdownMessage({ children, sx = {} }) {
  return (
    <Box sx={{ ...markdownSx, ...sx }}>
      <ReactMarkdown skipHtml components={markdownComponents}>{children || ''}</ReactMarkdown>
    </Box>
  );
}
