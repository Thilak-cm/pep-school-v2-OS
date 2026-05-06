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
export default function Avatar({ name = '', size = 'md', color, src, ringColor, sx, ...rest }) {
  const dim = SIZES[size] || SIZES.md;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const avatar = (
    <MuiAvatar
      src={src || undefined}
      sx={{
        width: ringColor ? dim - 4 : dim,
        height: ringColor ? dim - 4 : dim,
        fontSize: (ringColor ? dim - 4 : dim) * 0.4,
        fontWeight: 600,
        bgcolor: color || 'var(--color-primary)',
        color: 'var(--color-paper)',
        ...(ringColor ? {} : sx),
      }}
      {...rest}
    >
      {initials}
    </MuiAvatar>
  );

  if (!ringColor) return avatar;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dim,
        height: dim,
        borderRadius: '50%',
        border: `2px solid ${ringColor}`,
        flexShrink: 0,
        ...(sx || {}),
      }}
    >
      {avatar}
    </span>
  );
}
