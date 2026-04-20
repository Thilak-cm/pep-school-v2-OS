import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  Avatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  CheckCircle,
  FlagRounded,
  QuestionAnswer,
} from '@mui/icons-material';
import {
  MOCK_INTERVIEWS,
  partitionInterviews,
  formatLastInterviewed,
} from './InterviewsPage.helpers.js';

function InterviewCard({ interview }) {
  const initials = interview.studentName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid #e2e8f0',
        '&:hover': { borderColor: '#c7d2fe' },
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <Avatar
          sx={{
            bgcolor: interview.status === 'completed' ? '#059669' : '#4f46e5',
            width: 44,
            height: 44,
            fontSize: '0.95rem',
            fontWeight: 600,
          }}
        >
          {initials}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {interview.studentName}
            </Typography>
            {interview.hasAlert && (
              <FlagRounded sx={{ fontSize: 16, color: '#ef4444' }} />
            )}
          </Stack>
          <Typography variant="body2" sx={{ color: '#64748b', fontSize: '0.8rem' }}>
            {interview.classroomName} &middot; {interview.teacherName}
          </Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: '0.75rem', mt: 0.25 }}>
            {interview.status === 'completed'
              ? `${interview.exchangeCount} questions · ${formatLastInterviewed(interview.lastInterviewedAt)}`
              : `Last: ${formatLastInterviewed(interview.lastInterviewedAt)}`}
          </Typography>
        </Box>
        {interview.status === 'completed' ? (
          <CheckCircle sx={{ color: '#059669', fontSize: 22 }} />
        ) : (
          <Chip
            label="Upcoming"
            size="small"
            sx={{
              bgcolor: '#eef2ff',
              color: '#4f46e5',
              fontWeight: 600,
              fontSize: '0.7rem',
              height: 24,
            }}
          />
        )}
      </Stack>
    </Paper>
  );
}

function InterviewsPage() {
  const { upcoming, completed } = useMemo(
    () => partitionInterviews(MOCK_INTERVIEWS),
    []
  );

  return (
    <Box sx={{ px: 2, pb: 10, pt: 1 }}>
      {/* This Week section */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <QuestionAnswer sx={{ fontSize: 20, color: '#4f46e5' }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
          This Week
        </Typography>
        <Chip
          label={upcoming.length}
          size="small"
          sx={{
            bgcolor: '#eef2ff',
            color: '#4f46e5',
            fontWeight: 700,
            fontSize: '0.75rem',
            height: 22,
            minWidth: 22,
          }}
        />
      </Stack>

      {upcoming.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 2,
            border: '1px solid #e2e8f0',
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            No interviews scheduled this week.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5} sx={{ mb: 3 }}>
          {upcoming.map((interview) => (
            <InterviewCard key={interview.id} interview={interview} />
          ))}
        </Stack>
      )}

      {/* Completed section */}
      {completed.length > 0 && (
        <Accordion
          defaultExpanded={false}
          elevation={0}
          disableGutters
          sx={{
            border: '1px solid #e2e8f0',
            borderRadius: '8px !important',
            '&:before': { display: 'none' },
            overflow: 'hidden',
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{
              bgcolor: '#f8fafc',
              minHeight: 44,
              '& .MuiAccordionSummary-content': { my: 0.75 },
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <CheckCircle sx={{ fontSize: 18, color: '#059669' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>
                Completed
              </Typography>
              <Chip
                label={completed.length}
                size="small"
                sx={{
                  bgcolor: '#ecfdf5',
                  color: '#059669',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  height: 20,
                  minWidth: 20,
                }}
              />
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 1.5, pt: 0.5 }}>
            <Stack spacing={1}>
              {completed.map((interview) => (
                <InterviewCard key={interview.id} interview={interview} />
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
}

export default InterviewsPage;
