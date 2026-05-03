import { Box, ButtonBase, Typography } from '@mui/material';

/**
 * Time range selector — horizontal pill group (1W/1M/3M/1Y etc).
 *
 * @param {{
 *   options?: Array<{ label: string, value: string }>,
 *   value: string,
 *   onChange: (value: string) => void,
 *   sx?: object,
 * }} props
 */
const DEFAULT_OPTIONS = [
  { label: '1W', value: '1W' },
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '1Y', value: '1Y' },
];

export default function HFRangeBar({ options = DEFAULT_OPTIONS, value, onChange, sx }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        borderRadius: 'var(--radius-pill)',
        bgcolor: 'var(--color-surface)',
        p: '3px',
        gap: '2px',
        ...sx,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <ButtonBase
            key={opt.value}
            onClick={() => onChange(opt.value)}
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: 'var(--radius-pill)',
              transition: 'all 0.2s ease',
              bgcolor: active ? 'var(--color-primary)' : 'transparent',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                fontSize: '0.7rem',
                letterSpacing: 0.3,
                color: active ? 'var(--color-paper)' : 'var(--color-text-soft)',
              }}
            >
              {opt.label}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
