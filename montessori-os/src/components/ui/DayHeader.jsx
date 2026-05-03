import { Box, Typography } from '@mui/material';

/**
 * Section divider for day-grouped lists ("Today", "Yesterday", "Beyond 7 Days").
 * Optional accent dot for highlighted sections.
 *
 * @param {{ label: string, accent?: boolean, sx?: object }} props
 */
export default function DayHeader({ label, accent = false, sx }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 1,
        px: 0.5,
        ...sx,
      }}
    >
      {accent && (
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: 'var(--color-primary)',
            flexShrink: 0,
          }}
        />
      )}
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          color: accent ? 'var(--color-primary)' : 'var(--color-text-soft)',
          fontSize: '0.7rem',
        }}
      >
        {label}
      </Typography>
      <Box
        sx={{
          flex: 1,
          height: '1px',
          bgcolor: 'var(--color-border)',
        }}
      />
    </Box>
  );
}
