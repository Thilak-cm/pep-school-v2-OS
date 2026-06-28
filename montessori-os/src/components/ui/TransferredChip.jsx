import { Box, Typography } from '@mui/material';

/**
 * Transferred student indicator — two variants:
 *   - "chip" (default): compact pill for unexpanded note cards
 *   - "banner": full-width block for expanded note views (NoteBottomSheet)
 *
 * @param {string} [toClassroomName] - destination classroom name (e.g., "All Stars")
 * @param {string} [fromClassroomName] - source classroom name (e.g., "Amazing")
 * @param {string} [studentName] - student display name (used in banner variant)
 * @param {'chip'|'banner'} [variant='chip']
 */
export default function TransferredChip({ toClassroomName, fromClassroomName, studentName, variant = 'chip' }) {
  if (variant === 'banner') {
    return (
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, p: 1.5, mb: 1.5,
        backgroundColor: 'var(--color-amber-bg)', borderRadius: 1,
        border: '1px solid var(--color-amber-yellow)',
      }}>
        <Typography variant="body2" sx={{ color: 'var(--color-amber-text)', fontStyle: 'italic', fontSize: '0.78rem' }}>
          Note logged when {studentName || 'this student'} was in {fromClassroomName}{toClassroomName ? `. Now transferred to ${toClassroomName}` : ''}
        </Typography>
      </Box>
    );
  }

  // Chip variant (default)
  return (
    <Typography
      component="span"
      sx={{
        fontSize: '0.65rem',
        fontWeight: 600,
        color: '#b45309',
        backgroundColor: '#fef3c7',
        px: 0.75,
        py: 0.15,
        borderRadius: 'var(--radius-pill)',
        border: '1px solid #fde68a',
        whiteSpace: 'nowrap',
      }}
    >
      {toClassroomName ? `Transferred to ${toClassroomName}` : 'Transferred'}
    </Typography>
  );
}
