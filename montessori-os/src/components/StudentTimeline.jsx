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
  Tabs,
  Tab,
  IconButton,
  Checkbox,
  TextField,
  Skeleton
} from '@mui/material';
import { Trash2 as Delete, Filter as FilterList, Download, Image as PhotoLibrary, Video as Movie, File as InsertDriveFile, Upload as CloudUpload, CircleAlert as ErrorOutline, ChevronDown as ExpandMore, FileText as Description, ChevronLeft, ChevronRight, Sparkles as AutoAwesome, User, MessageCircle } from '../icons';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';
import useNotify from '../notifications/useNotify.js';

// Import new modular components
import FilterPanel from './FilterPanel';
import NoteBottomSheet from './noteBottomSheet/NoteBottomSheet';
import ClassroomNoteCard from './ClassroomNoteCard';
import { DayHeader } from './ui';
import { groupByCalendarDay } from './classroomTimelineUtils.js';
import useObservationFilters from '../hooks/useObservationFilters';
import useTimelineData from '../hooks/useTimelineData';
import { formatTimestamp } from '../utils/observationUtils.jsx';
import {
  executeExportJob,
  NOTE_KIND
} from '../utils/export';
import { isSuperAdmin } from '../utils/roleUtils';
import {
  AUTHOR_ACTION_EXPIRED_MESSAGE,
  canDeleteObservation,
  isAuthorActionExpired,
} from '../utils/observationPermissions';
import {
  planMissingMediaUrlPaths,
  fetchMediaUrlsWithConcurrency,
} from '../utils/mediaUrlBatching';
import ExportWizard from './ExportWizard';
import ReportPreviewDialog from './ReportPreviewDialog';
import { ref, getDownloadURL } from 'firebase/storage';

const MEDIA_URL_FETCH_CONCURRENCY = 6;

