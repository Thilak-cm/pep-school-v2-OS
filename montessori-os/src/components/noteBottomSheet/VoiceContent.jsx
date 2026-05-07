import { Box, Typography, TextField } from '@mui/material';
import { Sparkles as AutoAwesome } from '../../icons';

export default function VoiceContent({ observation, editing, editText, onEditTextChange }) {
  if (!observation) return null;

  const duration = observation.duration || observation.durationSec || 0;
  const durationLabel = duration > 0
    ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')} spoken`
    : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* TRANSCRIPT · AUTO label + duration */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <AutoAwesome size={14} style={{ color: 'var(--color-primary)' }} />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.72rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-primary)',
            }}
          >
            TRANSCRIPT · AUTO
          </Typography>
        </Box>
        {durationLabel && (
          <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', fontSize: '0.78rem' }}>
            {durationLabel}
          </Typography>
        )}
      </Box>

      {/* Transcript body or edit field */}
      {editing ? (
        <TextField
          multiline
          rows={4}
          fullWidth
          value={editText}
          onChange={(e) => onEditTextChange(e.target.value)}
          placeholder="Edit transcript..."
          variant="outlined"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      ) : (
        <Box
          sx={{
            borderLeft: '3px solid var(--color-rose)',
            bgcolor: 'var(--color-rose-bg)',
            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            px: 2,
            py: 1.5,
          }}
        >
          <Typography
            variant="body1"
            sx={{
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '0.95rem',
              color: 'var(--color-text)',
            }}
          >
            {observation.text || '(transcribing…)'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
