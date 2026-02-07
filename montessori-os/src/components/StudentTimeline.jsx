// StudentTimeline.jsx (refactored)
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Divider
} from '@mui/material';
import { AccessTime, Delete, FilterList, Download, KeyboardVoice, MenuBook, TextFields } from '@mui/icons-material';
import { collectionGroup, query, where, orderBy, limit, onSnapshot, doc, deleteDoc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';
import useNotify from '../notifications/useNotify.js';

// Import new modular components
import FilterPanel from './FilterPanel';
import NoteExpansionDialog from './NoteExpansionDialog';
import useObservationFilters from '../hooks/useObservationFilters';
import { formatTimestamp } from '../utils/observationUtils.jsx';
import {
  executeExportJob,
  NOTE_KIND
} from '../utils/export';
import { isSuperAdmin } from '../utils/roleUtils';
import { canDeleteObservation } from '../utils/observationPermissions';
import ExportWizard from './ExportWizard';
import { ref, deleteObject } from 'firebase/storage';

function StudentTimeline({ student, currentUser, userRole, noteTypeFilter = null }) {
  const notify = useNotify();
  const isSuperAdminUser = isSuperAdmin(userRole);
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
  const [exportWizardOpen, setExportWizardOpen] = useState(false);
  const mediaDeleteAllowed = (obs) => canDeleteObservation(obs, currentUser, userRole);
  const notifiedFailuresRef = useRef(new Set());

  const getTeacherDisplayName = (obs) => (
    obs?.createdByName ||
    obs?.createdBy ||
    'Unknown Teacher'
  );

  const buildMediaSummary = (obs) => {
    const rawCount = Array.isArray(obs?.media) ? obs.media.length : null;
    const count = Number.isFinite(obs?.mediaCount) ? obs.mediaCount : (rawCount ?? 1);
    const rawKind = (obs?.mediaKind || '').toLowerCase();
    const kind = rawKind === 'photo' ? 'photo' : rawKind === 'video' ? 'video' : rawKind === 'pdf' ? 'pdf' : 'file';
    const label = count === 1 ? kind : `${kind}s`;
    const verb = count === 1 ? 'was' : 'were';
    const teacher = getTeacherDisplayName(obs);
    const timestamp = formatTimestamp(obs?.observedAt || obs?.timestamp);
    return `${count} ${label} ${verb} uploaded by ${teacher} on ${timestamp}.`;
  };

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

  const lessonTitleById = useMemo(() => {
    const map = {};
    (observations || []).forEach((obs) => {
      if (obs?.type === 'lesson') {
        map[obs.id] = obs.lessonTitle || 'Lesson note';
      }
    });
    return map;
  }, [observations]);

  // Use the filter hook instead of local state
  const {
    showFilters,
    filters,
    setFilters,
    uniqueCreators,
    filteredObservations,
    hasActiveFilters,
    handleFilterChange,
    handleClearFilters,
    toggleFilters,
    applyFilters
  } = useObservationFilters(observations, null);

  const visibleObservations = useMemo(() => filteredObservations || [], [filteredObservations]);

  const combinedFiltersActive = hasActiveFilters;

  useEffect(() => {
    if (!noteTypeFilter || noteTypeFilter === 'textVoice') {
      setFilters((prev) => ({ ...prev, types: [] }));
      return;
    }
    let types = [];
    if (noteTypeFilter === 'lesson') types = ['lesson'];
    if (noteTypeFilter === 'media') types = ['media'];
    setFilters((prev) => ({ ...prev, types }));
  }, [noteTypeFilter, setFilters]);

  useEffect(() => {
    if (!student) return;
    
    setLoading(true);
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('Observations loading timeout - forcing loading to false');
      setLoading(false);
    }, 10000); // 10 second timeout
    
    const studentIdToQuery = student.id;
    
    // Query with limit to prevent excessive reads (showing last 100 observations)
    // Users can load more if needed via pagination in the future
    const q = query(
      collectionGroup(db, 'observations'),
      where('studentId', '==', studentIdToQuery),
      orderBy('observedAt', 'desc'),
      limit(100) // Limit to prevent fetching all observations at once
    );

    // Use onSnapshot for real-time updates (single fetch, not double)
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        parentStudentId: d.ref.parent?.parent?.id,
        docPath: d.ref.path,
        ...d.data(),
      }));
      setObservations(list);
      setLoading(false);
      clearTimeout(timeoutId);
    }, (error) => {
      console.error('Error loading observations:', error);
      setLoading(false);
      clearTimeout(timeoutId);
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

  // Sync selectedObservation with updated observations data
  useEffect(() => {
    if (selectedObservation && observations.length > 0) {
      const updatedObservation = observations.find(obs => obs.id === selectedObservation.id);
      if (updatedObservation && updatedObservation.text !== selectedObservation.text) {
        setSelectedObservation(updatedObservation);
      }
    }
  }, [observations, selectedObservation]);

  useEffect(() => {
    (observations || []).forEach((obs) => {
      if (obs.type === 'media' && obs.status === 'failed' && !notifiedFailuresRef.current.has(obs.id)) {
        notifiedFailuresRef.current.add(obs.id);
        notify.error('Media upload failed. Please try again.', {
          actionLabel: mediaDeleteAllowed(obs) ? 'Delete' : undefined,
          onUndo: mediaDeleteAllowed(obs)
            ? () => {
                setSelectedObservation(obs);
                setDeleteConfirmOpen(true);
              }
            : undefined,
        });
      }
    });
  }, [observations]);



  const handleObservationClick = (observation) => {
    if (observation?.type === 'media') return;
    setSelectedObservation(observation);
    setDetailDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDetailDialogOpen(false);
    setSelectedObservation(null);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedObservation) return;
    if (!canDeleteObservation(selectedObservation, currentUser, userRole)) {
      notify.error('You are not allowed to delete this note.');
      return;
    }
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
          const parentId = obs.parentStudentId || student.id || obs.studentId;
          if (obs.type === 'media' && obs.media?.[0]?.storagePath) {
            await deleteObject(ref(storage, obs.media[0].storagePath)).catch(() => {});
          }
          await deleteDoc(doc(db, 'students', parentId, 'observations', obs.id));
          notify.success('Note deleted successfully', { id: notifId, duration: 2500 });
        } catch (error) {
          console.error('Error deleting observation:', error);
          notify.error('Error deleting note. Please try again.', { id: notifId, duration: 3500 });
        }
      },
      onUndo: () => {
        // Explicit confirmation banner for Undo
        notify.success('Undo Note Deletion Successful', { id: `${notifId}-undo`, duration: 2000 });
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
      const oldParentId = selectedObservation.parentStudentId || student.id;
      const srcRef = doc(db, 'students', oldParentId, 'observations', selectedObservation.id);
      const srcSnap = await getDoc(srcRef);
      if (!srcSnap.exists()) throw new Error('Source observation not found');

      const srcData = srcSnap.data() || {};
      // Fetch target student's classroomId to keep denorm consistent
      let targetClassroomId = srcData.classroomId;
      let targetStudentName = '';
      try {
        const targetStuSnap = await getDoc(doc(db, 'students', newStudentId));
        const tData = targetStuSnap.data() || {};
        targetClassroomId = tData?.classroomId || targetClassroomId;
        targetStudentName = tData.name || tData.displayName || [tData.firstName, tData.lastName].filter(Boolean).join(' ');
      } catch (_) { /* noop */ }

      const destRef = doc(db, 'students', newStudentId, 'observations', selectedObservation.id);
      const newData = {
        ...srcData,
        studentId: newStudentId,
        classroomId: targetClassroomId,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser.uid,
        lastEditedAt: serverTimestamp(),
      };
      await setDoc(destRef, newData);
      await deleteDoc(srcRef);

      // Close all dialogs
      setReassignConfirmOpen(false);
      setDetailDialogOpen(false);
      setSelectedObservation(null);
      setReassignSelectedStudents([]);
      // Show success with quick jump to the new student's Notes page
      notify.success(targetStudentName ? `Note reassigned to ${targetStudentName}` : 'Note reassigned', {
        duration: 6000,
        id: `reassign-${selectedObservation.id}`,
        actionLabel: 'View Note',
        onUndo: () => {
          try {
            window.dispatchEvent(new CustomEvent('navigateToStudentNotes', {
              detail: {
                studentId: newStudentId,
                noteTypeFilter: selectedObservation?.type === 'lesson' ? 'lesson' : 'textVoice'
              }
            }));
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

  const exportableObservations = useMemo(
    () => applyFilters(observations.filter((o) => o.type !== 'media'), null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [observations, filters]
  );
  const exportableCount = exportableObservations.length;
  const defaultNoteKind = NOTE_KIND.BOTH;
  const studentLabel = student?.name || student?.displayName || [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Student';

  const handleOpenExportWizard = () => {
    if (!exportableCount) {
      notify.warning('No notes to export for the current selection.', {
        id: `export-${student?.id || 'unknown'}-empty`,
        duration: 3000
      });
      return;
    }
    setExportWizardOpen(true);
  };

  const handleRunExport = async ({ noteKinds, format, dateRange }) => {
    try {
      setExporting(true);
      const result = executeExportJob({
        actor: currentUser,
        subject: {
          type: 'student',
          id: student?.id,
          name: studentLabel,
          displayName: studentLabel,
          classroomId: student?.classroomId
        },
        data: { observations: exportableObservations },
        noteKinds,
        format,
        dateRange,
        exportType: 'student_timeline_export',
        textHeader: `${studentLabel} - Notes`
      });

      if (result?.success) {
        notify.success(`Exported ${result.observationCount} notes to ${result.filename}`, {
          id: `export-${student?.id || 'unknown'}-success`,
          duration: 3500
        });
        setExportWizardOpen(false);
      } else {
        notify.error(`Export failed: ${result?.error || 'Unknown error'}`, {
          id: `export-${student?.id || 'unknown'}-error`,
          duration: 4000
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      notify.error('Export failed. Please try again.', {
        id: `export-${student?.id || 'unknown'}-exception`,
        duration: 4000
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative', pb: 8 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {combinedFiltersActive && (
            <Chip 
              label={`Showing ${visibleObservations.length} of ${totalNotes} notes`}
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
          <Button
            startIcon={exporting ? <CircularProgress size={16} /> : <Download />}
            onClick={handleOpenExportWizard}
            variant="outlined"
            color="secondary"
            size="small"
            disabled={exporting || exportableCount === 0}
            aria-label="Export notes"
            title={`Export ${exportableCount} notes`}
          >
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        </Box>
      </Box>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 4, gap: 2, flexDirection: 'column' }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">
            Coach Pepper is loading this student&apos;s timeline...
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Filter Panel */}
          <FilterPanel
            showFilters={showFilters}
            filters={filters}
            uniqueCreators={uniqueCreators}
            classroomTeachers={classroomTeachers}
            hasActiveFilters={hasActiveFilters}
            filteredCount={visibleObservations.length}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            onToggleFilters={toggleFilters}
          />

          {/* Summary */}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
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
            (visibleObservations || []).forEach((obs) => {
              let d = toDate(obs.observedAt || obs.timestamp) || new Date(0);
              if (d >= today) groups.today.push(obs);
              else if (d >= lastWeek) groups.last7Days.push(obs);
              else groups.beyond.push(obs);
            });

            const cardSx = {
              cursor: 'pointer',
              '&:hover': {
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                transform: 'translateY(-1px)',
              },
              transition: 'all 0.2s ease-in-out',
              position: 'relative',
            };

            const renderTimelineItem = (obs) => {
              if (obs.type === 'media') {
                return (
                  <Box key={obs.id} sx={{ px: 1, py: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {buildMediaSummary(obs)}
                    </Typography>
                  </Box>
                );
              }

              if (obs.type === 'lesson') {
                return (
                  <Card
                    key={obs.id}
                    onClick={() => handleObservationClick(obs)}
                    sx={cardSx}
                    aria-label={`View details for lesson note from ${formatTimestamp(obs.observedAt || obs.timestamp)}`}
                  >
                    <Chip
                      icon={<MenuBook sx={{ fontSize: 16 }} />}
                      label="Lesson Note"
                      size="small"
                      variant="outlined"
                      sx={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        borderColor: '#e2e8f0',
                        '& .MuiChip-icon': { color: '#0f172a' }
                      }}
                    />
                    <CardContent sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                        <span role="img" aria-label="teacher" style={{ fontSize: '16px' }}>
                          👩‍🏫
                        </span>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                          {getTeacherDisplayName(obs)}
                        </Typography>
                      </Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: obs.studentComment ? 0.5 : 0 }}>
                        {obs.lessonTitle || 'Lesson Note'}
                      </Typography>
                      {obs.studentComment && (
                        <Typography variant="body2" color="text.secondary">
                          {obs.studentComment}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                        <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          {formatTimestamp(obs.observedAt || obs.timestamp)}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <Card
                  key={obs.id}
                  onClick={() => handleObservationClick(obs)}
                  sx={cardSx}
                  aria-label={`View details for observation from ${formatTimestamp(obs.observedAt || obs.timestamp)}`}
                >
                  <Chip
                    icon={obs.type === 'voice'
                      ? <KeyboardVoice sx={{ fontSize: 16 }} />
                      : <TextFields sx={{ fontSize: 16 }} />}
                    label="Observation"
                    size="small"
                    variant="outlined"
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      borderColor: '#e2e8f0',
                      '& .MuiChip-icon': { color: '#0f172a' }
                    }}
                  />
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                      <span role="img" aria-label="teacher" style={{ fontSize: '16px' }}>
                        👩‍🏫
                      </span>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        {getTeacherDisplayName(obs)}
                      </Typography>
                    </Box>
                    <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {obs.text || '(transcribing…)'}
                    </Typography>
                    {Array.isArray(obs.linkedLessonObservationId) && obs.linkedLessonObservationId.length > 0 && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                          Tagged Lesson Notes:
                        </Typography>
                        {(obs.linkedLessonObservationId || []).map((id) => (
                          <Chip
                            key={id}
                            size="small"
                            variant="outlined"
                            label={lessonTitleById[id] || 'Lesson note'}
                            sx={{ borderRadius: 999 }}
                          />
                        ))}
                      </Box>
                    )}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
                      <Typography variant="caption" color="text.secondary">
                        {formatTimestamp(obs.observedAt || obs.timestamp)}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              );
            };

            const renderGroup = (label, items, labelColor) => (
              items && items.length > 0 ? (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: labelColor }}>
                      {label}
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {items.map((obs) => renderTimelineItem(obs))}
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
          {visibleObservations.length === 0 && observations.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              No notes match the current filters.
            </Typography>
          )}
          {observations.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              No notes yet.
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
            {selectedObservation?.type === 'media'
              ? 'Delete this media note and remove the attached file from storage?'
              : 'Are you sure you want to delete this observation note?'}
          </Typography>
          {selectedObservation && (
            selectedObservation.type === 'media' ? (
              <Typography variant="body2" color="text.secondary" sx={{ 
                backgroundColor: '#f8fafc',
                padding: 2,
                borderRadius: 2,
                border: '1px solid #e2e8f0'
              }}>
                {selectedObservation.mediaKind ? selectedObservation.mediaKind.toUpperCase() : 'Media'} · {selectedObservation.media?.[0]?.storagePath || 'No file path'}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ 
                fontStyle: 'italic',
                backgroundColor: '#f8fafc',
                padding: 2,
                borderRadius: 2,
                border: '1px solid #e2e8f0'
              }}>
                "{selectedObservation.text?.substring(0, 100)}{selectedObservation.text?.length > 100 ? '...' : ''}"
              </Typography>
            )
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

      <ExportWizard
        open={exportWizardOpen}
        onClose={() => setExportWizardOpen(false)}
        onConfirm={handleRunExport}
        observations={exportableObservations}
        defaultNoteKind={defaultNoteKind}
        isSuperAdmin={isSuperAdminUser}
        defaultFormat="txt"
        loading={exporting}
        title="Export Notes"
        subjectLabel={studentLabel}
      />

      {/* Note creation handled by global FAB */}
    </Box>
  );
}

export default StudentTimeline; 