function StudentTimeline({ student, currentUser, userRole, noteTypeFilter = null, onInjectReady }) {
  const notify = useNotify();
  const isSuperAdminUser = isSuperAdmin(userRole);
  const [reportPreviewData, setReportPreviewData] = useState(null);
  const [selectedObservation, setSelectedObservation] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Classroom teachers for creator filter
  const [classroomTeachers, setClassroomTeachers] = useState([]);

  // Shared data hook — replaces onSnapshot + cursor pagination (#128)
  const {
    notes: observations,
    loading,
    displayLimit,
    showMore,
    injectNote,
  } = useTimelineData({
    scope: 'student',
    id: student?.id,
  });

  // Expose injectNote to parent for post-save timeline refresh (#129)
  useEffect(() => {
    if (onInjectReady) onInjectReady(injectNote);
    return () => { if (onInjectReady) onInjectReady(null); };
  }, [injectNote, onInjectReady]);

  // Export states
  const [exporting, setExporting] = useState(false);
  const [exportWizardOpen, setExportWizardOpen] = useState(false);
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [mediaSubTab, setMediaSubTab] = useState('photos'); // 'photos' | 'docs'
  const [mediaUrls, setMediaUrls] = useState({});
  const [mediaPreview, setMediaPreview] = useState(null); // { observation, url }
  // Media edit state moved to NoteBottomSheet
  const [mediaSelectMode, setMediaSelectMode] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const mediaDeleteAllowed = (obs) => canDeleteObservation(obs, currentUser, userRole);
  const notifiedFailuresRef = useRef(new Set());
  const isMountedRef = useRef(true);
  const mediaUrlsRef = useRef({});
  const mediaUrlInFlightPathsRef = useRef(new Set());

  // observations is provided by useTimelineData hook (merged, deduped, sorted)

  // Resolve classroom names for transferred notes (notes from a different classroom than student's current)
  const [classroomNameCache, setClassroomNameCache] = useState({});
  useEffect(() => {
    if (!student?.classroomId || !observations.length) return;
    const foreignIds = new Set();
    observations.forEach(n => {
      if (n.classroomId && n.classroomId !== student.classroomId) foreignIds.add(n.classroomId);
    });
    // Remove already-cached IDs
    const toFetch = [...foreignIds].filter(id => !(id in classroomNameCache));
    if (!toFetch.length) return;
    (async () => {
      const entries = {};
      await Promise.all(toFetch.map(async (cid) => {
        try {
          const snap = await getDoc(doc(db, 'classrooms', cid));
          entries[cid] = snap.exists() ? (snap.data().name || cid) : cid;
        } catch { entries[cid] = cid; }
      }));
      setClassroomNameCache(prev => ({ ...prev, ...entries }));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations, student?.classroomId]);

  // Derive unique curriculum areas from notes for FilterPanel
  const availableCurriculumAreas = useMemo(() => {
    const areas = new Set();
    observations.forEach(note => {
      if (note.curriculumArea) areas.add(note.curriculumArea);
    });
    return [...areas].sort();
  }, [observations]);

  const toJsDate = (ts) => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  };

  const normalizeMediaKind = (kind, contentType = '') => {
    const rawKind = String(kind || '').toLowerCase();
    if (rawKind === 'photo' || rawKind === 'video' || rawKind === 'pdf') return rawKind;
    const rawType = String(contentType || '').toLowerCase();
    if (rawType.startsWith('image/')) return 'photo';
    if (rawType.startsWith('video/')) return 'video';
    if (rawType === 'application/pdf') return 'pdf';
    return 'file';
  };

  const buildMediaItemsForObservation = (obs) => {
    if (!obs || obs.type !== 'media') return [];
    const entries = Array.isArray(obs.media) && obs.media.length > 0 ? obs.media : [{}];
    const itemObservedAt = obs.observedAt || obs.timestamp;
    const itemObservedAtDate = toJsDate(itemObservedAt);
    const observedAtMs = itemObservedAtDate ? itemObservedAtDate.getTime() : 0;
    return entries.map((entry, index) => ({
      id: `${obs.id}-${index}`,
      mediaDocId: obs.id,
      mediaIndex: index,
      storagePath: entry?.storagePath || null,
      mediaKind: normalizeMediaKind(obs.mediaKind, entry?.contentType),
      status: obs.status || 'ready',
      observedAt: itemObservedAt,
      timestamp: obs.timestamp,
      observedAtMs,
      teacherComment: obs.teacherComment || '',
      sourceObservation: obs,
    }));
  };



  const getMediaFailureMessage = (obs) => {
    const code = String(obs?.errorCode || '').toLowerCase();
    const rawMessage = String(obs?.errorMessage || '').trim();
    if (code === 'content_type_mismatch') {
      return 'Media upload failed due to file format mismatch. Please re-upload the file.';
    }
    if (code === 'file_too_large') {
      return 'Media upload failed because the photo exceeded the size limit.';
    }
    if (code === 'path_mismatch') {
      return 'Media upload failed due to an internal upload mismatch. Please try again.';
    }
    if (code === 'unsupported_kind') {
      return 'Media upload failed because this media type is not supported.';
    }
    if (rawMessage) {
      return `Media upload failed: ${rawMessage}`;
    }
    return 'Media upload failed. Please try again.';
  };

  // Derived counts for header summary
  const { totalNotes, notesLast7Days } = useMemo(() => {
    const nonReportObs = (observations || []).filter((o) => o.type !== 'report');
    const total = nonReportObs.length;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toDate = (ts) => {
      if (!ts) return null;
      if (ts.toDate) return ts.toDate();
      if (ts.seconds) return new Date(ts.seconds * 1000);
      return null;
    };
    const recent = nonReportObs.filter((obs) => {
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
    setFilters,
    uniqueCreators,
    filteredObservations,
    hasActiveFilters,
    handleFilterChange,
    handleClearFilters,
    toggleFilters,
    applyFilters
  } = useObservationFilters(observations, null);

  const visibleObservations = useMemo(() => (filteredObservations || []).slice(0, displayLimit), [filteredObservations, displayLimit]);

  const combinedFiltersActive = hasActiveFilters;

  const mediaObservations = useMemo(() => {
    return (observations || []).filter((obs) => obs.type === 'media');
  }, [observations]);

  const timelineItems = useMemo(() => {
    const items = [];
    const batches = new Map();
    (visibleObservations || []).forEach((obs) => {
      if (obs.type !== 'media') {
        items.push(obs);
        return;
      }
      const mediaItems = buildMediaItemsForObservation(obs);
      if (!obs.batchId) {
        items.push({
          ...obs,
          mediaItems,
          mediaCount: mediaItems.length || obs.mediaCount || 0,
        });
        return;
      }
      const key = obs.batchId;
      if (!batches.has(key)) {
        const initialDate = toJsDate(obs.observedAt || obs.timestamp);
        batches.set(key, {
          id: `batch-${key}`,
          type: 'media',
          batchId: key,
          createdBy: obs.createdBy,
          createdByName: obs.createdByName,
          createdByEmail: obs.createdByEmail,
          observedAt: obs.observedAt || obs.timestamp,
          timestamp: obs.timestamp,
          mediaKindCounts: { photo: 0, video: 0, pdf: 0, file: 0 },
          mediaCount: 0,
          mediaItems: [],
          linkedLessonObservationId: [],
          _observedAtMs: initialDate ? initialDate.getTime() : 0
        });
      }
      const group = batches.get(key);
      mediaItems.forEach((item) => {
        const kind = normalizeMediaKind(item.mediaKind);
        group.mediaKindCounts[kind] = (group.mediaKindCounts[kind] || 0) + 1;
        group.mediaCount += 1;
        group.mediaItems.push(item);
      });
      // Collect per-photo classification fields into the group (PEP-146)
      if (obs.curriculumArea) {
        if (!group.curriculumAreas) group.curriculumAreas = [];
        if (!group.curriculumAreas.includes(obs.curriculumArea)) {
          group.curriculumAreas.push(obs.curriculumArea);
        }
      }
      if (obs.handwritten) group.handwritten = true;
      if (Array.isArray(obs.materialsIdentified)) {
        if (!group.materialsIdentified) group.materialsIdentified = [];
        obs.materialsIdentified.forEach((mat) => {
          if (mat && !group.materialsIdentified.includes(mat)) {
            group.materialsIdentified.push(mat);
          }
        });
      }
      // Merge lesson tag IDs from each media doc in the batch
      if (Array.isArray(obs.linkedLessonObservationId)) {
        obs.linkedLessonObservationId.forEach((id) => {
          if (id && !group.linkedLessonObservationId.includes(id)) {
            group.linkedLessonObservationId.push(id);
          }
        });
      }
      const obsDate = toJsDate(obs.observedAt || obs.timestamp);
      const obsMs = obsDate ? obsDate.getTime() : 0;
      if (obsMs > group._observedAtMs) {
        group._observedAtMs = obsMs;
        group.observedAt = obs.observedAt || obs.timestamp;
        group.timestamp = obs.timestamp;
      }
    });
    batches.forEach((group) => {
      group.mediaItems = (group.mediaItems || []).sort((a, b) => {
        const byObservedAt = (b.observedAtMs || 0) - (a.observedAtMs || 0);
        if (byObservedAt !== 0) return byObservedAt;
        return (a.mediaIndex || 0) - (b.mediaIndex || 0);
      });
      items.push(group);
    });
    return items.sort((a, b) => {
      const da = toJsDate(a.observedAt || a.timestamp) || new Date(0);
      const db = toJsDate(b.observedAt || b.timestamp) || new Date(0);
      return db - da;
    });
  }, [visibleObservations, buildMediaItemsForObservation]);

  const selectedMediaList = useMemo(
    () => mediaObservations.filter((obs) => selectedMediaIds.has(obs.id)),
    [mediaObservations, selectedMediaIds]
  );

  const selectedMediaCount = selectedMediaIds.size;

  useEffect(() => {
    if (!noteTypeFilter || noteTypeFilter === 'textVoice') {
      setFilters((prev) => ({ ...prev, types: [] }));
      return;
    }
    if (noteTypeFilter === 'media') {
      setFilters((prev) => ({ ...prev, types: [] }));
      setMediaDialogOpen(true);
      setMediaSubTab('photos');
      return;
    }
    let types = [];
    if (noteTypeFilter === 'lesson') types = ['lesson'];
    setFilters((prev) => ({ ...prev, types }));
  }, [noteTypeFilter, setFilters]);

  useEffect(() => {
    if (!mediaDialogOpen) {
      setMediaSelectMode(false);
      setSelectedMediaIds(new Set());
      setBulkDeleteOpen(false);
    }
  }, [mediaDialogOpen]);

  // Media edit state reset moved to NoteBottomSheet useMediaPreview hook

  // Data fetching handled by useTimelineData hook (#128)

  // Extract classroom teachers from observations data, fetching user docs for status
  useEffect(() => {
    if (!observations.length) return;

    // Get unique teacher IDs from observations
    const uniqueIds = new Set();
    observations.forEach(obs => {
      const teacherId = obs.createdBy || obs.teacherId;
      if (teacherId) uniqueIds.add(teacherId);
    });

    // Fetch user docs to get status (needed for "Former" chip on inactive teachers)
    (async () => {
      const teachers = await Promise.all([...uniqueIds].map(async (teacherId) => {
        const obs = observations.find(o => (o.createdBy || o.teacherId) === teacherId);
        const fallbackName = obs?.createdByName || obs?.teacherName || obs?.createdByEmail || obs?.teacherEmail || `Teacher ${teacherId.slice(-4)}`;
        const fallbackEmail = obs?.createdByEmail || obs?.teacherEmail || `teacher-${teacherId.slice(-4)}@example.com`;
        try {
          const userDoc = await getDoc(doc(db, 'users', teacherId));
          if (userDoc.exists()) return { id: teacherId, ...userDoc.data() };
        } catch { /* fall through */ }
        return { id: teacherId, displayName: fallbackName, email: fallbackEmail, role: 'teacher' };
      }));
      setClassroomTeachers(teachers);
    })();
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
        notify.error(getMediaFailureMessage(obs), {
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
  }, [observations, mediaDeleteAllowed, notify]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    mediaUrlsRef.current = mediaUrls;
  }, [mediaUrls]);

  useEffect(() => {
    const readyMediaPaths = [];
    (mediaObservations || []).forEach((obs) => {
      if (obs.type !== 'media' || obs.status !== 'ready' || !Array.isArray(obs.media)) return;
      obs.media.forEach((entry) => {
        const path = entry?.storagePath;
        if (path) readyMediaPaths.push(path);
      });
    });
    const missingPaths = planMissingMediaUrlPaths(readyMediaPaths, {
      mediaUrls: mediaUrlsRef.current,
      inFlightPaths: mediaUrlInFlightPathsRef.current,
    });
    if (missingPaths.length === 0) return;
    missingPaths.forEach((path) => mediaUrlInFlightPathsRef.current.add(path));
    (async () => {
      try {
        await fetchMediaUrlsWithConcurrency(
          missingPaths,
          async (path) => getDownloadURL(ref(storage, path)),
          {
            concurrency: MEDIA_URL_FETCH_CONCURRENCY,
            onSuccess: ({ path, url }) => {
              if (!isMountedRef.current) return;
              setMediaUrls((prev) => {
                if (prev[path] === url) return prev;
                const next = { ...prev, [path]: url };
                mediaUrlsRef.current = next;
                return next;
              });
            },
            onError: () => {
              // Media URL failure handled gracefully — image simply won't render
            },
          },
        );
      } finally {
        missingPaths.forEach((path) => mediaUrlInFlightPathsRef.current.delete(path));
      }
    })();
  }, [mediaObservations]);

  const getPermissionErrorMessage = (obs) => (
    isAuthorActionExpired(obs, currentUser, userRole)
      ? AUTHOR_ACTION_EXPIRED_MESSAGE
      : 'You are not allowed to modify this note.'
  );


  const handleObservationClick = (observation) => {
    if (observation?.type === 'media') return;
    setSelectedObservation(observation);
    setDetailDialogOpen(true);
  };

  const handleMediaClick = (observation, list = null, index = -1) => {
    const firstItem = buildMediaItemsForObservation(observation)[0] || null;
    const sourceObservation = firstItem?.sourceObservation || observation;
    if (!sourceObservation) return;
    const path = firstItem?.storagePath || sourceObservation.media?.[0]?.storagePath;
    const url = path ? mediaUrls[path] : null;
    setMediaPreview({
      observation: {
        ...sourceObservation,
        mediaKind: firstItem?.mediaKind || sourceObservation.mediaKind,
        status: firstItem?.status || sourceObservation.status,
        media: path ? [{ storagePath: path }] : (Array.isArray(sourceObservation.media) ? sourceObservation.media : []),
      },
      url: url || null,
      fullscreen: false,
      carouselList: list,
      carouselIndex: index,
    });
  };

  const navigateMediaPreview = (direction) => {
    if (!mediaPreview?.carouselList) return;
    const newIndex = mediaPreview.carouselIndex + direction;
    if (newIndex < 0 || newIndex >= mediaPreview.carouselList.length) return;
    const obs = mediaPreview.carouselList[newIndex];
    const firstItem = buildMediaItemsForObservation(obs)[0] || null;
    const sourceObservation = firstItem?.sourceObservation || obs;
    if (!sourceObservation) return;
    const path = firstItem?.storagePath || sourceObservation.media?.[0]?.storagePath;
    const url = path ? mediaUrls[path] : null;
    setMediaPreview({
      observation: {
        ...sourceObservation,
        mediaKind: firstItem?.mediaKind || sourceObservation.mediaKind,
        status: firstItem?.status || sourceObservation.status,
        media: path ? [{ storagePath: path }] : (Array.isArray(sourceObservation.media) ? sourceObservation.media : []),
      },
      url: url || null,
      fullscreen: false,
      carouselList: mediaPreview.carouselList,
      carouselIndex: newIndex,
    });
  };

  // handleSaveMediaComment moved to NoteBottomSheet useMediaPreview hook

  const handleToggleMediaSelectMode = () => {
    setMediaSelectMode((prev) => {
      const next = !prev;
      if (!next) setSelectedMediaIds(new Set());
      return next;
    });
  };

  const toggleMediaSelection = (obs) => {
    if (!obs || !mediaDeleteAllowed(obs)) return;
    setSelectedMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(obs.id)) next.delete(obs.id);
      else next.add(obs.id);
      return next;
    });
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedMediaList.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setBulkDeleting(true);
    let deleted = 0;
    let skipped = 0;
    try {
      for (const obs of selectedMediaList) {
        if (!mediaDeleteAllowed(obs)) {
          skipped += 1;
          continue;
        }
        const parentId = obs.parentStudentId || student.id || obs.studentId;
        await deleteDoc(doc(db, 'students', parentId, 'media', obs.id));
        deleted += 1;
      }
      if (deleted > 0) {
        notify.success(`Deleted ${deleted} media item${deleted > 1 ? 's' : ''}.`, { duration: 3000 });
      }
      if (skipped > 0) {
        notify.warning(`Skipped ${skipped} item${skipped > 1 ? 's' : ''} due to permissions.`, { duration: 3000 });
      }
    } catch {
      notify.error('Error deleting media items. Please try again.', { duration: 3500 });
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
      setSelectedMediaIds(new Set());
      setMediaSelectMode(false);
    }
  };

  const handleCloseDialog = () => {
    setDetailDialogOpen(false);
    setSelectedObservation(null);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedObservation) return;
    if (!canDeleteObservation(selectedObservation, currentUser, userRole)) {
      notify.error(getPermissionErrorMessage(selectedObservation));
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
          const targetCollection = obs.type === 'media' ? 'media' : 'observations';
          const docRef = doc(db, 'students', parentId, targetCollection, obs.id);

          // Storage file cleanup is handled server-side by the mediaCleanup
          // Cloud Function trigger — no client-side deleteObject needed.

          const deleteResult = await deleteDoc(docRef)
            .then(() => ({ ok: true }))
            .catch((err) => ({ ok: false, err }));

          if (!deleteResult.ok && deleteResult.err?.code !== 'not-found') {
            throw deleteResult.err;
          }

          notify.success('Note deleted successfully', { id: notifId, duration: 2500 });
        } catch {
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
  const exportableObservations = useMemo(
    () => applyFilters(observations.filter((o) => o.type !== 'media' && o.type !== 'report'), null),
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

  // handleLoadMore replaced by showMore from useTimelineData hook (#128)

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
    } catch {
      notify.error('Export failed. Please try again.', {
        id: `export-${student?.id || 'unknown'}-exception`,
        duration: 4000
      });
    } finally {
      setExporting(false);
    }
  };

  // Media preview permission checks moved to NoteBottomSheet

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
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton
            aria-label="Open media"
            title="Media"
            onClick={() => setMediaDialogOpen(true)}
            sx={{
              color: 'var(--grey-900)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-paper)',
              width: 40,
              height: 40,
              borderRadius: '50%',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              '&:hover': {
                backgroundColor: 'var(--color-bg)'
              }
            }}
          >
            <PhotoLibrary />
          </IconButton>
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
            availableCurriculumAreas={availableCurriculumAreas}
          />

          {/* Summary */}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {totalNotes} notes overall | {notesLast7Days} notes in last 7 days
          </Typography>

          {/* Day-grouped notes timeline */}
          {(() => {
            const dayGroups = groupByCalendarDay(timelineItems || []);

            const renderTimelineItem = (obs) => {
              if (obs.type === 'report') {
                return (
                  <Card
                    key={obs.id}
                    onClick={() => setReportPreviewData(obs)}
                    sx={{
                      borderRadius: 2,
                      cursor: 'pointer',
                      borderLeft: '3px solid',
                      borderLeftColor: 'secondary.main',
                      backgroundColor: 'rgba(76, 175, 80, 0.04)',
                      '&:hover': {
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        transform: 'translateY(-1px)',
                      },
                      transition: 'all 0.2s ease-in-out',
                    }}
                    aria-label={`View report generated on ${formatTimestamp(obs.observedAt)}`}
                  >
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Description size={18} style={{ color: 'var(--color-secondary)' }} />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Report generated
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {formatTimestamp(obs.observedAt)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ml: 3.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {obs.generatedByName ? `By ${obs.generatedByName}` : 'Generated'}
                          {obs.noteCount > 0 ? ` \u00b7 ${obs.noteCount} notes` : ''}
                        </Typography>
                        <Button size="small" variant="outlined" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0, px: 1, minHeight: 22, lineHeight: 1.4 }}>
                          View report
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                );
              }

              // Media notes: open media preview on click
              if (obs.type === 'media') {
                const mediaItems = Array.isArray(obs.mediaItems) && obs.mediaItems.length > 0
                  ? obs.mediaItems
                  : buildMediaItemsForObservation(obs);
                return (
                  <ClassroomNoteCard
                    key={obs.id}
                    note={obs}
                    variant="student"
                    isTransferred={!!(obs.classroomId && student?.classroomId && obs.classroomId !== student.classroomId)}
                    transferredToClassroomName={obs.classroomId !== student?.classroomId ? classroomNameCache[obs.classroomId] : undefined}
                    classroomTeachers={classroomTeachers}
                    onNoteClick={() => {
                      if (mediaItems.length > 0) {
                        const item = mediaItems[0];
                        const sourceObservation = item?.sourceObservation || obs;
                        const path = item?.storagePath || sourceObservation?.media?.[0]?.storagePath;
                        const url = path ? mediaUrls[path] : null;
                        setMediaPreview({
                          observation: {
                            ...sourceObservation,
                            mediaKind: item?.mediaKind || sourceObservation?.mediaKind,
                            status: item?.status || sourceObservation?.status,
                            media: path ? [{ storagePath: path }] : (Array.isArray(sourceObservation?.media) ? sourceObservation.media : []),
                          },
                          url: url || null,
                          fullscreen: true,
                        });
                      }
                    }}
                    mediaUrls={mediaUrls}
                  />
                );
              }

              // Text, voice, lesson notes
              return (
                <ClassroomNoteCard
                  key={obs.id}
                  note={obs}
                  variant="student"
                  isTransferred={!!(obs.classroomId && student?.classroomId && obs.classroomId !== student.classroomId)}
                  transferredToClassroomName={obs.classroomId !== student?.classroomId ? classroomNameCache[obs.classroomId] : undefined}
                  classroomTeachers={classroomTeachers}
                  onNoteClick={() => handleObservationClick(obs)}
                  mediaUrls={mediaUrls}
                />
              );
            };

            return dayGroups.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayGroups.map((day) => (
                  <React.Fragment key={day.dateKey}>
                    <DayHeader label={day.label} accent={day.label === 'Today'} />
                    {day.items.map((item) => renderTimelineItem(item))}
                  </React.Fragment>
                ))}
              </Box>
            ) : null;
          })()}
          {/* Show More Button — UI-only, no Firestore calls (#128) */}
          {displayLimit < (filteredObservations?.length || 0) && (
            <Box sx={{ textAlign: 'center', pt: 2 }}>
              <Button
                variant="outlined"
                onClick={showMore}
                startIcon={<ExpandMore />}
                sx={{ textTransform: 'none' }}
              >
                Show More
              </Button>
            </Box>
          )}
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

      {/* Note expansion bottom sheet (all types including media) */}
      <NoteBottomSheet
        open={detailDialogOpen || !!mediaPreview}
        onClose={() => { handleCloseDialog(); setMediaPreview(null); }}
        observation={mediaPreview?.observation || selectedObservation}
        student={student}
        currentUser={currentUser}
        userRole={userRole}
        isClassroomContext={false}
        classroomTeachers={classroomTeachers}
        mediaUrl={mediaPreview?.url}
        carouselList={mediaPreview?.carouselList}
        carouselIndex={mediaPreview?.carouselIndex}
        onCarouselNavigate={(direction) => navigateMediaPreview(direction)}
      />

      {/* Media Dialog */}
      <Dialog
        open={mediaDialogOpen}
        onClose={() => setMediaDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="h6" component="span">Media</Typography>
            <Button
              variant={mediaSelectMode ? 'contained' : 'outlined'}
              size="small"
              onClick={handleToggleMediaSelectMode}
            >
              {mediaSelectMode ? 'Done' : 'Select'}
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Tabs
            value={mediaSubTab}
            onChange={(_, val) => setMediaSubTab(val)}
            textColor="primary"
            indicatorColor="primary"
            variant="fullWidth"
            sx={{ mb: 2 }}
          >
            <Tab value="photos" label="Photos / Videos" />
            <Tab value="docs" label="Docs" />
          </Tabs>

          {(() => {
            const sortedMedia = [...(mediaObservations || [])].sort((a, b) => {
              const da = toJsDate(a.observedAt || a.timestamp) || new Date(0);
              const db = toJsDate(b.observedAt || b.timestamp) || new Date(0);
              return db - da;
            });
            const photosVideos = sortedMedia.filter((obs) => (obs.mediaKind || '').toLowerCase() !== 'pdf');
            const docs = sortedMedia.filter((obs) => (obs.mediaKind || '').toLowerCase() === 'pdf');
            const renderStatusChip = (obs) => {
              if (obs.status === 'pending_upload') {
                return <Chip size="small" label="Pending" color="warning" icon={<CloudUpload size={16} />} />;
              }
              if (obs.status === 'failed') {
                return <Chip size="small" label="Failed" color="error" icon={<ErrorOutline size={16} />} />;
              }
              return null;
            };

            if (mediaSubTab === 'docs') {
              return docs.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {docs.map((obs) => {
                    const path = obs.media?.[0]?.storagePath;
                    const url = path ? mediaUrls[path] : null;
                    const isReady = obs.status === 'ready' && url;
                    const isSelected = selectedMediaIds.has(obs.id);
                    const canSelect = mediaDeleteAllowed(obs);
                    return (
                      <Card
                        key={obs.id}
                        onClick={() => {
                          if (mediaSelectMode) {
                            toggleMediaSelection(obs);
                            return;
                          }
                          if (isReady) window.open(url, '_blank');
                        }}
                        sx={{
                          cursor: mediaSelectMode ? 'pointer' : (isReady ? 'pointer' : 'default'),
                          '&:hover': isReady ? { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } : undefined,
                          p: 1.5
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <InsertDriveFile style={{ color: 'var(--color-primary)' }} />
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {obs.pdfTitle || 'PDF'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatTimestamp(obs.observedAt || obs.timestamp)}
                            </Typography>
                          </Box>
                          {mediaSelectMode && (
                            <Checkbox
                              checked={isSelected}
                              disabled={!canSelect}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMediaSelection(obs);
                              }}
                            />
                          )}
                          {renderStatusChip(obs)}
                          {/* Delete only in expanded media view */}
                        </Box>
                      </Card>
                    );
                  })}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No documents yet.
                </Typography>
              );
            }

            return photosVideos.length > 0 ? (
              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)' },
                gap: 1
              }}>
                {photosVideos.map((obs, idx) => {
                  const path = obs.media?.[0]?.storagePath;
                  const url = path ? mediaUrls[path] : null;
                  const isPending = obs.status === 'pending_upload';
                  const isFailed = obs.status === 'failed';
                  const isReady = obs.status === 'ready' && url;
                  const isSelected = selectedMediaIds.has(obs.id);
                  const canSelect = mediaDeleteAllowed(obs);
                  return (
                    <Box
                      key={obs.id}
                      onClick={() => {
                        if (mediaSelectMode) {
                          toggleMediaSelection(obs);
                          return;
                        }
                        if (isReady) { setMediaDialogOpen(false); handleMediaClick(obs, photosVideos, idx); }
                      }}
                      sx={{
                        cursor: mediaSelectMode ? 'pointer' : (isReady ? 'pointer' : 'default'),
                        '&:hover': isReady ? { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } : undefined,
                        position: 'relative',
                        borderRadius: 2,
                        overflow: 'hidden',
                        backgroundColor: 'var(--color-bg)',
                        aspectRatio: '1 / 1'
                      }}
                    >
                      <Box sx={{ position: 'relative', height: '100%' }}>
                        {isReady && obs.mediaKind === 'photo' && (
                          <Box
                            component="img"
                            src={url}
                            alt="Photo"
                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        )}
                        {isReady && obs.mediaKind === 'video' && (
                          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Movie style={{ color: 'var(--color-primary)' }} />
                          </Box>
                        )}
                        {isPending && (
                          <Box
                            sx={{
                              position: 'absolute',
                              inset: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexDirection: 'column',
                              gap: 0.5,
                              backgroundColor: 'rgba(248,250,252,0.85)',
                            }}
                          >
                            <CircularProgress size={20} />
                            <Typography variant="caption" color="text.secondary">
                              Uploading
                            </Typography>
                          </Box>
                        )}
                        {isFailed && (
                          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1 }}>
                            <ErrorOutline style={{ color: 'var(--color-error)' }} />
                            <Typography variant="caption" color="error">Upload failed</Typography>
                          </Box>
                        )}
                        <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                          {renderStatusChip(obs)}
                        </Box>
                        {mediaSelectMode && (
                          <Box sx={{ position: 'absolute', top: 6, right: 6 }}>
                            <Checkbox
                              checked={isSelected}
                              disabled={!canSelect}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMediaSelection(obs);
                              }}
                              sx={{
                                backgroundColor: 'rgba(255,255,255,0.9)',
                                borderRadius: '50%'
                              }}
                            />
                          </Box>
                        )}
                        {/* Delete only in expanded media view */}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No photos or videos yet.
              </Typography>
            );
          })()}

          {mediaObservations.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              No media notes yet.
            </Typography>
          )}

          {mediaSelectMode && (
            <Box
              sx={{
                position: 'sticky',
                bottom: 0,
                mt: 2,
                pt: 2,
                pb: 1,
                backgroundColor: 'var(--color-paper)',
                borderTop: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {selectedMediaCount} selected
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" onClick={handleToggleMediaSelectMode}>
                  Cancel
                </Button>
                <Button
                  color="error"
                  variant="contained"
                  startIcon={bulkDeleting ? <CircularProgress size={16} /> : <Delete />}
                  disabled={selectedMediaCount === 0 || bulkDeleting}
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  Delete
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setMediaDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle component="div">
          <Typography component="h2" variant="h6" color="error">
            Delete Selected Media
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Delete {selectedMediaCount} selected item{selectedMediaCount === 1 ? '' : 's'}?
          </Typography>
          <Typography variant="body2" color="error" sx={{ fontWeight: 'medium' }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button variant="outlined" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleBulkDeleteConfirm}
            variant="contained"
            color="error"
            disabled={bulkDeleting}
            startIcon={bulkDeleting ? <CircularProgress size={16} /> : <Delete />}
          >
            {bulkDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
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
        <DialogTitle component="div">
          <Typography component="h2" variant="h6" color="error">
            Delete Note
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {selectedObservation?.type === 'media'
              ? 'Are you sure you want to delete this media?'
              : 'Are you sure you want to delete this observation note?'}
          </Typography>
          {selectedObservation && selectedObservation.type !== 'media' && (
            <Typography variant="body2" color="text.secondary" sx={{ 
              fontStyle: 'italic',
              backgroundColor: 'var(--color-bg)',
              padding: 2,
              borderRadius: 2,
              border: '1px solid var(--color-border)'
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
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            sx={{ flex: 1 }}
            startIcon={<Delete />}
          >
            Delete
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

      {/* Report preview dialog for timeline report markers */}
      <ReportPreviewDialog
        open={!!reportPreviewData}
        onClose={() => setReportPreviewData(null)}
        reportText={reportPreviewData?.reportText || ''}
        reportType={reportPreviewData?.reportType || 'term'}
        missingInputFlags={reportPreviewData?.missingInputFlags || []}
        generatedAt={reportPreviewData?.observedAt || null}
        studentLabel={student?.displayName || student?.name || 'Student'}
        noteCount={reportPreviewData?.noteCount || null}
        driveDocLink={reportPreviewData?.driveDocLink || null}
      />

      {/* Note creation handled by global FAB */}
    </Box>
  );
}

export default StudentTimeline; 
