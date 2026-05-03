import { ButtonBase, Typography, Box } from '@mui/material';
import { Filter, ChevronDown } from '../../icons';

/**
 * Compact filter chip with dropdown indicator — toggles active/inactive.
 *
 * @param {{
 *   label?: string,
 *   active?: boolean,
 *   onClick?: function,
 *   count?: number,
 *   sx?: object,
 * }} props
 */
export default function HFFilterChip({ label = 'Filters', active = false, onClick, count, sx }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.5,
        py: 0.75,
        borderRadius: 'var(--radius-pill)',
        border: '1px solid',
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        bgcolor: active ? 'var(--color-indigo-bg)' : 'var(--color-paper)',
        transition: 'all 0.2s ease',
        ...sx,
      }}
    >
      <Filter size={14} style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-soft)' }} />
      <Typography
        variant="body2"
        sx={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: active ? 'var(--color-primary)' : 'var(--color-text-soft)',
        }}
      >
        {label}
      </Typography>
      {count != null && count > 0 && (
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            borderRadius: '50%',
            bgcolor: 'var(--color-primary)',
            color: 'var(--color-paper)',
            fontSize: '0.65rem',
            fontWeight: 700,
          }}
        >
          {count}
        </Box>
      )}
      <ChevronDown size={14} style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-faint)' }} />
    </ButtonBase>
  );
}
