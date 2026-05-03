import { Box } from '@mui/material';

/**
 * Tangram-based student avatar — a colored circle with a simple geometric
 * tangram glyph built from CSS triangles/squares.
 *
 * @param {{ size?: number, color?: string, sx?: object }} props
 */
export default function KidAvatar({ size = 46, color = 'var(--color-teal)', sx }) {
  const inner = size * 0.45;
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...sx,
      }}
    >
      {/* Simple tangram glyph: triangle + square */}
      <svg
        width={inner}
        height={inner}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon
          points="4,20 12,4 20,20"
          fill="var(--color-paper)"
          opacity="0.9"
        />
        <rect
          x="9"
          y="14"
          width="6"
          height="6"
          fill="var(--color-paper)"
          opacity="0.6"
        />
      </svg>
    </Box>
  );
}
