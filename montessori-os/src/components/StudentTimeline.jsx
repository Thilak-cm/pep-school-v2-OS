// StudentTimeline.jsx (refactored)
import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton,
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
  Paper,
  Collapse
} from '@mui/material';
import { ArrowBack, Mic, TextFields, Star, Edit, AccessTime, Delete, Save, Cancel, Person, FilterList, Clear, SwapHoriz, Close } from '@mui/icons-material';
import { collection, query, where, orderBy, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

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
  
  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    creator: '',
    type: ''
  });
  const [uniqueCreators, setUniqueCreators] = useState([]);
  const [filteredObservations, setFilteredObservations] = useState([]);
  
  // Reassignment states
  const [reassignDialogOpen, setReassignDialogOpen] = useState(false);
  const [reassignConfirmOpen, setReassignConfirmOpen] = useState(false);
  const [selectedStudentForReassign, setSelectedStudentForReassign] = useState(null);
  const [reassigning, setReassigning] = useState(false);
  const [allStudents, setAllStudents] = useState([]);

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
    
    const studentIdToQuery = student.sid || student.id;
    console.log('Querying with studentId:', studentIdToQuery);
    
    const q = query(
      collection(db, 'observations'),
      where('studentId', '==', studentIdToQuery),
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

  // Extract unique creators and apply filters
  useEffect(() => {
    // Extract unique creators
    const creators = [...new Set(observations.map(obs => 
      obs.teacherName || obs.teacherEmail || 'Unknown Teacher'
    ))].sort();
    setUniqueCreators(creators);

    // Apply filters
    let filtered = [...observations];

    // Date filters
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(obs => {
        const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
        return obsDate >= fromDate;
      });
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(obs => {
        const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
        return obsDate <= toDate;
      });
    }

    // Creator filter
    if (filters.creator) {
      filtered = filtered.filter(obs => {
        const creator = obs.teacherName || obs.teacherEmail || 'Unknown Teacher';
        return creator === filters.creator;
      });
    }

    // Type filter
    if (filters.type) {
      filtered = filtered.filter(obs => obs.type === filters.type);
    }

    setFilteredObservations(filtered);
  }, [observations, filters]);

  // Load all students for reassignment with classroom info
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
          let classroomId = studentData.classroomId;
          if (typeof classroomId === 'object' && classroomId.id) {
            classroomId = classroomId.id;
          }
          
          const classroom = classrooms.find(c => c.id === classroomId);
          
          return {
            ...studentData,
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

  const canDeleteObservation = (observation) => {
    if (!currentUser || !observation) return false;
    // Only admin can delete notes
    return userRole === 'admin';
  };

  const canEditObservation = (observation) => {
    if (!currentUser || !observation) return false;
    // Only admin can edit notes
    return userRole === 'admin';
  };

  const canReassignObservation = (observation) => {
    if (!currentUser || !observation) return false;
    // Only the creator can reassign notes (both teachers and admins)
    return observation.teacherId === currentUser.uid;
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

      await updateDoc(doc(db, 'observations', selectedObservation.id), updateData);
      
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
    setReassignDialogOpen(true);
  };

  const handleReassignCancel = () => {
    setReassignDialogOpen(false);
    setSelectedStudentForReassign(null);
  };

  const handleStudentSelect = (studentId) => {
    const selectedStudent = allStudents.find(s => s.id === studentId || s.sid === studentId);
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
        studentId: selectedStudentForReassign.sid || selectedStudentForReassign.id,
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

  // Filter handlers
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      creator: '',
      type: ''
    });
  };

  const hasActiveFilters = () => {
    return filters.dateFrom || filters.dateTo || filters.creator || filters.type;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'No timestamp';
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleString();
    }
    if (timestamp.toDate) {
      return timestamp.toDate().toLocaleString();
    }
    return 'Invalid timestamp';
  };

  const getObservationTypeIcon = (type) => {
    return type === 'voice' ? <Mic sx={{ fontSize: 16 }} /> : <TextFields sx={{ fontSize: 16 }} />;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative', pb: 8 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton aria-label="Go back" onClick={onBack}>
          <ArrowBack />
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {hasActiveFilters() && (
            <Chip 
              label={`${filteredObservations.length} filtered`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
          <IconButton 
            aria-label="Toggle filters" 
            onClick={() => setShowFilters(!showFilters)}
            color={hasActiveFilters() ? 'primary' : 'default'}
          >
            <FilterList />
          </IconButton>
        </Box>
      </Box>

      {/* Filter Panel */}
      <Collapse in={showFilters}>
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Filter Observations
              </Typography>
              {hasActiveFilters() && (
                <Button
                  startIcon={<Clear />}
                  size="small"
                  onClick={handleClearFilters}
                  color="secondary"
                >
                  Clear All
                </Button>
              )}
            </Box>
            
            {/* Date Range */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="From Date"
                type="date"
                size="small"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="To Date"
                type="date"
                size="small"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
            </Box>
            
            {/* Creator and Type */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Creator</InputLabel>
                <Select
                  value={filters.creator}
                  label="Creator"
                  onChange={(e) => handleFilterChange('creator', e.target.value)}
                >
                  <MenuItem value="">All Creators</MenuItem>
                  {uniqueCreators.map((creator) => (
                    <MenuItem key={creator} value={creator}>
                      {creator}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={filters.type}
                  label="Type"
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                >
                  <MenuItem value="">All Types</MenuItem>
                  <MenuItem value="voice">Voice Notes</MenuItem>
                  <MenuItem value="text">Text Notes</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        </Paper>
      </Collapse>

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
                    {obs.type === 'voice' ? 'Voice Note' : 'Text Note'}
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
                    {selectedObservation.type === 'voice' ? 'Voice Observation' : 'Text Observation'}
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
                  {canEditObservation(selectedObservation) && (
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
                      Assigned To: {student?.name || 'Unknown Student'}
                    </Typography>
                  </Box>
                  {canReassignObservation(selectedObservation) && (
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
            {(editing || canDeleteObservation(selectedObservation)) && (
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
                  canDeleteObservation(selectedObservation) && (
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