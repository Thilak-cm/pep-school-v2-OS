import { Box, Typography, IconButton, Chip } from '@mui/material';
import { X as Close, Eye, Mic, BookOpen, Image } from '../../icons';
import { getTypeChipConfig } from '../classroomTimelineUtils.js';
import { Avatar } from '../ui';
import { formatTimestamp } from '../../utils/observationUtils.jsx';

const TYPE_LABELS = {
  text: 'OBSERVATION',
  voice: 'VOICE NOTE',
  lesson: 'LESSON NOTE',
  media: 'MEDIA NOTE',
};

const TYPE_CHIP_COLORS = {
  text: { bg: 'var(--color-green-bg)', color: 'var(--color-secondary-dark)', border: 'var(--color-green-mint)' },
  voice: { bg: '#fff1f2', color: '#dc2626', border: '#fecdd3' },
  lesson: { bg: 'var(--color-amber-bg)', color: 'var(--color-amber-text)', border: 'var(--color-amber-yellow)' },
  media: { bg: 'var(--color-green-bg)', color: 'var(--color-secondary-dark)', border: 'var(--color-green-mint)' },
};

const TYPE_ICONS = { Eye, Mic, BookOpen, Image };

export default function SharedHeader({ observation, student, teacherName, onClose }) {
  if (!observation) return null;
  const chipConfig = getTypeChipConfig(observation.type);
  const label = TYPE_LABELS[observation.type] || 'OBSERVATION';
  const chipColors = TYPE_CHIP_COLORS[observation.type] || TYPE_CHIP_COLORS.text;
  const IconComp = TYPE_ICONS[chipConfig.iconName] || Eye;

  const studentName =
    student?.name ||
    student?.displayName ||
    [student?.firstName, student?.lastName].filter(Boolean).join(' ') ||
    'Unknown Student';

  return (
    <Box sx={{ px: 2.5, pt: 1.5 }}>
      {/* Row 1: Type chip + Close X */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Chip
          icon={<IconComp size={14} style={{ color: chipColors.color }} />}
          label={label}
          size="small"
          sx={{
            bgcolor: chipColors.bg,
            color: chipColors.color,
            border: `1px solid ${chipColors.border}`,
            fontWeight: 700,
            fontSize: '0.68rem',
            letterSpacing: '0.04em',
            height: 28,
            '& .MuiChip-icon': { ml: 0.75, mr: -0.25 },
          }}
        />
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{
            width: 32,
            height: 32,
            border: '1px solid var(--color-border)',
            bgcolor: 'var(--color-surface)',
          }}
        >
          <Close size={18} />
        </IconButton>
      </Box>

      {/* Row 2: Student name — large, bold */}
      <Typography
        variant="h5"
        sx={{
          fontWeight: 700,
          fontSize: '1.5rem',
          fontFamily: 'var(--font-display, "Schoolbell", cursive)',
          color: 'var(--color-text)',
          mb: 0.75,
        }}
      >
        {studentName}
      </Typography>

      {/* Row 3: Teacher avatar + name + date */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Avatar name={teacherName || 'Unknown'} size="sm" />
        <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', fontSize: '0.82rem' }}>
          by <strong>{teacherName || 'Unknown Teacher'}</strong> · {formatTimestamp(observation.observedAt || observation.timestamp)}
        </Typography>
      </Box>
    </Box>
  );
}
