import React from 'react';
import { Box, Card, CardContent, Typography, Skeleton } from '@mui/material';
import { Clock as AccessTime, User as Person } from '../icons';
import { formatTimestamp } from '../utils/observationUtils.jsx';
import { getTypeChipConfig, getTeacherForNote } from './classroomTimelineUtils.js';
import { TypeIcon } from './ui';
import {
  getLessonDimensions,
  LESSON_RATING_LABELS,
  LESSON_RATING_COLORS,
} from '../utils/lessonNoteConstraints';

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
          {dimensions.map(({ name, value }) => {
            const color = LESSON_RATING_COLORS[value] || '#475569'; // hex required — downstream concatenation
            return (
              <Box
                key={name}
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
                {name}: {LESSON_RATING_LABELS[value] || 'N/A'}
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
  isTransferred = false,
  transferredToClassroomName,
  classroomTeachers = [],
  onStudentClick,
  onNoteClick,
  mediaUrls = {},
  variant,
}) {
  const chipConfig = getTypeChipConfig(note.type);
  const teacher = getTeacherForNote(note, classroomTeachers);
  const isStudentVariant = variant === 'student';

  const mediaPath = note.media?.[0]?.storagePath ?? note.mediaItems?.[0]?.storagePath;
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
        {/* Row 1: Name + TypeIcon */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: isStudentVariant ? 1 : 0.75 }}>
          {isStudentVariant ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Person size={18} style={{ color: 'var(--color-text-soft)' }} />
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-text)' }}
              >
                {teacher.displayName}{teacher.status === 'inactive' ? ' (removed)' : ''}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  color: 'var(--color-primary)',
                  cursor: 'pointer',
                  fontSize: '0.92rem',
                  '&:hover': { textDecoration: 'underline' },
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onStudentClick();
                }}
              >
                {studentName}
              </Typography>
              {isTransferred && (
                <Typography
                  component="span"
                  sx={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    color: '#b45309',
                    backgroundColor: '#fef3c7',
                    px: 0.75,
                    py: 0.15,
                    borderRadius: 'var(--radius-pill)',
                    border: '1px solid #fde68a',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {transferredToClassroomName ? `Transferred to ${transferredToClassroomName}` : 'Transferred'}
                </Typography>
              )}
            </Box>
          )}
          <TypeIcon config={chipConfig} />
        </Box>

        {/* Row 2: Teacher icon + name — hidden for student variant */}
        {!isStudentVariant && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
            <Person size={14} style={{ color: 'var(--color-text-faint)' }} />
            <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', fontSize: '0.78rem' }}>
              {teacher.displayName}{teacher.status === 'inactive' ? ' (removed)' : ''}
            </Typography>
          </Box>
        )}

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
