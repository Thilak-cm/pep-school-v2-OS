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
  Divider,
  Tabs,
  Tab,
  IconButton,
  Checkbox,
  TextField
} from '@mui/material';
import { AccessTime, Delete, FilterList, Download, KeyboardVoice, MenuBook, TextFields, PhotoLibrary, Movie, InsertDriveFile, CloudUpload, ErrorOutline, PlayCircleFilled, ExpandMore } from '@mui/icons-material';
import { collection, collectionGroup, query, where, orderBy, limit, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp, startAfter, getDocs } from 'firebase/firestore';
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
import { isAdminRole, isSuperAdmin } from '../utils/roleUtils';
import {
  AUTHOR_ACTION_EXPIRED_MESSAGE,
  canDeleteObservation,
  canEditObservation,
  isAuthorActionExpired,
  isObservationAuthor,
} from '../utils/observationPermissions';
import {
  planMissingMediaUrlPaths,
  fetchMediaUrlsWithConcurrency,
} from '../utils/mediaUrlBatching';
import ExportWizard from './ExportWizard';
import { ref, getDownloadURL } from 'firebase/storage';

const MEDIA_URL_FETCH_CONCURRENCY = 6;

function StudentTimeline({ student, currentUser, userRole, noteTypeFilter = null }) {
  const notify = useNotify();
  const isSuperAdminUser = isSuperAdmin(userRole);
  const [recentObs, setRecentObs] = useState([]);
  const [olderObs, setOlderObs] = useState([]);
  const [mediaDocs, setMediaDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreObs, setHasMoreObs] = useState(false);
  const [selectedObservation, setSelectedObservation] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const snapshotLastDocRef = useRef(null);
  const paginationCursorRef = useRef(null);
  const prevRecentIdsRef = useRef(new Set());
  // Note: All note expansion functionality is now handled by NoteExpansionDialog component
  
  // Classroom teachers for creator filter
  const [classroomTeachers, setClassroomTeachers] = useState([]);
  
  // Export states
  const [exporting, setExporting] = useState(false);
  const [exportWizardOpen, setExportWizardOpen] = useState(false);
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [mediaSubTab, setMediaSubTab] = useState('photos'); // 'photos' | 'docs'
  const [mediaUrls, setMediaUrls] = useState({});
  const [mediaPreview, setMediaPreview] = useState(null); // { observation, url }
  const [mediaEditMode, setMediaEditMode] = useState(false);
  const [mediaEditComment, setMediaEditComment] = useState('');
  const [mediaEditSaving, setMediaEditSaving] = useState(false);
  const [mediaSelectMode, setMediaSelectMode] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const mediaDeleteAllowed = (obs) => canDeleteObservation(obs, currentUser, userRole);
  const notifiedFailuresRef = useRef(new Set());
  const isMountedRef = useRef(true);
  const mediaUrlsRef = useRef({});
  const mediaUrlInFlightPathsRef = useRef(new Set());

  // Derive observations by merging recentObs + olderObs + mediaDocs, deduping, sorting
  const observations = useMemo(() => {
    const merged = [...recentObs, ...olderObs, ...mediaDocs];
    const seen = new Set();
    const deduped = merged.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    deduped.sort((a, b) => {
      const da = a.observedAt?.toDate?.() ? a.observedAt.toDate() : (a.observedAt?.seconds ? new Date(a.observedAt.seconds * 1000) : new Date(0));
      const db = b.observedAt?.toDate?.() ? b.observedAt.toDate() : (b.observedAt?.seconds ? new Date(b.observedAt.seconds * 1000) : new Date(0));
      return db - da;
    });
    return deduped;
  }, [recentObs, olderObs, mediaDocs]);

  const toJsDate = (ts) => {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  };

  const getTeacherDisplayName = (obs) => (
    obs?.createdByName ||
    obs?.createdBy ||
    'Unknown Teacher'
  );

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

  const formatMediaCountLabel = (count, kind) => {
    if (count <= 0) return '';
    const base = kind === 'pdf' ? 'PDF' : kind;
    const label = count === 1 ? base : `${base}s`;
    return `${count} ${label}`;
  };

  const buildMediaSummary = (obs) => {
    const teacher = getTeacherDisplayName(obs);
    const timestamp = formatTimestamp(obs?.observedAt || obs?.timestamp);
    if (obs?.mediaKindCounts) {
      const counts = obs.mediaKindCounts || {};
      const parts = [];
      if (counts.photo) parts.push(formatMediaCountLabel(counts.photo, 'photo'));
      if (counts.video) parts.push(formatMediaCountLabel(counts.video, 'video'));
      if (counts.pdf) parts.push(formatMediaCountLabel(counts.pdf, 'pdf'));
      if (counts.file) parts.push(formatMediaCountLabel(counts.file, 'file'));
      const label = parts.length > 0 ? parts.join(' + ') : 'files';
      return `${teacher} added ${label} on ${timestamp}.`;
    }
    const rawCount = Array.isArray(obs?.media) ? obs.media.length : null;
    const count = Number.isFinite(obs?.mediaCount) ? obs.mediaCount : (rawCount ?? 1);
    const rawKind = (obs?.mediaKind || '').toLowerCase();
    const kind = rawKind === 'photo' ? 'photo' : rawKind === 'video' ? 'video' : rawKind === 'pdf' ? 'pdf' : 'file';
    const label = formatMediaCountLabel(count, kind) || `${count} files`;
    return `${teacher} added ${label} on ${timestamp}.`;
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

  const mediaObservations = useMemo(() => {
    const filtered = applyFilters(mediaDocs, 'media') || [];
    return filtered.filter((obs) => obs.type === 'media');
  }, [mediaDocs, applyFilters]);

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

  useEffect(() => {
    if (!mediaPreview?.observation) {
      setMediaEditMode(false);
      setMediaEditComment('');
      setMediaEditSaving(false);
      return;
    }
    setMediaEditMode(false);
    setMediaEditComment(mediaPreview.observation.teacherComment || '');
    setMediaEditSaving(false);
  }, [mediaPreview]);

  const OBS_PAGE_SIZE = 20;

  useEffect(() => {
    if (!student) return;

    setLoading(true);
    setMediaUrls({});
    setOlderObs([]);
    paginationCursorRef.current = null;
    snapshotLastDocRef.current = null;
    prevRecentIdsRef.current = new Set();

    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 10000); // 10 second timeout

    const studentIdToQuery = student.id;

    const obsQuery = query(
      collectionGroup(db, 'observations'),
      where('studentId', '==', studentIdToQuery),
      orderBy('observedAt', 'desc'),
      limit(OBS_PAGE_SIZE)
    );

    const mediaQuery = query(
      collection(db, 'students', studentIdToQuery, 'media'),
      orderBy('observedAt', 'desc'),
      limit(200)
    );

    let obsReady = false;
    let mediaReady = false;

    const checkLoaded = () => {
      if (obsReady && mediaReady) {
        setLoading(false);
        clearTimeout(timeoutId);
      }
    };

    const unsubObs = onSnapshot(obsQuery, (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        parentStudentId: d.ref.parent?.parent?.id,
        docPath: d.ref.path,
        ...d.data(),
      }));

      // Detect observations displaced from recentObs by the new snapshot
      // (e.g., the observation at position 20 that falls off when a new one is added)
      const newIds = new Set(list.map((o) => o.id));
      const prevIds = prevRecentIdsRef.current;
      if (prevIds.size > 0) {
        setRecentObs((prevRecent) => {
          const displaced = prevRecent.filter((o) => !newIds.has(o.id));
          if (displaced.length > 0) {
            setOlderObs((prevOlder) => {
              const olderIds = new Set(prevOlder.map((o) => o.id));
              const toAdd = displaced.filter((o) => !olderIds.has(o.id));
              return toAdd.length > 0 ? [...toAdd, ...prevOlder] : prevOlder;
            });
          }
          return list;
        });
      } else {
        setRecentObs(list);
      }
      prevRecentIdsRef.current = newIds;

      if (snap.docs.length > 0) {
        snapshotLastDocRef.current = snap.docs[snap.docs.length - 1];
      }
      setHasMoreObs(snap.docs.length >= OBS_PAGE_SIZE);
      obsReady = true;
      checkLoaded();
    }, () => {
      obsReady = true;
      checkLoaded();
    });

    const unsubMedia = onSnapshot(mediaQuery, (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        parentStudentId: d.ref.parent?.parent?.id,
        docPath: d.ref.path,
        ...d.data(),
      }));
      setMediaDocs(list);
      mediaReady = true;
      checkLoaded();
    }, () => {
      setMediaDocs([]);
      mediaReady = true;
      checkLoaded();
    });

    return () => {
      clearTimeout(timeoutId);
      unsubObs();
      unsubMedia();
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
            onError: ({ path, error }) => {
              console.warn('StudentTimeline: failed to load media URL', { path, error });
            },
          },
        );
      } finally {
        missingPaths.forEach((path) => mediaUrlInFlightPathsRef.current.delete(path));
      }
    })();
  }, [mediaObservations]);

  const canManageObservationActions = (obs) =>
    isAdminRole(userRole) || isObservationAuthor(obs, currentUser);

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

  const handleMediaClick = (observation) => {
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
    });
  };

  const handleSaveMediaComment = async () => {
    const previewObs = mediaPreview?.observation;
    if (!previewObs) return;
    if (!canEditObservation(previewObs, currentUser, userRole)) {
      notify.error(getPermissionErrorMessage(previewObs));
      return;
    }
    try {
      setMediaEditSaving(true);
      const parentId = previewObs.parentStudentId || student.id || previewObs.studentId;
      const nextComment = (mediaEditComment || '').trim();
      await updateDoc(doc(db, 'students', parentId, 'media', previewObs.id), {
        teacherComment: nextComment,
        updatedAt: serverTimestamp(),
        lastEditedBy: currentUser?.uid || null,
        lastEditedAt: serverTimestamp(),
      });
      setMediaPreview((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          observation: {
            ...prev.observation,
            teacherComment: nextComment,
          },
        };
      });
      setMediaEditMode(false);
      notify.success('Media comment updated.', { duration: 2500 });
    } catch (_error) {
      notify.error('Error updating media comment. Please try again.', { duration: 3500 });
    } finally {
      setMediaEditSaving(false);
    }
  };

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

  const handleLoadMore = async () => {
    if (!student) return;
    const cursor = paginationCursorRef.current || snapshotLastDocRef.current;
    if (!cursor) return;

    setLoadingMore(true);
    try {
      const moreQuery = query(
        collectionGroup(db, 'observations'),
        where('studentId', '==', student.id),
        orderBy('observedAt', 'desc'),
        startAfter(cursor),
        limit(OBS_PAGE_SIZE)
      );
      const snap = await getDocs(moreQuery);
      const newObs = snap.docs.map((d) => ({
        id: d.id,
        parentStudentId: d.ref.parent?.parent?.id,
        docPath: d.ref.path,
        ...d.data(),
      }));
      if (snap.docs.length > 0) {
        paginationCursorRef.current = snap.docs[snap.docs.length - 1];
      }
      setHasMoreObs(snap.docs.length >= OBS_PAGE_SIZE);
      if (newObs.length > 0) {
        setOlderObs(prev => [...prev, ...newObs]);
      }
    } catch {
      notify.error('Failed to load more notes. Please try again.', { duration: 3000 });
    } finally {
      setLoadingMore(false);
    }
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
    } catch {
      notify.error('Export failed. Please try again.', {
        id: `export-${student?.id || 'unknown'}-exception`,
        duration: 4000
      });
    } finally {
      setExporting(false);
    }
  };

  const previewObservation = mediaPreview?.observation || null;
  const previewCanEdit = canEditObservation(previewObservation, currentUser, userRole);
  const previewCanDelete = canDeleteObservation(previewObservation, currentUser, userRole);
  const previewActionExpired = isAuthorActionExpired(previewObservation, currentUser, userRole);
  const previewCanManage = canManageObservationActions(previewObservation);

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
              color: '#0f172a',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              width: 40,
              height: 40,
              borderRadius: '50%',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              '&:hover': {
                backgroundColor: '#f8fafc'
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
            (timelineItems || []).forEach((obs) => {
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
                const mediaItems = Array.isArray(obs.mediaItems) && obs.mediaItems.length > 0
                  ? obs.mediaItems
                  : buildMediaItemsForObservation(obs);
                const openMediaItemPreview = (item) => {
                  const sourceObservation = item?.sourceObservation || obs;
                  const path = item?.storagePath || sourceObservation?.media?.[0]?.storagePath;
                  const url = path ? mediaUrls[path] : null;
                  setMediaPreview({
                    observation: {
                      ...sourceObservation,
                      mediaKind: item?.mediaKind || sourceObservation?.mediaKind,
                      status: item?.status || sourceObservation?.status,
                      observedAt: item?.observedAt || sourceObservation?.observedAt,
                      timestamp: item?.timestamp || sourceObservation?.timestamp,
                      teacherComment: item?.teacherComment || sourceObservation?.teacherComment,
                      media: path ? [{ storagePath: path }] : (Array.isArray(sourceObservation?.media) ? sourceObservation.media : []),
                    },
                    url: url || null,
                    fullscreen: true,
                  });
                };
                return (
                  <Card key={obs.id} sx={{ ...cardSx, cursor: 'default' }}>
                    <CardContent sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                        <span role="img" aria-label="teacher" style={{ fontSize: '16px' }}>
                          👩‍🏫
                        </span>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                          {getTeacherDisplayName(obs)}
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.5 }}>
                      {buildMediaSummary(obs)}
                      </Typography>
                      {!obs.batchId && obs.teacherComment && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                          💬 {obs.teacherComment}
                        </Typography>
                      )}

                      {mediaItems.length > 0 && (
                        <>
                          {mediaItems.length >= 4 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              Swipe to browse {mediaItems.length} items
                            </Typography>
                          )}
                          <Box
                            sx={{
                              mt: 1,
                              display: 'flex',
                              gap: 1,
                              overflowX: 'auto',
                              pb: 0.5,
                              scrollSnapType: 'x mandatory',
                              '&::-webkit-scrollbar': {
                                height: 6,
                              },
                              '&::-webkit-scrollbar-thumb': {
                                backgroundColor: '#cbd5e1',
                                borderRadius: 999,
                              },
                            }}
                          >
                            {mediaItems.map((item) => {
                              const path = item.storagePath;
                              const url = path ? mediaUrls[path] : null;
                              const isFailed = item.status === 'failed';
                              const isReady = item.status === 'ready' && !!url;
                              const isPending = !isFailed && !isReady;
                              const isPhoto = item.mediaKind === 'photo';
                              const isVideo = item.mediaKind === 'video';
                              return (
                                <Box
                                  key={item.id}
                                  sx={{
                                    width: { xs: 126, sm: 140 },
                                    minWidth: { xs: 126, sm: 140 },
                                    flexShrink: 0,
                                    scrollSnapAlign: 'start',
                                  }}
                                >
                                  <Box
                                    onClick={() => openMediaItemPreview(item)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        openMediaItemPreview(item);
                                      }
                                    }}
                                    aria-label={`Open ${isVideo ? 'video' : isPhoto ? 'photo' : 'media'} in fullscreen`}
                                    sx={{
                                      aspectRatio: '1 / 1',
                                      borderRadius: 2,
                                      overflow: 'hidden',
                                      border: '1px solid #dbe4ee',
                                      position: 'relative',
                                      backgroundColor: '#f8fafc',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {isReady && isPhoto && (
                                      <Box
                                        component="img"
                                        src={url}
                                        alt="Media thumbnail"
                                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                    )}

                                    {isReady && isVideo && (
                                      <>
                                        <video
                                          src={url}
                                          muted
                                          playsInline
                                          preload="metadata"
                                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                        />
                                        <Box
                                          sx={{
                                            position: 'absolute',
                                            inset: 0,
                                            backgroundColor: 'rgba(15, 23, 42, 0.18)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                          }}
                                        >
                                          <PlayCircleFilled sx={{ color: '#ffffff', fontSize: 34 }} />
                                        </Box>
                                      </>
                                    )}

                                    {(isPending || isFailed || (!isPhoto && !isVideo)) && (
                                      <Box
                                        sx={{
                                          position: 'absolute',
                                          inset: 0,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          flexDirection: 'column',
                                          gap: 0.5,
                                          backgroundColor: isFailed ? '#fee2e2' : '#f1f5f9',
                                        }}
                                      >
                                        {isFailed ? (
                                          <ErrorOutline color="error" />
                                        ) : isPending ? (
                                          <CircularProgress size={18} thickness={5} />
                                        ) : isVideo ? (
                                          <Movie color="primary" />
                                        ) : (
                                          <PhotoLibrary color="primary" />
                                        )}
                                        <Typography
                                          variant="caption"
                                          color={isFailed ? 'error' : 'text.secondary'}
                                          sx={{ fontWeight: 600 }}
                                        >
                                          {isFailed ? 'Failed' : isPending ? 'Loading' : 'Media'}
                                        </Typography>
                                      </Box>
                                    )}

                                    <Box sx={{ position: 'absolute', top: 6, left: 6 }}>
                                      {item.status === 'pending_upload' && (
                                        <Chip
                                          size="small"
                                          label="Pending"
                                          color="warning"
                                          icon={<CloudUpload sx={{ fontSize: 14 }} />}
                                        />
                                      )}
                                      {item.status === 'failed' && (
                                        <Chip
                                          size="small"
                                          label="Failed"
                                          color="error"
                                          icon={<ErrorOutline sx={{ fontSize: 14 }} />}
                                        />
                                      )}
                                    </Box>
                                  </Box>
                                  {item.teacherComment && (
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        mt: 0.5,
                                      }}
                                    >
                                      💬 {item.teacherComment}
                                    </Typography>
                                  )}
                                </Box>
                              );
                            })}
                          </Box>
                        </>
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
          {/* Show More Button */}
          {hasMoreObs && !loadingMore && (
            <Box sx={{ textAlign: 'center', pt: 2 }}>
              <Button
                variant="outlined"
                onClick={handleLoadMore}
                startIcon={<ExpandMore />}
                sx={{ textTransform: 'none' }}
              >
                Show 20 More
              </Button>
            </Box>
          )}
          {loadingMore && (
            <Box sx={{ textAlign: 'center', pt: 2 }}>
              <Button
                variant="outlined"
                disabled
                startIcon={<CircularProgress size={16} />}
                sx={{ textTransform: 'none' }}
              >
                Loading...
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
                return <Chip size="small" label="Pending" color="warning" icon={<CloudUpload sx={{ fontSize: 16 }} />} />;
              }
              if (obs.status === 'failed') {
                return <Chip size="small" label="Failed" color="error" icon={<ErrorOutline sx={{ fontSize: 16 }} />} />;
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
                          <InsertDriveFile color="primary" />
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
                {photosVideos.map((obs) => {
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
                        if (isReady) handleMediaClick(obs);
                      }}
                      sx={{
                        cursor: mediaSelectMode ? 'pointer' : (isReady ? 'pointer' : 'default'),
                        '&:hover': isReady ? { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } : undefined,
                        position: 'relative',
                        borderRadius: 2,
                        overflow: 'hidden',
                        backgroundColor: '#f8fafc',
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
                            <Movie color="primary" />
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
                            <ErrorOutline color="error" />
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
                backgroundColor: '#ffffff',
                borderTop: '1px solid #e2e8f0',
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

      {/* Media Preview Dialog */}
      <Dialog
        open={!!mediaPreview}
        onClose={() => setMediaPreview(null)}
        fullScreen={!!mediaPreview?.fullscreen}
        maxWidth={mediaPreview?.fullscreen ? false : 'sm'}
        fullWidth={!mediaPreview?.fullscreen}
      >
        <DialogTitle>
          <Typography variant="h6" component="span">Media</Typography>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {mediaPreview?.observation?.mediaKind === 'photo' && mediaPreview?.url && (
            <Box
              component="img"
              src={mediaPreview.url}
              alt="Media"
              sx={{ width: '100%', borderRadius: 2, maxHeight: 420, objectFit: 'contain' }}
            />
          )}
          {mediaPreview?.observation?.mediaKind === 'video' && mediaPreview?.url && (
            <Box sx={{ width: '100%' }}>
              <video src={mediaPreview.url} controls style={{ width: '100%', borderRadius: 12 }} />
            </Box>
          )}
          {(!mediaPreview?.url) && (
            <Typography variant="body2" color="text.secondary">
              Download URL not ready yet. Please wait for upload to finish.
            </Typography>
          )}
          {mediaEditMode ? (
            <TextField
              label="Teacher comment"
              value={mediaEditComment}
              onChange={(e) => setMediaEditComment(e.target.value)}
              multiline
              minRows={3}
              fullWidth
              disabled={mediaEditSaving}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              {mediaPreview?.observation?.teacherComment
                ? `💬 ${mediaPreview.observation.teacherComment}`
                : 'No comment added.'}
            </Typography>
          )}
          {mediaPreview?.observation && (
            <Typography variant="body2" color="text.secondary">
              Date Captured: {formatTimestamp(mediaPreview.observation.observedAt || mediaPreview.observation.timestamp)}
            </Typography>
          )}
          {previewActionExpired && (
            <Typography variant="body2" sx={{ color: '#92400e', fontStyle: 'italic' }}>
              {AUTHOR_ACTION_EXPIRED_MESSAGE}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setMediaPreview(null)}>Close</Button>
          {mediaPreview?.url && (
            <Button
              variant="outlined"
              onClick={() => {
                window.open(mediaPreview.url, '_blank');
              }}
            >
              Open
            </Button>
          )}
          {previewCanManage && !mediaEditMode && (
            <Button
              variant="outlined"
              disabled={!previewCanEdit}
              onClick={() => {
                if (!previewCanEdit) return;
                setMediaEditMode(true);
                setMediaEditComment(previewObservation?.teacherComment || '');
              }}
            >
              Edit
            </Button>
          )}
          {mediaEditMode && (
            <Button
              variant="contained"
              onClick={handleSaveMediaComment}
              disabled={mediaEditSaving || !previewCanEdit}
              startIcon={mediaEditSaving ? <CircularProgress size={16} /> : null}
            >
              {mediaEditSaving ? 'Saving...' : 'Save'}
            </Button>
          )}
          {mediaEditMode && (
            <Button
              variant="outlined"
              onClick={() => {
                setMediaEditMode(false);
                setMediaEditComment(previewObservation?.teacherComment || '');
              }}
              disabled={mediaEditSaving}
            >
              Cancel Edit
            </Button>
          )}
          {previewCanManage && !mediaEditMode && (
            <Button
              color="error"
              variant="contained"
              startIcon={<Delete />}
              disabled={!previewCanDelete}
              onClick={() => {
                if (!previewCanDelete) return;
                setSelectedObservation(mediaPreview.observation);
                setMediaPreview(null);
                setDeleteConfirmOpen(true);
              }}
            >
              Delete
            </Button>
          )}
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

      {/* Note creation handled by global FAB */}
    </Box>
  );
}

export default StudentTimeline; 
