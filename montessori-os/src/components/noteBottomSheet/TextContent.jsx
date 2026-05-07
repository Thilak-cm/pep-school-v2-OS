import { Box, Typography, Chip, TextField } from '@mui/material';

export default function TextContent({ observation, editing, editText, onEditTextChange }) {
  if (!observation) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Curriculum area chip */}
      {observation.curriculumArea && (
        <Box>
          <Chip
            label={observation.curriculumArea}
            size="small"
            sx={{
              bgcolor: 'var(--color-green-bg)',
              color: 'var(--color-secondary-dark)',
              fontWeight: 600,
              fontSize: '0.72rem',
              border: '1px solid var(--color-green-mint)',
              height: 24,
            }}
          />
        </Box>
      )}

      {/* Text body or edit field */}
      {editing ? (
        <TextField
          multiline
          rows={4}
          fullWidth
          value={editText}
          onChange={(e) => onEditTextChange(e.target.value)}
          placeholder="Edit your observation..."
          variant="outlined"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
      ) : (
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
      )}
    </Box>
  );
}
