import { Typography, IconButton, Box } from '@mui/material';
import { ArrowLeft } from '../../icons';

/**
 * Shared inline page header — back arrow + left-aligned title + optional right slot.
 * Sits inside the page's scroll area with no fixed positioning, no border/shadow —
 * flows seamlessly into page content.
 *
 * @param {{ title: string, onBack?: function, actions?: React.ReactNode, sx?: object }} props
 */
export default function HFHeader({ title, onBack, actions, sx }) {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 48,
        gap: 0.5,
        mb: 1,
        ...sx,
      }}
    >
      {/* Left: back arrow */}
      {onBack && (
        <IconButton
          onClick={onBack}
          size="small"
          aria-label="Go back"
          sx={{
            color: 'var(--color-text-soft)',
            '&:hover': { backgroundColor: 'color-mix(in srgb, var(--color-text-soft) 8%, transparent)' },
          }}
        >
          <ArrowLeft size={20} />
        </IconButton>
      )}

      {/* Title: left-aligned, flows after back arrow */}
      <Typography
        variant="h6"
        component="h1"
        sx={{
          color: 'var(--color-text)',
          fontWeight: 700,
          fontSize: '1.05rem',
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </Typography>

      {/* Right: optional action buttons */}
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {actions}
        </Box>
      )}
    </Box>
  );
}
