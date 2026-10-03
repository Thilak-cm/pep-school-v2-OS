import { Box, Typography, Chip } from '@mui/material';
import { MessageCircle } from '../../icons';
import {
  getLessonDimensions,
  LESSON_RATING_LABELS,
  LESSON_RATING_COLORS,
} from '../../utils/lessonNoteConstraints';
export default function LessonAndPracticeContent({ observation, onLinkedLessonTap }) {
  if (!observation) return null;
  const dimensions = getLessonDimensions(observation);
  const isPractice = observation.type === 'practice';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Title */}
      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--color-text)' }}>
        {observation.lessonTitle || (isPractice ? 'Practice Note' : 'Lesson Note')}
      </Typography>

      {/* Linked lesson reference (practice only) */}
      {isPractice && observation.linkedLesson && (
        <Chip
          size="small"
          label={`Follow-up of: ${observation.linkedLesson.lessonTitle}${observation.linkedLesson.observedAt ? ` (${new Date(observation.linkedLesson.observedAt?.toDate?.() || observation.linkedLesson.observedAt).toLocaleDateString()})` : ''}`}
          variant="outlined"
          color="primary"
          onClick={() => onLinkedLessonTap?.(observation.linkedLesson)}
          sx={{ cursor: onLinkedLessonTap ? 'pointer' : 'default', justifyContent: 'flex-start', width: 'fit-content' }}
        />
      )}

      {/* Description */}
      {observation.lessonDescription && (
        <Typography variant="body2" sx={{ color: 'var(--color-text)', fontSize: '0.88rem', lineHeight: 1.6 }}>
          {observation.lessonDescription}
        </Typography>
      )}

      {/* Dimension rating chips */}
      {dimensions.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {dimensions.map((dimension) => {
            const rating = dimension.value || 'na';
            const label = LESSON_RATING_LABELS[rating] || 'N/A';
            const color = LESSON_RATING_COLORS[rating] || 'var(--grey-600)';
            return (
              <Chip
                key={`${observation.id}-${dimension.name}`}
                size="small"
                label={`${dimension.name}  :  ${label}`}
                sx={{
                  backgroundColor: `${color}18`,
                  color,
                  border: `1px solid ${color}40`,
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  height: 30,
                  justifyContent: 'flex-start',
                  width: 'fit-content',
                }}
              />
            );
          })}
        </Box>
      )}

      {/* Group comment */}
      {observation.groupComment && (
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
          {observation.groupComment}
        </Typography>
      )}

      {/* Teacher comment blockquote */}
      {observation.studentComment && (
        <Box
          sx={{
            borderLeft: '3px solid var(--color-amber-yellow)',
            bgcolor: 'var(--color-amber-bg)',
            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            px: 2,
            py: 1.5,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'var(--color-text)',
              fontSize: '0.88rem',
            }}
          >
            <MessageCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            {observation.studentComment}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
