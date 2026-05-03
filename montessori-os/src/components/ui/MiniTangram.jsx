import { Box } from '@mui/material';

/**
 * Tiny tangram glyph for classroom tiles — a small geometric badge.
 *
 * @param {{ size?: number, color?: string, sx?: object }} props
 */
export default function MiniTangram({ size = 20, color = 'var(--color-primary)', sx }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        ...sx,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon points="2,18 10,2 18,18" fill={color} opacity="0.85" />
        <rect x="7" y="11" width="6" height="6" fill={color} opacity="0.55" />
      </svg>
    </Box>
  );
}
