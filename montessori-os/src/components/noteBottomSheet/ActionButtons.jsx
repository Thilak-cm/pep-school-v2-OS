import { Box, Button, Typography, CircularProgress } from '@mui/material';
import { Pencil as Edit, Trash2 as Delete, Eye as Visibility, ArrowLeftRight as SwapHoriz, Link, Save } from '../../icons';
import { AUTHOR_ACTION_EXPIRED_MESSAGE } from '../../utils/observationPermissions';

export default function ActionButtons({
  observation,
  // Permission flags
  isClassroomContext,
  canManageAuthorActions,
  canEdit,
  canDelete,
  canReassign,
  authorActionsExpired,
  isLessonObservation,
  // Edit state
  editing,
  saving,
  editText,
  // Handlers
  onEditClick,
  onEditSave,
  onEditCancel,
  onDeleteClick,
  onReassignClick,
  onViewStudentTimeline,
  onEditTaggedLessons,
  // Feature flags
  _hasLinkedLessons,
  linkSaving,
  student,
}) {
  if (!observation) return null;

  // When in edit mode, show Save/Cancel
  if (editing) {
    return (
      <Box sx={{ display: 'flex', gap: 1.5, px: 2.5, py: 2, borderTop: '1px solid var(--color-border)' }}>
        <Button
          onClick={onEditCancel}
          variant="outlined"
          sx={{ flex: 1, borderRadius: 'var(--radius-pill)' }}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          onClick={onEditSave}
          variant="contained"
          color="primary"
          startIcon={saving ? <CircularProgress size={16} /> : <Save size={16} />}
          sx={{ flex: 1, borderRadius: 'var(--radius-pill)' }}
          disabled={saving || !editText?.trim()}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    );
  }

  const showViewTimeline = isClassroomContext && student;
  const showTaggedLessons = !isLessonObservation && canManageAuthorActions;
  const showReassign = canReassign;
  const showEditDelete = canManageAuthorActions;
  const hasAnyAction = showViewTimeline || showTaggedLessons || showReassign || showEditDelete;

  if (!hasAnyAction) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, px: 2.5, py: 2, borderTop: '1px solid var(--color-border)' }}>
      {/* Expired warning */}
      {authorActionsExpired && (
        <Typography variant="body2" sx={{ color: 'var(--color-amber-text)', fontStyle: 'italic', textAlign: 'center', fontSize: '0.78rem' }}>
          {AUTHOR_ACTION_EXPIRED_MESSAGE}
        </Typography>
      )}

      {/* Contextual action buttons — full-width outlined pills */}
      {showViewTimeline && (
        <Button
          onClick={onViewStudentTimeline}
          variant="outlined"
          color="primary"
          startIcon={<Visibility size={16} />}
          fullWidth
          sx={{ borderRadius: 'var(--radius-pill)', justifyContent: 'center', textTransform: 'none' }}
        >
          View student timeline
        </Button>
      )}

      {showTaggedLessons && (
        <Button
          onClick={onEditTaggedLessons}
          variant="outlined"
          color="primary"
          startIcon={<Link size={16} />}
          fullWidth
          disabled={linkSaving || !canEdit}
          sx={{ borderRadius: 'var(--radius-pill)', justifyContent: 'center', textTransform: 'none' }}
        >
          Edit tagged lesson notes
        </Button>
      )}

      {showReassign && (
        <Button
          onClick={onReassignClick}
          variant="outlined"
          color="secondary"
          startIcon={<SwapHoriz size={16} />}
          fullWidth
          sx={{ borderRadius: 'var(--radius-pill)', justifyContent: 'center', textTransform: 'none' }}
        >
          Reassign
        </Button>
      )}

      {/* Sticky footer: Edit + Delete */}
      {showEditDelete && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
          <Button
            onClick={onEditClick}
            variant="outlined"
            startIcon={<Edit size={16} />}
            disabled={!canEdit}
            sx={{ flex: 1, borderRadius: 'var(--radius-pill)', textTransform: 'none' }}
          >
            Edit
          </Button>
          <Button
            onClick={onDeleteClick}
            variant="outlined"
            color="error"
            startIcon={<Delete size={16} />}
            disabled={!canDelete}
            sx={{ flex: 1, borderRadius: 'var(--radius-pill)', textTransform: 'none' }}
          >
            Delete
          </Button>
        </Box>
      )}
    </Box>
  );
}
