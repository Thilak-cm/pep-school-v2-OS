import { Box } from '@mui/material';

/**
 * Tiny tangram glyph for classroom tiles — five flat-color polygons at varied
 * opacities forming an off-balance pinwheel. One ink color, no stroke.
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
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 1. Top-left triangle — darkest anchor */}
        <polygon points="2,2 16,2 2,16" fill={color} opacity="0.9" />
        {/* 2. Top-right triangle */}
        <polygon points="16,2 30,2 30,16" fill={color} opacity="0.55" />
        {/* 3. Center wedge — rotated 180° about (16,16) */}
        <polygon points="16,16 30,2 30,30" fill={color} opacity="0.75" transform="rotate(180 16 16)" />
        {/* 4. Bottom-left triangle — lightest */}
        <polygon points="2,30 16,30 2,16" fill={color} opacity="0.4" />
        {/* 5. Bottom-right triangle — intentional gap above */}
        <polygon points="16,16 30,30 16,30" fill={color} opacity="0.65" />
      </svg>
    </Box>
  );
}
