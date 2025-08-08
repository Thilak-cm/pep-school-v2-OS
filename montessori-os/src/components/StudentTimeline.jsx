// StudentTimeline.jsx (refactored)
import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Divider,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton
} from '@mui/material';
import { ArrowBack, Star, Edit, AccessTime, Delete, Save, Cancel, Person, SwapHoriz, Close, FilterList } from '@mui/icons-material';
import { collection, query, where, orderBy, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// Import new modular components
import FilterPanel from './FilterPanel';
import useObservationFilters from '../hooks/useObservationFilters';
import { formatTimestamp, getObservationTypeIcon, getObservationTypeText } from '../utils/observationUtils.jsx';
import { canDeleteObservation, canEditObservation, canReassignObservation } from '../utils/observationPermissions';

function StudentTimeline({ student, onBack, currentUser, userRole }) {
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedObservation, setSelectedObservation] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Reassignment states
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignConfirmOpen, setReassignConfirmOpen] = useState(false);
  const [selectedStudentForReassign, setSelectedStudentForReassign] = useState(null);
  const [reassigning, setReassigning] = useState(false);
  const [allStudents, setAllStudents] = useState([]);

  // Use the filter hook instead of local state
  const {
    showFilters,
    filters,
    uniqueCreators,
    filteredObservations,
    hasActiveFilters,
    handleFilterChange,
    handleClearFilters,
    toggleFilters
  } = useObservationFilters(observations);

  useEffect(() => {
    if (!student) return;
    
    console.log('Student object:', student);
    console.log('Student ID being used:', student.sid || student.id);
    console.log('Student document ID:', student.id);
    console.log('Student SID:', student.sid);
    setLoading(true);
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('Observations loading timeout - forcing loading to false');
      setLoading(false);
    }, 10000); // 10 second timeout
    
    const studentIdToQuery = student.studentID || student.id;
    console.log('Querying with studentID:', studentIdToQuery);
    
    const q = query(
      collection(db, 'observations'),
      where('studentID', '==', studentIdToQuery),
      orderBy('timestamp', 'desc')
    );
    
    const unsub = onSnapshot(q, (snap) => {
      console.log('Observations snapshot received:', snap.docs.length, 'documents');
      clearTimeout(timeoutId); // Clear timeout on success
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setObservations(list);
      setLoading(false);
    }, (error) => {
      console.error('Error loading observations:', error);
      clearTimeout(timeoutId); // Clear timeout on error
      setLoading(false);
    });
    
    return () => {
      clearTimeout(timeoutId);
      unsub();
    };
  }, [student]);

  // Sync selectedObservation with updated observations data
  useEffect(() => {
    if (selectedObservation && observations.length > 0) {
      const updatedObservation = observations.find(obs => obs.id === selectedObservation.id);
      if (updatedObservation && updatedObservation.text !== selectedObservation.text) {
        setSelectedObservation(updatedObservation);
      }
    }
  }, [observations, selectedObservation]);

  // Load all students for reassignment with classroom info and name composition
  useEffect(() => {
    const fetchAllStudents = async () => {
      try {
        // Fetch classrooms first
        const classroomSnap = await getDocs(collection(db, 'classrooms'));
        const classrooms = classroomSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        // Fetch students
        const studentSnap = await getDocs(collection(db, 'students'));
        const studentList = studentSnap.docs.map((d) => {
          const studentData = { id: d.id, ...d.data() };
          
          // Find classroom name
                  let classroomID = studentData.classroomID;
        if (typeof classroomID === 'object' && classroomID.id) {
          classroomID = classroomID.id;
        }

        const classroom = classrooms.find(c => c.id === classroomID);
          
          return {
            ...studentData,
            name: `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim() || studentData.name || '',
            classroom_name: classroom?.name || 'Unknown Classroom'
          };
        });
        
        setAllStudents(studentList);
      } catch (error) {
        console.error('Error fetching students for reassignment:', error);
      }
    };

    fetchAllStudents();
  }, []);

  const handleObservationClick = (observation) => {
    console.log('🔍 Observation clicked:', {
      id: observation.id,
                  userID: observation.userID,
      createdBy: observation.createdBy,
      teacherEmail: observation.teacherEmail,
      teacherName: observation.teacherName,
      timestamp: observation.timestamp
    });
    setSelectedObservation(observation);
    setDetailDialogOpen(true);
  };

  const getAssignedStudentName = () => {
    // Prefer the selected student passed from parent
    if (student) {
      const full = `${student.firstName || ''} ${student.lastName || ''}`.trim();
      if (full) return full;
      if (student.name) return student.name;
    }
    // Fallback: look up by observation.studentID in our cached list
    if (selectedObservation) {
      const s = allStudents.find(
        (st) => st.id === selectedObservation.studentID || st.studentID === selectedObservation.studentID
      );
      if (s) {
        const full = `${s.firstName || ''} ${s.lastName || ''}`.trim();
        return full || s.name || s.studentID || 'Unknown Student';
      }
    }
    return 'Unknown Student';
  };

  const handleCloseDialog = () => {
    setDetailDialogOpen(false);
    setSelectedObservation(null);
    setEditing(false);
    setEditText('');
    // Reset reassignment state
    setReassignDialogOpen(false);
    setReassignConfirmOpen(false);
    setSelectedStudentForReassign(null);
  };

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedObservation) return;
    
    try {
      setDeleting(true);
      await deleteDoc(doc(db, 'observations', selectedObservation.id));
      setDeleteConfirmOpen(false);
      setDetailDialogOpen(false);
      setSelectedObservation(null);
    } catch (error) {
      console.error('Error deleting observation:', error);
      alert('Error deleting note. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
  };

  const handleEditClick = () => {
    if (selectedObservation) {
      setEditText(selectedObservation.text || '');
      setEditing(true);
    }
  };

  const handleEditSave = async () => {
    if (!selectedObservation || !editText.trim()) return;

    try {
      setSaving(true);
      
      console.log('🔍 Debug: Starting observation update...');
      console.log('👤 Current user:', {
        uid: currentUser.uid,
        email: currentUser.email,
        role: userRole
      });
      console.log('📝 Selected observation:', {
        id: selectedObservation.id,
        userID: selectedObservation.userID,
        createdBy: selectedObservation.createdBy,
        teacherEmail: selectedObservation.teacherEmail,
        teacherName: selectedObservation.teacherName,
        timestamp: selectedObservation.timestamp
      });
      
      const updateData = {
        text: editText.trim(),
        editCount: (selectedObservation.editCount || 0) + 1,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp()
      };

      console.log('📤 Update data:', updateData);
      console.log('📁 Document path: /observations/' + selectedObservation.id);
      
      await updateDoc(doc(db, 'observations', selectedObservation.id), updateData);
      
      console.log('✅ Update successful!');
      setEditing(false);
      setEditText('');
    } catch (error) {
      console.error('❌ Error updating observation:', error);
      console.error('🔍 Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      alert('Error saving changes. Please try again.');
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
    setReassignDialogOpen(true);
  };

  const handleReassignCancel = () => {
    setReassignDialogOpen(false);
    setSelectedStudentForReassign(null);
  };

  const handleStudentSelect = (studentId) => {
    const selectedStudent = allStudents.find(s => s.id === studentId || s.studentID === studentId);
    if (selectedStudent) {
      setSelectedStudentForReassign(selectedStudent);
      setReassignDialogOpen(false);
      setReassignConfirmOpen(true);
    }
  };

  const handleConfirmReassign = async () => {
    if (!selectedObservation || !selectedStudentForReassign) return;

    try {
      setReassigning(true);
      await updateDoc(doc(db, 'observations', selectedObservation.id), {
        studentID: selectedStudentForReassign.studentID || selectedStudentForReassign.id,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp()
      });

      // Close all dialogs
      setReassignConfirmOpen(false);
      setDetailDialogOpen(false);
      setSelectedObservation(null);
      setSelectedStudentForReassign(null);
    } catch (error) {
      console.error('Error reassigning observation:', error);
      alert('Error reassigning note. Please try again.');
    } finally {
      setReassigning(false);
    }
  };

  const handleCancelReassign = () => {
    setReassignConfirmOpen(false);
    setSelectedStudentForReassign(null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative', pb: 8 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton aria-label="Go back" onClick={onBack}>
          <ArrowBack />
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {hasActiveFilters && (
            <Chip 
              label={`${filteredObservations.length} filtered`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
          <Button
            startIcon={<FilterList />}
            onClick={toggleFilters}
            variant={hasActiveFilters ? 'contained' : 'outlined'}
            color={hasActiveFilters ? 'primary' : 'default'}
            size="small"
            aria-label="Toggle filters"
          >
            Filters
          </Button>
        </Box>
      </Box>

      {/* Filter Panel */}
      <FilterPanel
        showFilters={showFilters}
        filters={filters}
        uniqueCreators={uniqueCreators}
        hasActiveFilters={hasActiveFilters}
        filteredCount={filteredObservations.length}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        onToggleFilters={toggleFilters}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredObservations.map((obs) => (
            <Card
              key={obs.id}
              onClick={() => handleObservationClick(obs)}
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  transform: 'translateY(-1px)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
              aria-label={`View details for observation from ${formatTimestamp(obs.timestamp)}`}
            >
              <CardContent sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                  {getObservationTypeIcon(obs.type)}
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    {getObservationTypeText(obs.type)}
                  </Typography>
                  {obs.isStarred && (
                    <Star sx={{ fontSize: 16, color: '#f59e0b', ml: 'auto' }} />
                  )}
                </Box>
                <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.5 }}>
                  {obs.text || '(transcribing…)'}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    {formatTimestamp(obs.timestamp)}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
          {filteredObservations.length === 0 && observations.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              No observations match the current filters.
            </Typography>
          )}
          {observations.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              No observations yet.
            </Typography>
          )}
        </Box>
      )}

      {/* Observation Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
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
        {selectedObservation && (
          <>
            <DialogTitle sx={{ pb: 1, pr: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {getObservationTypeIcon(selectedObservation.type)}
                  <Typography variant="h6">
                    {getObservationTypeText(selectedObservation.type)}
                  </Typography>
                </Box>
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
                <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.6 }}>
                  {selectedObservation.text}
                </Typography>
              )}
              
              <Divider sx={{ my: 2 }} />
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccessTime sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    {formatTimestamp(selectedObservation.timestamp)}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    Created by: {selectedObservation.teacherName || selectedObservation.teacherEmail || 'Unknown Teacher'}
                  </Typography>
                </Box>
                
                {selectedObservation.type === 'voice' && selectedObservation.duration && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Mic sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      Duration: {selectedObservation.duration} seconds
                    </Typography>
                  </Box>
                )}
                
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Edit sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      Edit count: {selectedObservation.editCount || 0}
                    </Typography>
                  </Box>
                  {canEditObservation(selectedObservation, currentUser, userRole) && (
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
                
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      Assigned To: {getAssignedStudentName()}
                    </Typography>
                  </Box>
                  {canReassignObservation(selectedObservation, currentUser, userRole) && (
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
                
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {selectedObservation.isStarred && (
                    <Chip 
                      icon={<Star sx={{ fontSize: 16 }} />} 
                      label="Starred" 
                      size="small" 
                      color="warning"
                    />
                  )}
                  {selectedObservation.isPrivate && (
                    <Chip 
                      label="Private" 
                      size="small" 
                      color="error"
                    />
                  )}
                  {selectedObservation.isDraft && (
                    <Chip 
                      label="Draft" 
                      size="small" 
                      color="info"
                    />
                  )}
                </Box>
              </Box>
            </DialogContent>
            {(editing || canDeleteObservation(selectedObservation, currentUser, userRole)) && (
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
                  canDeleteObservation(selectedObservation, currentUser, userRole) && (
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
          </>
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleDeleteCancel}
        maxWidth="xs"
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
        <DialogTitle>
          <Typography variant="h6" color="error">
            Delete Note
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to delete this observation note?
          </Typography>
          {selectedObservation && (
            <Typography variant="body2" color="text.secondary" sx={{ 
              fontStyle: 'italic',
              backgroundColor: '#f8fafc',
              padding: 2,
              borderRadius: 2,
              border: '1px solid #e2e8f0'
            }}>
              "{selectedObservation.text?.substring(0, 100)}{selectedObservation.text?.length > 100 ? '...' : ''}"
            </Typography>
          )}
          <Typography variant="body2" color="error" sx={{ mt: 2, fontWeight: 'medium' }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button 
            onClick={handleDeleteCancel} 
            variant="outlined" 
            sx={{ flex: 1 }}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            variant="contained" 
            color="error"
            sx={{ flex: 1 }}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} /> : <Delete />}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
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
            maxWidth: 375,
            width: 'calc(100% - 32px)',
            mx: 'auto',
            maxHeight: '80vh'
          }
        }}
      >
        <DialogTitle sx={{ pb: 2 }}>
          <Typography variant="h6">
            Reassign Note to Student
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ p: 3, pt: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Select a student to reassign this observation to:
            </Typography>
            <List sx={{ maxHeight: 300, overflow: 'auto' }}>
              {allStudents.map((student) => (
                <ListItem key={student.id} disablePadding>
                  <ListItemButton
                    onClick={() => handleStudentSelect(student.id)}
                    sx={{
                      borderRadius: 2,
                      mb: 1,
                      '&:hover': {
                        backgroundColor: 'rgba(79, 70, 229, 0.08)'
                      }
                    }}
                  >
                    <ListItemIcon>
                      <Person />
                    </ListItemIcon>
                    <ListItemText
                      primary={student.name || 'Unnamed Student'}
                      secondary={student.classroom_name || 'Unknown Classroom'}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button 
            onClick={handleReassignCancel} 
            variant="outlined" 
            sx={{ flex: 1 }}
          >
            Cancel
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
          {selectedStudentForReassign && (
            <>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Are you sure you want to reassign this observation to:
              </Typography>
              <Box sx={{
                p: 2,
                backgroundColor: '#f8fafc',
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                mb: 2
              }}>
                <Typography variant="h6" color="primary">
                  {selectedStudentForReassign.name || 'Unnamed Student'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedStudentForReassign.classroom_name || 'Unknown Classroom'}
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
                "{selectedObservation?.text?.substring(0, 100)}{selectedObservation?.text?.length > 100 ? '...' : ''}"
              </Typography>
            </>
          )}
          <Typography variant="body2" color="warning.main" sx={{ fontWeight: 'medium' }}>
            The note will be moved from the current student's timeline to the selected student's timeline.
          </Typography>
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

      {/* Note creation handled by global FAB */}
    </Box>
  );
}

export default StudentTimeline; 