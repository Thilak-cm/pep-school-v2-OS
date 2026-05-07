import { Box } from '@mui/material';
import { Eye, Mic, BookOpen, Image } from '../../icons';

const TYPE_ICONS = { Eye, Mic, BookOpen, Image };

const TONE_STYLES = {
  slate:  { bg: 'var(--color-surface)', color: 'var(--color-text-soft)', border: 'var(--color-border)' },
  violet: { bg: 'var(--color-violet-bg)', color: 'var(--color-violet)', border: 'var(--color-violet-soft)' },
  green:  { bg: 'var(--color-green-bg)', color: 'var(--color-secondary-dark)', border: 'var(--color-green-mint)' },
  indigo: { bg: 'var(--color-indigo-bg)', color: 'var(--color-primary)', border: 'var(--color-indigo-soft)' },
  amber:  { bg: 'var(--color-amber-bg)', color: 'var(--color-amber-text)', border: 'var(--color-amber-yellow)' },
};

export default function TypeIcon({ config }) {
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
