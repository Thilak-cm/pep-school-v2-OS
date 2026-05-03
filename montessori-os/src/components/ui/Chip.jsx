import { Chip as MuiChip } from '@mui/material';

/**
 * Tone-mapped color definitions using CSS tokens.
 * Each tone maps to a background + text color pair.
 */
const TONES = {
  indigo: { bg: 'var(--color-indigo-bg)', text: 'var(--color-primary)', border: 'var(--color-indigo-soft)' },
  green:  { bg: 'var(--color-green-bg)', text: 'var(--color-secondary-dark)', border: 'var(--color-green-mint)' },
  amber:  { bg: 'var(--color-amber-bg)', text: 'var(--color-amber-text)', border: 'var(--color-amber-yellow)' },
  rose:   { bg: 'var(--color-red-bg)', text: 'var(--color-error)', border: 'var(--color-red-soft)' },
  sky:    { bg: 'var(--color-blue-bg)', text: 'var(--color-info)', border: 'var(--color-blue-soft)' },
  violet: { bg: 'var(--color-violet-bg)', text: 'var(--color-violet)', border: 'var(--color-violet-soft)' },
  slate:  { bg: 'var(--color-surface)', text: 'var(--color-text-soft)', border: 'var(--color-border)' },
};

/**
 * Colored tag chip with tone variants (indigo, green, amber, rose, sky, violet, slate).
 *
 * @param {{ label: string, tone?: keyof TONES, size?: 'small'|'medium', onClick?: function, sx?: object }} props
 */
export default function Chip({ label, tone = 'slate', size = 'small', onClick, sx, ...rest }) {
  const t = TONES[tone] || TONES.slate;
  return (
    <MuiChip
      label={label}
      size={size}
      onClick={onClick}
      sx={{
        backgroundColor: t.bg,
        color: t.text,
        border: `1px solid ${t.border}`,
        fontWeight: 600,
        fontSize: '0.75rem',
        borderRadius: 'var(--radius-pill)',
        ...sx,
      }}
      {...rest}
    />
  );
}
