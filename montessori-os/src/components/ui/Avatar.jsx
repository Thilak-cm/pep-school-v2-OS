import { Avatar as MuiAvatar } from '@mui/material';

const SIZES = {
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
};

/**
 * Circle avatar with initials. Supports sm/md/lg/xl sizes + custom background color.
 *
 * @param {{ name: string, size?: 'sm'|'md'|'lg'|'xl', color?: string, sx?: object }} props
 */
export default function Avatar({ name = '', size = 'md', color, sx, ...rest }) {
  const dim = SIZES[size] || SIZES.md;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <MuiAvatar
      sx={{
        width: dim,
        height: dim,
        fontSize: dim * 0.4,
        fontWeight: 600,
        bgcolor: color || 'var(--color-primary)',
        color: 'var(--color-paper)',
        ...sx,
      }}
      {...rest}
    >
      {initials}
    </MuiAvatar>
  );
}
