// StudentTimeline.jsx (refactored)
import React, { useEffect, useState, useRef, useMemo } from 'react';
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
import { Star, Edit, AccessTime, Delete, Save, Cancel, Person, SwapHoriz, Close, FilterList, Mic, Download, EditNote, Notes } from '@mui/icons-material';
import CopyToClipboardButton from './CopyToClipboardButton';
import { collection, collectionGroup, query, where, orderBy, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify.js';

// Import new modular components
import FilterPanel from './FilterPanel';
import ClassroomStudentPicker from './ClassroomStudentPicker';
import NoteExpansionDialog from './NoteExpansionDialog';
import useObservationFilters from '../hooks/useObservationFilters';
import { formatTimestamp, getObservationTypeIcon, getObservationTypeText } from '../utils/observationUtils.jsx';
import { canDeleteObservation, canEditObservation, canReassignObservation } from '../utils/observationPermissions';
import { 
  exportStudentTimeline, 
  exportFilteredTimeline, 
  exportStudentTimelineAsText, 
  exportFilteredTimelineAsText 
} from '../utils/export_student_observations';

function StudentTimeline({ student, currentUser, userRole }) {
  const notify = useNotify();
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
  const [observations, setObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedObservation, setSelectedObservation] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Note: All note expansion functionality is now handled by NoteExpansionDialog component
  
  // Classroom teachers for creator filter
  const [classroomTeachers, setClassroomTeachers] = useState([]);
  
  // Export states
  const [exporting, setExporting] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [exportType, setExportType] = useState('all'); // 'all' or 'filtered'
  const [exportFormat, setExportFormat] = useState('txt'); // 'txt' or 'json'
  const [showFormatDropdown, setShowFormatDropdown] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  
  // Refs
  const exportButtonRef = useRef(null);

  // Derived counts for header summary
  const { totalNotes, notesLast7Days } = useMemo(() => {
    const total = observations?.length || 0;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toDate = (ts) => {
      if (!ts) return null;
      if (ts.toDate) return ts.toDate();
      if (ts.seconds) return new Date(ts.seconds * 1000);
      return null;
    };
    const recent = (observations || []).filter((obs) => {
      const ts = obs.observedAt || obs.timestamp;
      const d = toDate(ts);
      return d && d >= sevenDaysAgo;
    }).length;
    return { totalNotes: total, notesLast7Days: recent };
  }, [observations]);

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
  };

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedObservation) return;
    const obs = selectedObservation;
    setDeleteConfirmOpen(false);
    setDetailDialogOpen(false);
    setSelectedObservation(null);

    const notifId = `delete-${obs.id}`;
    // Defer deletion until notification finalizes; allow Undo
    notify.info('Deleting note…', {
      id: notifId,
      actionLabel: 'Undo',
      onFinalize: async () => {
        try {
          await deleteDoc(doc(db, 'students', student.id, 'observations', obs.id));
          notify.success('Note deleted successfully', { id: notifId, duration: 2500 });
        } catch (error) {
          console.error('Error deleting observation:', error);
          notify.error('Error deleting note. Please try again.', { id: notifId, duration: 3500 });
        }
      },
      onUndo: () => {
        // No-op; deletion canceled
        notify.info('Deletion canceled', { id: notifId, duration: 2000 });
      },
      duration: 6000,
      variant: 'warning',
    });
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
  };







  // Reassignment handlers


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
      notify.warning('Cannot reassign to the same student.', { duration: 2500, id: 'reassign-same' });
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
      // Show success with quick jump to the new student's Notes page
      notify.success('Note reassigned', {
        duration: 2500,
        id: `reassign-${selectedObservation.id}`,
        actionLabel: 'View Note',
        onUndo: () => {
          try {
            window.dispatchEvent(new CustomEvent('navigateToStudentNotes', { detail: { studentId: newStudentId } }));
          } catch (_) { /* noop */ }
        },
      });
    } catch (error) {
      console.error('Error reassigning observation:', error);
      notify.error('Error reassigning note. Please try again.', { id: `reassign-${selectedObservation?.id || 'unknown'}` });
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
      notify.warning('No observations to export.', { id: `export-${student?.id || 'unknown'}-all`, duration: 3000 });
      return;
    }
    
    if (type === 'filtered' && (!filteredObservations || filteredObservations.length === 0)) {
      notify.warning('No filtered observations to export.', { id: `export-${student?.id || 'unknown'}-filtered`, duration: 3000 });
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

  // Helper: check if an observation falls within the selected export date range
  const isWithinExportRange = (obs) => {
    const ts = obs?.observedAt || obs?.timestamp;
    let d = null;
    if (ts?.toDate) d = ts.toDate();
    else if (ts?.seconds) d = new Date(ts.seconds * 1000);
    else if (ts instanceof Date) d = ts;
    else if (typeof ts === 'string') d = new Date(ts);
    if (!d) return false;

    let ok = true;
    if (exportDateFrom) {
      const from = new Date(exportDateFrom + 'T00:00:00');
      ok = ok && d >= from;
    }
    if (exportDateTo) {
      const to = new Date(exportDateTo + 'T23:59:59');
      ok = ok && d <= to;
    }
    return ok;
  };

  const handleExportConfirm = async () => {
    try {
      setExporting(true);
      setExportConfirmOpen(false);
      
      // Base list depending on export type
      const baseList = exportType === 'all' ? observations : filteredObservations;
      // Apply export date range if provided
      const finalList = (exportDateFrom || exportDateTo) ? baseList.filter(isWithinExportRange) : baseList;

      let result;
      // Route to exporter with the final filtered list
      result = exportStudentTimeline(
        student,
        finalList,
        currentUser,
        userRole === 'admin' ? exportFormat : 'txt',
        true,
        finalList
      );
      
      if (result.success) {
        console.log(`Exported ${result.observationCount} observations to ${result.filename}`);
        notify.success(`Exported ${result.observationCount} notes to ${result.filename || exportFormat}`, {
          id: `export-${student?.id || 'unknown'}-${exportType}`,
          duration: 3000,
        });
      } else {
        notify.error(`Export failed: ${result.error}`, {
          id: `export-${student?.id || 'unknown'}-${exportType}`,
          duration: 4000,
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      notify.error('Export failed. Please try again.', {
        id: `export-${student?.id || 'unknown'}-${exportType}`,
        duration: 4000,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportCancel = () => {
    setExportConfirmOpen(false);
    setExportType('all');
    setExportFormat('txt');
    setShowFormatDropdown(false);
    setExportDateFrom('');
    setExportDateTo('');
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
          {/* Notes summary */}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {totalNotes} notes overall | {notesLast7Days} notes in last 7 days
          </Typography>
          {/* Time-divided notes list (Today / Last 7 Days / Beyond) */}
          {(() => {
            const groups = { today: [], last7Days: [], beyond: [] };
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            const toDate = (ts) => {
              if (!ts) return null;
              if (ts.toDate) return ts.toDate();
              if (ts.seconds) return new Date(ts.seconds * 1000);
              return new Date(ts);
            };
            (filteredObservations || []).forEach((obs) => {
              let d = toDate(obs.observedAt || obs.timestamp) || new Date(0);
              if (d >= today) groups.today.push(obs);
              else if (d >= lastWeek) groups.last7Days.push(obs);
              else groups.beyond.push(obs);
            });

            const renderGroup = (label, items, labelColor) => (
              items && items.length > 0 ? (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: labelColor }}>
                      {label}
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {items.map((obs) => (
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
                        position: 'relative',
                      }}
                      aria-label={`View details for observation from ${formatTimestamp(obs.observedAt || obs.timestamp)}`}
                    >
                      {/* Note Type Indicator - Top Right (language-aware for voice) */}
                      {(() => {
                        const isVoice = obs.type === 'voice';
                        const icon = isVoice ? <Mic sx={{ fontSize: 16, color: 'text.secondary' }} />
                                             : (obs.type === 'text' || obs.text)
                                               ? <EditNote sx={{ fontSize: 16, color: 'text.secondary' }} />
                                               : <Notes sx={{ fontSize: 16, color: 'text.secondary' }} />;
                        const label = isVoice
                          ? `${languageName(obs.spokenLanguage || obs.languageCode) || 'Voice'} Voice Note`
                          : (obs.type === 'text' || obs.text) ? 'Text Note' : 'Note';
                        return (
                          <Box sx={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            borderRadius: 1,
                            px: 1,
                            py: 0.5,
                            border: '1px solid #e2e8f0'
                          }}>
                            {icon}
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
                              {label}
                            </Typography>
                          </Box>
                        );
                      })()}
                      {/* Copy button overlay - subtle, does not interfere with card click */}
                      {obs.text && (
                        <Box sx={{ position: 'absolute', top: 40, right: 8 }}>
                          <CopyToClipboardButton
                            text={obs.text}
                            size="small"
                            ariaLabel="Copy note text"
                          />
                        </Box>
                      )}
                      <CardContent sx={{ p: 2 }}>
                        {/* Teacher Information */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                          <span role="img" aria-label="teacher" style={{ fontSize: '16px' }}>
                            👩‍🏫
                          </span>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            {obs.createdByName || obs.createdBy || 'Unknown Teacher'}
                          </Typography>
                        </Box>
                        <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {obs.text || '(transcribing…)'}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">{formatTimestamp(obs.observedAt || obs.timestamp)}</Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : null
            );

            return (
              <>
                {renderGroup('Today', groups.today, 'primary.main')}
                {renderGroup('Last 7 Days', groups.last7Days, 'text.secondary')}
                {renderGroup('Beyond 7 Days', groups.beyond, 'text.secondary')}
              </>
            );
          })()}
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
        <NoteExpansionDialog
        open={detailDialogOpen}
        onClose={handleCloseDialog}
          observation={selectedObservation}
          student={student}
          currentUser={currentUser}
          userRole={userRole}
          isClassroomContext={false}
        />

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
        <DialogTitle component="div">
          <Typography component="h2" variant="h6" color="error">
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
        <DialogTitle component="div" sx={{ pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Download color="secondary" />
            <Typography component="h2" variant="h6">
              Confirm Export
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {(() => {
            const baseListForPreview = exportType === 'all' ? (observations || []) : (filteredObservations || []);
            const exportPreviewList = (exportDateFrom || exportDateTo) ? baseListForPreview.filter(isWithinExportRange) : baseListForPreview;
            const previewCount = exportPreviewList.length;
            const studentLabel = student?.name || student?.displayName || 'this student';
            return (
              <Typography variant="body1" sx={{ mb: 2 }}>
                {exportType === 'all' 
                  ? `Export ${previewCount} observations for ${studentLabel}?`
                  : `Export ${previewCount} filtered observations for ${studentLabel}?`}
              </Typography>
            );
          })()}

          {/* Date range selection for export */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 500 }}>
              Date Range (optional)
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="From Date"
                type="date"
                size="small"
                value={exportDateFrom}
                onChange={(e) => setExportDateFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="To Date"
                type="date"
                size="small"
                value={exportDateTo}
                onChange={(e) => setExportDateTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
            </Box>
          </Box>
          
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
            {(() => {
              const baseListForPreview = exportType === 'all' ? (observations || []) : (filteredObservations || []);
              const exportPreviewList = (exportDateFrom || exportDateTo) ? baseListForPreview.filter(isWithinExportRange) : baseListForPreview;
              const previewCount = exportPreviewList.length;
              const baseTotal = baseListForPreview.length;
              const overallTotal = observations?.length || 0;
              return (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Count:</strong> {previewCount} out of {overallTotal} notes
                </Typography>
              );
            })()}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              <strong>Date Range:</strong> {exportDateFrom || 'Any'} to {exportDateTo || 'Any'}
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
