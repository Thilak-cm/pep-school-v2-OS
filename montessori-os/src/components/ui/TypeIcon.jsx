import { Box } from '@mui/material';
import { Eye, Mic, BookOpen, Image } from '../../icons';
import { TONE_STYLES } from './toneStyles';

const TYPE_ICONS = { Eye, Mic, BookOpen, Image };

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
