import React from 'react';
import { Box, Card, CardContent, Typography, Skeleton } from '@mui/material';
import { Clock as AccessTime } from '../icons';
import { formatTimestamp } from '../utils/observationUtils.jsx';
import { Avatar, Chip } from './ui';
import { getTypeChipConfig, getTeacherForNote } from './classroomTimelineUtils.js';
import {
  getLessonDimensions,
  LESSON_RATING_LABELS,
  LESSON_RATING_COLORS,
} from '../utils/lessonNoteConstraints';

const ROLE_RING_COLORS = {
  teacher: 'var(--color-amber-yellow)',
  classroomadmin: 'var(--color-primary)',
  superadmin: 'var(--color-violet)',
};

function renderLessonSummary(note) {
  const dimensions = getLessonDimensions(note);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
        {note.lessonTitle || 'Lesson Note'}
      </Typography>
      {note.lessonDescription && (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
          {note.lessonDescription}
        </Typography>
      )}
      {note.groupComment && (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
          {note.groupComment}
        </Typography>
      )}
      {dimensions.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {dimensions.map(({ dimension, rating }) => {
            const color = LESSON_RATING_COLORS[rating] || '#475569'; // hex required — downstream concatenation
            return (
              <Box
                key={dimension}
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  px: 1,
                  py: 0.25,
                  borderRadius: 'var(--radius-pill)',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  backgroundColor: `${color}22`,
                  color,
                  border: `1px solid ${color}44`,
                }}
              >
                {dimension}: {LESSON_RATING_LABELS[rating] || 'N/A'}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export default function ClassroomNoteCard({
  note,
  studentName,
  classroomTeachers = [],
  onStudentClick,
  onNoteClick,
  mediaUrls = {},
}) {
  const chipConfig = getTypeChipConfig(note.type);
  const teacher = getTeacherForNote(note, classroomTeachers);
  const ringColor = ROLE_RING_COLORS[teacher.role] || ROLE_RING_COLORS.teacher;

  const mediaPath = note.media?.[0]?.storagePath;
  const mediaUrl = mediaPath ? mediaUrls[mediaPath] : null;
  const isMedia = note.type === 'media';
  const isLesson = note.type === 'lesson';

  return (
    <Card
      sx={{
        cursor: 'pointer',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
        transition: 'all 0.2s ease-in-out',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
      aria-label={`View details for observation from ${formatTimestamp(note.observedAt || note.timestamp)}`}
      onClick={onNoteClick}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {/* Author row: Avatar + Name ... Type Chip */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar
              name={teacher.displayName}
              src={teacher.photoURL}
              size="sm"
              ringColor={ringColor}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
              {teacher.displayName}
            </Typography>
          </Box>
          <Chip
            label={chipConfig.label}
            tone={chipConfig.tone}
            size="small"
          />
        </Box>

        {/* Student name — clickable */}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: 'var(--color-primary)',
            cursor: 'pointer',
            mb: 1,
            fontSize: '0.8rem',
            '&:hover': { textDecoration: 'underline' },
          }}
          onClick={(e) => {
            e.stopPropagation();
            onStudentClick();
          }}
        >
          {studentName}
        </Typography>

        {/* Content — type-specific */}
        {isLesson ? (
          renderLessonSummary(note)
        ) : isMedia ? (
          /* Media: side-by-side thumbnail + text */
          <Box sx={{ display: 'flex', gap: 1.5, mb: 0.5 }}>
            <Box sx={{ flexShrink: 0, width: 100, height: 80, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              {mediaUrl ? (
                <Box
                  component="img"
                  src={mediaUrl}
                  alt="Media"
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : mediaPath ? (
                <Skeleton variant="rounded" width={100} height={80} animation="wave" />
              ) : null}
            </Box>
            {note.text && (
              <Typography
                variant="body2"
                sx={{
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '0.82rem',
                  flex: 1,
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {note.text}
              </Typography>
            )}
          </Box>
        ) : (
          /* Text / Voice: full-width body */
          <Typography
            variant="body2"
            sx={{
              mb: 0.5,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '0.82rem',
              display: '-webkit-box',
              WebkitLineClamp: 5,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {note.text || '(transcribing\u2026)'}
          </Typography>
        )}

        {/* Timestamp */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1 }}>
          <AccessTime size={13} style={{ color: 'var(--color-text-faint)' }} />
          <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', fontSize: '0.72rem' }}>
            {formatTimestamp(note.observedAt || note.timestamp)}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
