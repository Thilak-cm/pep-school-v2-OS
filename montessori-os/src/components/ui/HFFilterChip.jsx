import { ButtonBase, Box } from '@mui/material';
import { Filter } from '../../icons';

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
export default function HFFilterChip({ active = false, onClick, count, sx }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        p: 0.75,
        borderRadius: 'var(--radius-pill)',
        border: '1px solid',
        borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
        bgcolor: active ? 'var(--color-indigo-bg)' : 'var(--color-paper)',
        transition: 'all 0.2s ease',
        minWidth: 36,
        ...sx,
      }}
    >
      <Filter size={16} style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-soft)' }} />
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
    </ButtonBase>
  );
}
