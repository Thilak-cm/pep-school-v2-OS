import { Box, ButtonBase, Typography } from '@mui/material';

/**
 * iOS-style segmented control — a row of mutually exclusive options
 * with a sliding highlight on the active segment.
 *
 * @param {{
 *   options: Array<{ label: string, value: string|number }>,
 *   value: string|number,
 *   onChange: (value: string|number) => void,
 *   sx?: object,
 * }} props
 */
export default function HFSegmented({ options, value, onChange, sx }) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        borderRadius: 'var(--radius-sm)',
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
              px: 2,
              py: 0.75,
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              transition: 'all 0.2s ease',
              bgcolor: active ? 'var(--color-paper)' : 'transparent',
              boxShadow: active ? 'var(--shadow-xs)' : 'none',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: active ? 700 : 500,
                fontSize: '0.8rem',
                color: active ? 'var(--color-text)' : 'var(--color-text-soft)',
                whiteSpace: 'nowrap',
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
