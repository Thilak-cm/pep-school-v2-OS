import { Typography, IconButton, Box } from '@mui/material';
import { ArrowLeft } from '../../icons';

/**
 * Shared page header — back arrow + title + optional right slot.
 * This is a *content* header used inside page components, NOT the fixed AppHeader shell.
 * It sits inside the page's scroll area with no fixed positioning.
 *
 * @param {{ title: string, onBack?: function, actions?: React.ReactNode, sx?: object }} props
 */
export default function HFHeader({ title, onBack, actions, sx }) {
  return (
    <Box
      component="header"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        minHeight: 48,
        gap: 0.5,
        mb: 1,
        ...sx,
      }}
    >
      {/* Left: back arrow */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        {onBack ? (
          <IconButton
            onClick={onBack}
            size="small"
            aria-label="Go back"
            sx={{
              color: 'var(--color-text-soft)',
              '&:hover': { backgroundColor: 'rgba(100, 116, 139, 0.08)' },
            }}
          >
            <ArrowLeft size={20} />
          </IconButton>
        ) : (
          <Box sx={{ width: 8 }} />
        )}
      </Box>

      {/* Center: title */}
      <Typography
        variant="h6"
        component="h1"
        sx={{
          color: 'var(--color-text)',
          fontWeight: 700,
          fontSize: '1.05rem',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </Typography>

      {/* Right: optional action buttons */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
        {actions}
      </Box>
    </Box>
  );
}
