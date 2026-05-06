import React from 'react';
import { Box, Card, CardContent, Typography, Skeleton } from '@mui/material';
import { Clock as AccessTime, User as Person, Mic, BookOpen, Image, Eye } from '../icons';
import { formatTimestamp } from '../utils/observationUtils.jsx';
import { getTypeChipConfig, getTeacherForNote } from './classroomTimelineUtils.js';
import {
  getLessonDimensions,
  LESSON_RATING_LABELS,
  LESSON_RATING_COLORS,
} from '../utils/lessonNoteConstraints';

const TYPE_ICONS = { Eye, Mic, BookOpen, Image };

const TONE_STYLES = {
  slate:  { bg: 'var(--color-surface)', color: 'var(--color-text-soft)', border: 'var(--color-border)' },
  violet: { bg: 'var(--color-violet-bg)', color: 'var(--color-violet)', border: 'var(--color-violet-soft)' },
  green:  { bg: 'var(--color-green-bg)', color: 'var(--color-secondary-dark)', border: 'var(--color-green-mint)' },
  indigo: { bg: 'var(--color-indigo-bg)', color: 'var(--color-primary)', border: 'var(--color-indigo-soft)' },
  amber:  { bg: 'var(--color-amber-bg)', color: 'var(--color-amber-text)', border: 'var(--color-amber-yellow)' },
};

function TypeIcon({ config }) {
  const IconComp = TYPE_ICONS[config.iconName] || Eye;
  const tone = TONE_STYLES[config.tone] || TONE_STYLES.slate;
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: 'var(--radius-pill)',
        bgcolor: tone.bg,
        border: `1px solid ${tone.border}`,
        flexShrink: 0,
      }}
    >
      <IconComp size={15} style={{ color: tone.color }} />
    </Box>
  );
}

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
        {/* Row 1: Student name (prominent) ... Type Chip with icon */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
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
          <TypeIcon config={chipConfig} />
        </Box>

        {/* Row 2: Teacher icon + name (simple) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
          <Person size={14} style={{ color: 'var(--color-text-faint)' }} />
          <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', fontSize: '0.78rem' }}>
            {teacher.displayName}
          </Typography>
        </Box>

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
