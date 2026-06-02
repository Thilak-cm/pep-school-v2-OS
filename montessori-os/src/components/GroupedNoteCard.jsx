import React from 'react';
import { Box, Card, CardContent, Typography, Chip as MuiChip } from '@mui/material';
import { Clock as AccessTime, User as Person } from '../icons';
import { formatTimestamp } from '../utils/observationUtils.jsx';
import { getTypeChipConfig, getTeacherForNote } from './classroomTimelineUtils.js';
import { TypeIcon } from './ui';
import {
  getLessonDimensions,
  LESSON_RATING_LABELS,
  LESSON_RATING_COLORS,
} from '../utils/lessonNoteConstraints';

function renderLessonSummary(note, showGroupDefaults = false) {
  const dimensions = getLessonDimensions(note);
  const groupDefaults = note.groupDefaults || {};
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
      {showGroupDefaults && Object.keys(groupDefaults).length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Group Defaults:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {Object.entries(groupDefaults).map(([dimension, rating]) => {
              const color = LESSON_RATING_COLORS[rating] || LESSON_RATING_COLORS.na;
              return (
                <MuiChip
                  key={`group-default-${dimension}`}
                  size="small"
                  label={`${dimension}: ${LESSON_RATING_LABELS[rating] || 'N/A'}`}
                  sx={{
                    backgroundColor: `${color}22`,
                    color,
                    border: '1px dashed',
                    borderColor: color,
                  }}
                />
              );
            })}
          </Box>
        </Box>
      ) : dimensions.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {dimensions.map(({ name, value }) => {
            const color = LESSON_RATING_COLORS[value] || LESSON_RATING_COLORS.na;
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
      ) : null}
    </Box>
  );
}

const getStudentDisplayName = (student) => {
  if (!student) return 'Unknown Student';
  return student.displayName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown Student';
};

function ClickableName({ student, onNavigateToStudent }) {
  return (
    <Typography
      variant="body2"
      component="span"
      sx={{
        fontWeight: 600,
        color: 'var(--color-primary)',
        cursor: 'pointer',
        fontSize: '0.88rem',
        '&:hover': { textDecoration: 'underline' },
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (onNavigateToStudent && student) onNavigateToStudent(student);
      }}
    >
      {getStudentDisplayName(student)}
    </Typography>
  );
}

function StudentNames({ studentsInGroup, onNavigateToStudent }) {
  if (studentsInGroup.length === 0) {
    return <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: '0.8rem' }}>Multiple students</Typography>;
  }

  if (studentsInGroup.length <= 2) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexWrap: 'wrap' }}>
        {studentsInGroup.map((s, i) => (
          <React.Fragment key={s.id}>
            {i > 0 && <Typography component="span" sx={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.8rem' }}>, </Typography>}
            <ClickableName student={s} onNavigateToStudent={onNavigateToStudent} />
          </React.Fragment>
        ))}
      </Box>
    );
  }

  const remaining = studentsInGroup.length - 2;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexWrap: 'wrap' }}>
      <ClickableName student={studentsInGroup[0]} onNavigateToStudent={onNavigateToStudent} />
      <Typography component="span" sx={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.8rem' }}>, </Typography>
      <ClickableName student={studentsInGroup[1]} onNavigateToStudent={onNavigateToStudent} />
      <Typography component="span" sx={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.8rem' }}> + {remaining} more</Typography>
    </Box>
  );
}

export default function GroupedNoteCard({
  groupedNote,
  classroomStudents,
  classroomTeachers = [],
  onNoteClick,
  onNavigateToStudent,
  lessonTitleById,
}) {
  const note = groupedNote.representativeNote;
  const chipConfig = getTypeChipConfig(note.type);
  const teacher = getTeacherForNote(note, classroomTeachers);
  const isLesson = note.type === 'lesson';

  const studentsInGroup = groupedNote.studentIds
    .map((sid) => classroomStudents.find((s) => s.id === sid))
    .filter(Boolean);

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
        {/* Row 1: Student names (prominent) ... Type Chip with icon */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
          <StudentNames studentsInGroup={studentsInGroup} onNavigateToStudent={onNavigateToStudent} />
          <TypeIcon config={chipConfig} />
        </Box>

        {/* Row 2: Teacher icon + name (simple) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
          <Person size={14} style={{ color: 'var(--color-text-faint)' }} />
          <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', fontSize: '0.78rem' }}>
            {teacher.displayName}{teacher.status === 'inactive' ? ' (removed)' : ''}
          </Typography>
        </Box>

        {/* Content */}
        {isLesson ? (
          renderLessonSummary(note, !!note.groupDefaults)
        ) : (
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

        {/* Linked lesson tags */}
        {!isLesson && Array.isArray(note.linkedLessonObservationId) && note.linkedLessonObservationId.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Tagged Lesson Notes:
            </Typography>
            {note.linkedLessonObservationId.map((id) => (
              <MuiChip
                key={id}
                size="small"
                variant="outlined"
                label={lessonTitleById[id] || 'Lesson note'}
                sx={{ borderRadius: 999 }}
              />
            ))}
          </Box>
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
