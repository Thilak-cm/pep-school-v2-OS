// StudentTimeline.jsx (refactored)
import React, { useEffect, useState, useRef } from 'react';
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
  MenuItem
} from '@mui/material';
import { Star, Edit, AccessTime, Delete, Save, Cancel, Person, SwapHoriz, Close, FilterList, Mic, Download } from '@mui/icons-material';
import { collection, collectionGroup, query, where, orderBy, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Import new modular components
import FilterPanel from './FilterPanel';
import ClassroomStudentPicker from './ClassroomStudentPicker';
import useObservationFilters from '../hooks/useObservationFilters';
import { formatTimestamp, getObservationTypeIcon, getObservationTypeText } from '../utils/observationUtils.jsx';
import { canDeleteObservation, canEditObservation, canReassignObservation } from '../utils/observationPermissions';
import { 
  exportStudentTimeline, 
  exportFilteredTimeline, 
  exportStudentTimelineAsText, 
  exportFilteredTimelineAsText 
} from '../utils/export_student_timeline';

function StudentTimeline({ student, currentUser, userRole }) {
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
  const [reassigning, setReassigning] = useState(false);
  const [reassignSelectedStudents, setReassignSelectedStudents] = useState([]);
  
  // Classroom teachers for creator filter
  const [classroomTeachers, setClassroomTeachers] = useState([]);
  
  // Export states
  const [exporting, setExporting] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [exportType, setExportType] = useState('all'); // 'all' or 'filtered'
  const [exportFormat, setExportFormat] = useState('txt'); // 'txt' or 'json'
  const [showFormatDropdown, setShowFormatDropdown] = useState(false);
  
  // Refs
  const exportButtonRef = useRef(null);

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
    setLoading(true);
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('Observations loading timeout - forcing loading to false');
      setLoading(false);
    }, 10000); // 10 second timeout
    
    const studentIdToQuery = student.id;
    console.log('Querying with studentId:', studentIdToQuery);
    
    const q = query(
      collectionGroup(db, 'observations'),
      where('studentId', '==', studentIdToQuery),
      orderBy('observedAt', 'desc')
    );

    // Temporary: run a one-time read to bypass Listen transport and isolate rules/index issues
    getDocs(q)
      .then((snap) => {
        console.info('[debug] getDocs observations:', snap.docs.length);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setObservations(list);
        setLoading(false);
        clearTimeout(timeoutId);
      })
      .catch((err) => {
        console.error('[debug] getDocs error:', err);
        setLoading(false);
        clearTimeout(timeoutId);
      });

    // Keep listener for normal live updates once stable (can re-enable later)
    const unsub = onSnapshot(q, (snap) => {
      console.log('Observations snapshot received:', snap.docs.length, 'documents');
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setObservations(list);
    }, (error) => {
      console.error('Error loading observations:', error);
    });
    
    return () => {
      clearTimeout(timeoutId);
      unsub();
    };
  }, [student]);

  // Extract classroom teachers from observations data
  useEffect(() => {
    if (!observations.length) return;
    
    // Get unique teachers from observations for this classroom
    const teacherMap = new Map();
    
    observations.forEach(obs => {
      const teacherId = obs.createdBy || obs.teacherId;
      if (teacherId) {
        const teacherName = obs.createdByName || obs.teacherName || obs.createdByEmail || obs.teacherEmail || `Teacher ${teacherId.slice(-4)}`;
        const teacherEmail = obs.createdByEmail || obs.teacherEmail || `teacher-${teacherId.slice(-4)}@example.com`;
        
        if (!teacherMap.has(teacherId)) {
          teacherMap.set(teacherId, {
            id: teacherId,
            displayName: teacherName,
            email: teacherEmail
          });
        }
      }
    });
    
    const teachers = Array.from(teacherMap.values());
    setClassroomTeachers(teachers);
  }, [observations]);

  // Handle click outside format dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportButtonRef.current && !exportButtonRef.current.contains(event.target)) {
        setShowFormatDropdown(false);
      }
    };

    if (showFormatDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFormatDropdown]);

  // Sync selectedObservation with updated observations data
  useEffect(() => {
    if (selectedObservation && observations.length > 0) {
      const updatedObservation = observations.find(obs => obs.id === selectedObservation.id);
      if (updatedObservation && updatedObservation.text !== selectedObservation.text) {
        setSelectedObservation(updatedObservation);
      }
    }
  }, [observations, selectedObservation]);



  const handleObservationClick = (observation) => {
    setSelectedObservation(observation);
    setDetailDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDetailDialogOpen(false);
    setSelectedObservation(null);
    setEditing(false);
    setEditText('');
    // Reset reassignment state
    setReassignDialogOpen(false);
    setReassignConfirmOpen(false);
    setReassignSelectedStudents([]);
  };

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedObservation) return;
    
    try {
      setDeleting(true);
      await deleteDoc(doc(db, 'students', student.id, 'observations', selectedObservation.id));
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
      const updateData = {
        text: editText.trim(),
        editCount: (selectedObservation.editCount || 0) + 1,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'students', student.id, 'observations', selectedObservation.id), updateData);
      
      setEditing(false);
      setEditText('');
    } catch (error) {
      console.error('Error updating observation:', error);
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
    setReassignSelectedStudents([]); // Reset selection when opening
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
      if (selectedStudentId === student.id) {
        alert('Cannot reassign a note to the same student.');
        return;
      }
      
      setReassignDialogOpen(false);
      setReassignConfirmOpen(true);
    }
  };

  const handleConfirmReassign = async () => {
    if (!selectedObservation || reassignSelectedStudents.length !== 1) return;

    try {
      setReassigning(true);
      const newStudentId = reassignSelectedStudents[0];
      
      await updateDoc(doc(db, 'students', student.id, 'observations', selectedObservation.id), {
        studentId: newStudentId,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp()
      });

      // Close all dialogs
      setReassignConfirmOpen(false);
      setDetailDialogOpen(false);
      setSelectedObservation(null);
      setReassignSelectedStudents([]);
    } catch (error) {
      console.error('Error reassigning observation:', error);
      alert('Error reassigning note. Please try again.');
    } finally {
      setReassigning(false);
    }
  };

  const handleCancelReassign = () => {
    setReassignConfirmOpen(false);
    setReassignSelectedStudents([]);
  };

  // Export handlers
  const handleExportClick = (type) => {
    if (type === 'all' && (!observations || observations.length === 0)) {
      alert('No observations to export.');
      return;
    }
    
    if (type === 'filtered' && (!filteredObservations || filteredObservations.length === 0)) {
      alert('No filtered observations to export.');
      return;
    }
    
    setExportType(type);
    
    // Teachers go straight to confirmation (text only)
    if (userRole !== 'admin') {
      setExportFormat('txt');
      setExportConfirmOpen(true);
    } else {
      // Admins see format dropdown first
      setShowFormatDropdown(true);
    }
  };

  const handleFormatSelect = (format) => {
    setExportFormat(format);
    setShowFormatDropdown(false);
    setExportConfirmOpen(true);
  };

  const handleExportConfirm = async () => {
    try {
      setExporting(true);
      setExportConfirmOpen(false);
      
      let result;
      if (exportType === 'all') {
        if (userRole === 'admin') {
          result = exportStudentTimeline(student, observations, currentUser, exportFormat);
        } else {
          result = exportStudentTimelineAsText(student, observations, currentUser);
        }
      } else {
        if (userRole === 'admin') {
          result = exportFilteredTimeline(student, filteredObservations, currentUser, exportFormat);
        } else {
          result = exportFilteredTimelineAsText(student, filteredObservations, currentUser);
        }
      }
      
      if (result.success) {
        console.log(`Exported ${result.observationCount} observations to ${result.filename}`);
      } else {
        alert(`Export failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCancel = () => {
    setExportConfirmOpen(false);
    setExportType('all');
    setExportFormat('txt');
    setShowFormatDropdown(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative', pb: 8 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {hasActiveFilters && (
            <Chip 
              label={`Showing ${filteredObservations.length} of ${observations.length} notes`}
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
          {/* Export Button - Show for both admins and teachers */}
          <Box sx={{ position: 'relative' }} ref={exportButtonRef}>
            <Button
              startIcon={exporting ? <CircularProgress size={16} /> : <Download />}
              onClick={() => handleExportClick(hasActiveFilters ? 'filtered' : 'all')}
              variant="outlined"
              color="secondary"
              size="small"
              disabled={exporting || (hasActiveFilters ? filteredObservations.length === 0 : observations.length === 0)}
              aria-label={hasActiveFilters ? 'Export filtered observations' : 'Export all observations'}
              title={hasActiveFilters ? `Export ${filteredObservations.length} filtered observations` : `Export ${observations.length} observations`}
            >
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
            
            {/* Format Dropdown - Only for admins */}
            {userRole === 'admin' && showFormatDropdown && (
              <Box sx={{
                position: 'absolute',
                top: '100%',
                right: 0,
                mt: 1,
                backgroundColor: 'white',
                borderRadius: 2,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '1px solid #e2e8f0',
                zIndex: 1000,
                minWidth: 120
              }}>
                <Button
                  onClick={() => handleFormatSelect('txt')}
                  variant="text"
                  size="small"
                  fullWidth
                  sx={{ 
                    justifyContent: 'flex-start', 
                    px: 2, 
                    py: 1.5,
                    '&:hover': { backgroundColor: '#f8fafc' }
                  }}
                >
                  Text (.txt)
                </Button>
                <Button
                  onClick={() => handleFormatSelect('json')}
                  variant="text"
                  size="small"
                  fullWidth
                  sx={{ 
                    justifyContent: 'flex-start', 
                    px: 2, 
                    py: 1.5,
                    '&:hover': { backgroundColor: '#f8fafc' }
                  }}
                >
                  JSON (.json)
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Filter Panel */}
      <FilterPanel
        showFilters={showFilters}
        filters={filters}
        uniqueCreators={uniqueCreators}
        classroomTeachers={classroomTeachers}
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
              aria-label={`View details for observation from ${formatTimestamp(obs.observedAt || obs.timestamp)}`}
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
                  <Typography variant="caption" color="text.secondary">{formatTimestamp(obs.observedAt || obs.timestamp)}</Typography>
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
                    {formatTimestamp(selectedObservation.observedAt || selectedObservation.timestamp)}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2" color="text.secondary">
                    Created by: {selectedObservation.createdByName || selectedObservation.createdByEmail || 'Unknown Teacher'}
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
                
                {userRole === 'admin' && (
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
                )}
                
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Person sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      Assigned To: {student?.name || student?.displayName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Unknown Student'}
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
                "{selectedObservation?.text?.substring(0, 100)}{selectedObservation?.text?.length > 100 ? '...' : ''}"
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

      {/* Export Confirmation Dialog */}
      <Dialog
        open={exportConfirmOpen}
        onClose={handleExportCancel}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: 400,
            width: 'calc(100% - 32px)',
            mx: 'auto'
          }
        }}
      >
        <DialogTitle sx={{ pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Download color="secondary" />
            <Typography variant="h6">
              Confirm Export
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {exportType === 'all' 
              ? `Export all ${observations?.length || 0} observations for ${student?.name || student?.displayName || 'this student'}?`
              : `Export ${filteredObservations?.length || 0} filtered observations for ${student?.name || student?.displayName || 'this student'}?`
            }
          </Typography>
          
          <Box sx={{
            p: 2,
            backgroundColor: '#f8fafc',
            borderRadius: 2,
            border: '1px solid #e2e8f0',
            mb: 2
          }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              <strong>Student:</strong> {student?.name || student?.displayName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Unknown Student'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              <strong>Export Type:</strong> {exportType === 'all' ? 'All Observations' : 'Filtered Observations'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              <strong>Count:</strong> {exportType === 'all' ? observations?.length || 0 : filteredObservations?.length || 0} out of {observations?.length || 0} notes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Format:</strong> {userRole === 'admin' ? `${exportFormat.toUpperCase()} file (.${exportFormat})` : 'Text file (.txt)'}
            </Typography>
          </Box>
          
          <Typography variant="body2" color="info.main" sx={{ fontWeight: 'medium' }}>
            The file will be downloaded automatically with a descriptive filename.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button 
            onClick={handleExportCancel} 
            variant="outlined" 
            sx={{ flex: 1 }}
            disabled={exporting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleExportConfirm} 
            variant="contained" 
            color="primary"
            sx={{ flex: 1 }}
            disabled={exporting}
            startIcon={exporting ? <CircularProgress size={16} /> : <Download />}
          >
            {exporting ? 'Exporting...' : `Export as ${exportFormat.toUpperCase()}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Note creation handled by global FAB */}
    </Box>
  );
}

export default StudentTimeline; 