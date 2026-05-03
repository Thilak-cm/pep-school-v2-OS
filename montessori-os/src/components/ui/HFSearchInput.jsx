import { InputBase, Box } from '@mui/material';
import { Search } from '../../icons';

/**
 * Search input with icon — compact, token-styled.
 *
 * @param {{ value: string, onChange: (value: string) => void, placeholder?: string, sx?: object }} props
 */
export default function HFSearchInput({ value, onChange, placeholder = 'Search', sx, ...rest }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        bgcolor: 'var(--color-surface)',
        borderRadius: 'var(--radius-sm)',
        px: 1.5,
        py: 0.75,
        border: '1px solid var(--color-border)',
        '&:focus-within': {
          borderColor: 'var(--color-primary)',
          boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-primary) 10%, transparent)',
        },
        transition: 'border-color 0.2s, box-shadow 0.2s',
        ...sx,
      }}
    >
      <Search size={18} style={{ color: 'var(--color-text-faint)', flexShrink: 0 }} />
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        fullWidth
        sx={{
          fontSize: '0.875rem',
          color: 'var(--color-text)',
          '& ::placeholder': { color: 'var(--color-text-faint)', opacity: 1 },
        }}
        {...rest}
      />
    </Box>
  );
}
