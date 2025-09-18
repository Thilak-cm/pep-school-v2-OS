// NoteExpansionDialog.jsx - Reusable component for expanding notes
import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Divider,
  TextField
} from '@mui/material';
import { 
  Star, 
  Edit, 
  AccessTime, 
  Delete, 
  Save, 
  Cancel, 
  Person, 
  SwapHoriz, 
  Close, 
  Mic,
  Visibility
} from '@mui/icons-material';
import CopyToClipboardButton from './CopyToClipboardButton';
import { doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import { formatTimestamp, getObservationTypeIcon, getObservationTypeText } from '../utils/observationUtils.jsx';
import { canDeleteObservation, canEditObservation, canReassignObservation } from '../utils/observationPermissions';
import ClassroomStudentPicker from './ClassroomStudentPicker';

function NoteExpansionDialog({ 
  open, 
  onClose, 
  observation, 
  student, 
  currentUser, 
  userRole,
  onNavigateToStudent, // For classroom timeline navigation
  isClassroomContext = false // To show "View Student Timeline" button
}) {
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Map short codes to human-friendly names
  const languageName = (code) => {
    if (!code) return null;
    const v = String(code).toLowerCase();
    const base = v.includes('-') ? v.split('-')[0] : v;
    const map = { en: 'English', hi: 'Hindi', ta: 'Tamil', kn: 'Kannada', te: 'Telugu' };
    if (map[base]) return map[base];
    if (['english','hindi','tamil','kannada','telugu'].includes(base)) {
      return base.charAt(0).toUpperCase() + base.slice(1);
    }
    return code;
  };
  
  // Reassignment states
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignConfirmOpen, setReassignConfirmOpen] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [reassignSelectedStudents, setReassignSelectedStudents] = useState([]);

  // Reset states when dialog opens/closes
  React.useEffect(() => {
    if (open && observation) {
      setEditText(observation.text || '');
      setEditing(false);
    }
  }, [open, observation]);

  const handleCloseDialog = () => {
    onClose();
    setEditing(false);
    setEditText('');
    setReassignDialogOpen(false);
    setReassignConfirmOpen(false);
    setReassignSelectedStudents([]);
  };

  const handleDeleteClick = () => {
    // Show delete confirmation
    if (window.confirm('Are you sure you want to delete this observation note? This action cannot be undone.')) {
      handleDeleteConfirm();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!observation) return;
    setDeleting(false);
    const obs = observation;
    handleCloseDialog();
    // Schedule deletion with Undo option via notification
    const notifId = `delete-${obs.id}`;
    notify.info('Deleting note…', {
      id: notifId,
      actionLabel: 'Undo',
      onFinalize: async () => {
        try {
          await deleteDoc(doc(db, 'students', obs.studentId, 'observations', obs.id));
          notify.success('Note deleted successfully', { id: notifId, duration: 2500 });
        } catch (error) {
          console.error('Error deleting observation:', error);
          notify.error('Error deleting note. Please try again.', { id: notifId, duration: 3500 });
        }
      },
      onUndo: () => {
        notify.info('Deletion canceled', { id: notifId, duration: 2000 });
      },
      duration: 6000,
      variant: 'warning',
    });
  };

  const handleEditClick = () => {
    if (observation) {
      setEditText(observation.text || '');
      setEditing(true);
    }
  };

  const handleEditSave = async () => {
    if (!observation || !editText.trim()) return;

    try {
      setSaving(true);
      const updateData = {
        text: editText.trim(),
        editCount: (observation.editCount || 0) + 1,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'students', observation.studentId, 'observations', observation.id), updateData);
      
      setEditing(false);
      setEditText('');
      notify.success('Note updated successfully');
    } catch (error) {
      console.error('Error updating observation:', error);
      notify.error('Error saving changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditCancel = () => {
    setEditing(false);
    setEditText('');
  };

  // Reassignment handlers
  const handleReassignClick = () => {
    setReassignSelectedStudents([]);
    setReassignDialogOpen(true);
  };

  const handleReassignCancel = () => {
    setReassignDialogOpen(false);
    setReassignSelectedStudents([]);
  };

  const handleReassignStudentsChange = (studentIds) => {
    setReassignSelectedStudents(studentIds);
  };

  const handleReassignNext = () => {
    if (reassignSelectedStudents.length === 1) {
      const selectedStudentId = reassignSelectedStudents[0];
      
      // Prevent reassigning to the same student
      if (selectedStudentId === observation.studentId) {
        alert('Cannot reassign a note to the same student.');
        return;
      }
      
      setReassignDialogOpen(false);
      setReassignConfirmOpen(true);
    }
  };

  const handleConfirmReassign = async () => {
    if (!observation || reassignSelectedStudents.length !== 1) return;

    try {
      setReassigning(true);
      const newStudentId = reassignSelectedStudents[0];
      
      await updateDoc(doc(db, 'students', observation.studentId, 'observations', observation.id), {
        studentId: newStudentId,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp()
      });

      // Close all dialogs
      setReassignConfirmOpen(false);
      handleCloseDialog();
      notify.success('Note reassigned', { duration: 2500, id: `reassign-${observation.id}` });
    } catch (error) {
      console.error('Error reassigning observation:', error);
      notify.error('Error reassigning note. Please try again.', { id: `reassign-${observation?.id || 'unknown'}` });
    } finally {
      setReassigning(false);
    }
  };

  const handleCancelReassign = () => {
    setReassignConfirmOpen(false);
    setReassignSelectedStudents([]);
  };

  const handleViewStudentTimeline = () => {
    if (onNavigateToStudent && student) {
      onNavigateToStudent(student);
      handleCloseDialog();
    }
  };

  if (!observation) return null;

  return (
    <>
      {/* Main Note Detail Dialog */}
      <Dialog
        open={open}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: 343,
            width: 'calc(100% - 32px)',
            mx: 'auto'
          }
        }}
      >
        <DialogTitle sx={{ pb: 1, pr: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {getObservationTypeIcon(observation.type)}
              <Typography variant="h6">
                {getObservationTypeText(observation.type)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {/* Copy button - unobtrusive, near the title controls */}
              {!!observation.text && (
                <CopyToClipboardButton 
                  text={observation.text}
                  ariaLabel="Copy note text"
                  size="small"
                />
              )}
              <IconButton
                aria-label="Close dialog"
                onClick={handleCloseDialog}
                sx={{
                  color: 'text.secondary',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)'
                  }
                }}
              >
                <Close />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          {editing ? (
            <TextField
              multiline
              rows={4}
              fullWidth
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="Edit your observation..."
              variant="outlined"
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                }
              }}
            />
          ) : (
            <Typography 
              variant="body1" 
              sx={{ mb: 3, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {observation.text}
            </Typography>
          )}
          
          <Divider sx={{ my: 2 }} />
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {formatTimestamp(observation.observedAt || observation.timestamp)}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                Created by: {observation.createdByName || observation.createdByEmail || 'Unknown Teacher'}
              </Typography>
            </Box>
            
            {observation.type === 'voice' && (observation.duration || observation.spokenLanguage || observation.languageCode) && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Mic sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {`Duration: ${observation.duration || 0} seconds`}
                </Typography>
              </Box>
            )}
            
            {userRole === 'admin' && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Edit sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    Edit count: {observation.editCount || 0}
                  </Typography>
                </Box>
                {canEditObservation(observation, currentUser, userRole) && (
                  <Button 
                    onClick={handleEditClick} 
                    size="small"
                    variant="outlined" 
                    color="primary"
                    startIcon={<Edit />}
                  >
                    Edit
                  </Button>
                )}
              </Box>
            )}
            
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  Assigned To: {student?.name || student?.displayName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Unknown Student'}
                </Typography>
              </Box>
              {canReassignObservation(observation, currentUser, userRole) && (
                <Button 
                  onClick={handleReassignClick} 
                  size="small"
                  variant="outlined" 
                  color="secondary"
                  startIcon={<SwapHoriz />}
                >
                  Reassign
                </Button>
              )}
            </Box>

            {/* View Student Timeline Button - Only show in classroom context */}
            {isClassroomContext && onNavigateToStudent && student && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Button 
                  onClick={handleViewStudentTimeline}
                  variant="outlined" 
                  color="primary"
                  startIcon={<Visibility />}
                  fullWidth
                  size="small"
                >
                  View Student Timeline
                </Button>
              </Box>
            )}
            
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {observation.isStarred && (
                <Chip 
                  icon={<Star sx={{ fontSize: 16 }} />} 
                  label="Starred" 
                  size="small" 
                  color="warning"
                />
              )}
              {observation.isPrivate && (
                <Chip 
                  label="Private" 
                  size="small" 
                  color="error"
                />
              )}
              {observation.isDraft && (
                <Chip 
                  label="Draft" 
                  size="small" 
                  color="info"
                />
              )}
            </Box>
          </Box>
        </DialogContent>
        {(editing || canDeleteObservation(observation, currentUser, userRole)) && (
          <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
            {editing ? (
              <>
                <Button 
                  onClick={handleEditCancel} 
                  variant="outlined" 
                  sx={{ flex: 1 }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleEditSave} 
                  variant="contained" 
                  color="primary"
                  startIcon={saving ? <CircularProgress size={16} /> : <Save />}
                  sx={{ flex: 1 }}
                  disabled={saving || !editText.trim()}
                >
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              canDeleteObservation(observation, currentUser, userRole) && (
                <Button 
                  onClick={handleDeleteClick} 
                  variant="outlined" 
                  color="error"
                  startIcon={<Delete />}
                  fullWidth
                >
                  Delete
                </Button>
              )
            )}
          </DialogActions>
        )}
      </Dialog>

      {/* Student Selection Dialog for Reassignment */}
      <Dialog
        open={reassignDialogOpen}
        onClose={handleReassignCancel}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: 500,
            width: 'calc(100% - 32px)',
            mx: 'auto',
            maxHeight: '90vh'
          }
        }}
      >
        <DialogTitle sx={{ pb: 2 }}>
          <Typography variant="h6">
            Reassign Note to Student
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Select a student to reassign this observation to:
          </Typography>
          
          <ClassroomStudentPicker
            selectedStudents={reassignSelectedStudents}
            onStudentsChange={handleReassignStudentsChange}
            currentUser={currentUser}
            userRole={userRole}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button 
            onClick={handleReassignCancel} 
            variant="outlined" 
            sx={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleReassignNext} 
            variant="contained" 
            color="primary"
            sx={{ flex: 1 }}
            disabled={reassignSelectedStudents.length !== 1}
          >
            Next
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reassignment Confirmation Dialog */}
      <Dialog
        open={reassignConfirmOpen}
        onClose={handleCancelReassign}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: 375,
            width: 'calc(100% - 32px)',
            mx: 'auto'
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SwapHoriz color="secondary" />
            <Typography variant="h6">
              Confirm Reassignment
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {reassignSelectedStudents.length === 1 && (
            <>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Are you sure you want to reassign this observation?
              </Typography>
              <Box sx={{
                p: 2,
                backgroundColor: '#f8fafc',
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                mb: 2
              }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>From:</strong> {student?.name || student?.displayName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Unknown Student'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>To:</strong> Selected student (ID: {reassignSelectedStudents[0]})
                </Typography>
              </Box>
              <Typography variant="body2" sx={{
                fontStyle: 'italic',
                backgroundColor: '#f8fafc',
                padding: 2,
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                mb: 2
              }}>
                "{observation?.text?.substring(0, 100)}{observation?.text?.length > 100 ? '...' : ''}"
              </Typography>
              <Typography variant="body2" color="warning.main" sx={{ fontWeight: 'medium' }}>
                The note will be moved from the current student's timeline to the selected student's timeline.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button 
            onClick={handleCancelReassign} 
            variant="outlined" 
            sx={{ flex: 1 }}
            disabled={reassigning}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmReassign} 
            variant="contained" 
            color="secondary"
            sx={{ flex: 1 }}
            disabled={reassigning}
            startIcon={reassigning ? <CircularProgress size={16} /> : <SwapHoriz />}
          >
            {reassigning ? 'Reassigning...' : 'Reassign'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default NoteExpansionDialog;
