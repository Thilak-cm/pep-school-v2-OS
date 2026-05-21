// ClassroomTimeline.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Chip,
  Card,
  CardContent,
  Button,
  Collapse,
} from '@mui/material';
import { Users as Group, StickyNote as Notes, ChevronDown as ExpandMore, ChevronDown as KeyboardArrowDown, Eye as Visibility, FileText as Description } from '../icons';
import { collection, collectionGroup, query, where, orderBy, limit, onSnapshot, getDocs, doc, getDoc, startAfter } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import {
  planMissingMediaUrlPaths,
  fetchMediaUrlsWithConcurrency,
} from '../utils/mediaUrlBatching';
import { fuzzySearchStudents } from '../utils/fuzzySearch';
import ReportPreviewDialog from './ReportPreviewDialog';
import FilterPanel from './FilterPanel';
import ClassroomNoteCard from './ClassroomNoteCard';
import GroupedNoteCard from './GroupedNoteCard';
import GroupedNoteDialog from './GroupedNoteDialog';
import ClassroomStudentCard from './ClassroomStudentCard';
import NoteBottomSheet from './noteBottomSheet/NoteBottomSheet';
import useObservationFilters from '../hooks/useObservationFilters';
import useNotify from '../notifications/useNotify.js';
import useSwipeTabs from '../hooks/useSwipeTabs';
import useStudentNoteCounts from '../hooks/useStudentNoteCounts';
// lessonNoteConstraints moved into extracted card components
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { toDate, groupByCalendarDay } from './classroomTimelineUtils.js';
import { groupReportsByDate } from '../utils/reportTimelineUtils.js';
import { HFTabs, DayHeader, HFSearchInput, HFFilterChip } from './ui';

const NOTES_PAGE_SIZE = 20;

function ClassroomTimeline({ classroom, currentUser, userRole, manageableClassrooms = [], onNavigateToStudent }) {
  const notify = useNotify();
  const [activeTab, setActiveTab] = useState(0); // 0 = Notes, 1 = Students
  const [selectedNote, setSelectedNote] = useState(null); // for text/voice/lesson expansion
  const [selectedGroupNote, setSelectedGroupNote] = useState(null); // for grouped note expansion
  const [loading, setLoading] = useState(true);
  const [classroomNotes, setClassroomNotes] = useState([]);
  const [classroomStudents, setClassroomStudents] = useState([]);
  const [classroomTeachers, setClassroomTeachers] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreNotes, setHasMoreNotes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [classroomReports, setClassroomReports] = useState([]);
  const [classroomMediaDocs, setClassroomMediaDocs] = useState([]);
  const [mediaUrls, setMediaUrls] = useState({});
  const mediaUrlsRef = useRef({});
  const mediaUrlInFlightRef = useRef(new Set());
  const [reportPreviewData, setReportPreviewData] = useState(null);
  const [expandedReportGroups, setExpandedReportGroups] = useState(new Set());
  // searchInputRef removed — HFSearchInput is always visible
  const unsubscribeRef = useRef(null);
  const [notesReloadToken] = useState(0);
  const batchCursorsRef = useRef(new Map());
  const exhaustedBatchesRef = useRef(new Set());
  const studentIdsRef = useRef([]);

  // showSearch/searchInputRef focus effect removed — HFSearchInput is always visible

  const isClassroomAdmin = userRole === 'classroomadmin';
  const scopedClassrooms = isClassroomAdmin ? (Array.isArray(manageableClassrooms) ? manageableClassrooms : []) : [];
  const scopedClassroomsKey = scopedClassrooms.join('|');
  const hasClassroomAccess = classroom && (!isClassroomAdmin || scopedClassrooms.includes(classroom.id));


  useEffect(() => {
    if (!classroom || !hasClassroomAccess) {
      setClassroomNotes([]);
      setClassroomStudents([]);
      setClassroomTeachers([]);
      setClassroomMediaDocs([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    // Shared students query for both fetching students and notes
    const studentsQuery = query(
      collection(db, 'students'),
      where('classroomId', '==', classroom.id)
    );
    
    // Fetch classroom students
    const fetchStudents = async () => {
      try {
        const studentsSnap = await getDocs(studentsQuery);
        const students = studentsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setClassroomStudents(students);
        return students;
      } catch {
        return [];
      }
    };

    // Fetch classroom teachers
    const fetchTeachers = async () => {
      try {
        if (classroom.teacherIds && classroom.teacherIds.length > 0) {
          const teacherPromises = classroom.teacherIds.map(async (teacherId) => {
            const teacherDoc = await getDoc(doc(db, 'users', teacherId));
            if (teacherDoc.exists()) {
              return { id: teacherId, ...teacherDoc.data() };
            }
            return null;
          });
          
          const teachers = (await Promise.all(teacherPromises)).filter(Boolean);
          setClassroomTeachers(teachers);
        }
      } catch (_err) {
        reportCaughtError(_err, 'ClassroomTimeline', 'swallow-only try/catch at L221');
      }
    };

    // Fetch classroom notes by studentId (not classroomId) to include notes from previous classrooms
    const fetchNotes = async (studentIds) => {
      try {
        if (!studentIds || studentIds.length === 0) {
          setClassroomNotes([]);
          setHasMoreNotes(false);
          return () => {};
        }

        studentIdsRef.current = studentIds;
        batchCursorsRef.current = new Map();
        exhaustedBatchesRef.current = new Set();

        // Query notes for all students in the classroom
        // Firestore 'in' queries support up to 10 items, so we need to batch if more
        const batchSize = 10;
        const noteQueries = [];

        for (let i = 0; i < studentIds.length; i += batchSize) {
          const batch = studentIds.slice(i, i + batchSize);
          noteQueries.push(
            query(
              collectionGroup(db, 'observations'),
              where('studentId', 'in', batch),
              orderBy('observedAt', 'desc'),
              limit(NOTES_PAGE_SIZE)
            )
          );
        }

        // Execute all queries and combine results
        const allSnapshots = await Promise.all(noteQueries.map(q => getDocs(q)));
        const allNotes = [];
        allSnapshots.forEach((snapshot, batchIndex) => {
          // Store cursor for each batch
          if (snapshot.docs.length > 0) {
            batchCursorsRef.current.set(batchIndex, snapshot.docs[snapshot.docs.length - 1]);
          }
          if (snapshot.docs.length < NOTES_PAGE_SIZE) {
            exhaustedBatchesRef.current.add(batchIndex);
          }
          snapshot.docs.forEach(doc => {
            allNotes.push({
              id: doc.id,
              parentStudentId: doc.ref.parent?.parent?.id,
              docPath: doc.ref.path,
              ...doc.data()
            });
          });
        });

        // Sort by observedAt descending (since we combined multiple queries)
        allNotes.sort((a, b) => {
          const aDate = a.observedAt?.toDate?.() || (a.observedAt?.seconds ? new Date(a.observedAt.seconds * 1000) : new Date(0));
          const bDate = b.observedAt?.toDate?.() || (b.observedAt?.seconds ? new Date(b.observedAt.seconds * 1000) : new Date(0));
          return bDate - aDate;
        });

        setClassroomNotes(allNotes);
        // Check if any batch is not exhausted
        const totalBatches = Math.ceil(studentIds.length / batchSize);
        setHasMoreNotes(exhaustedBatchesRef.current.size < totalBatches);

        // Set up listener for real-time updates
        // Listen to students query changes and re-fetch notes when students change
        const unsubscribe = onSnapshot(studentsQuery, async (snapshot) => {
          const updatedStudentIds = snapshot.docs.map(doc => doc.id);

          if (updatedStudentIds.length === 0) {
            setClassroomNotes([]);
            setHasMoreNotes(false);
            return;
          }

          // Update student IDs but preserve pagination state for older notes
          studentIdsRef.current = updatedStudentIds;

          const updatedNoteQueries = [];
          for (let i = 0; i < updatedStudentIds.length; i += batchSize) {
            const batch = updatedStudentIds.slice(i, i + batchSize);
            updatedNoteQueries.push(
              query(
                collectionGroup(db, 'observations'),
                where('studentId', 'in', batch),
                orderBy('observedAt', 'desc'),
                limit(NOTES_PAGE_SIZE)
              )
            );
          }

          const updatedSnapshots = await Promise.all(updatedNoteQueries.map(q => getDocs(q)));
          // Reset pagination state for the new student list
          batchCursorsRef.current = new Map();
          exhaustedBatchesRef.current = new Set();
          const freshNotes = [];
          updatedSnapshots.forEach((snapshot, batchIndex) => {
            if (snapshot.docs.length > 0) {
              batchCursorsRef.current.set(batchIndex, snapshot.docs[snapshot.docs.length - 1]);
            }
            if (snapshot.docs.length < NOTES_PAGE_SIZE) {
              exhaustedBatchesRef.current.add(batchIndex);
            }
            snapshot.docs.forEach(doc => {
              freshNotes.push({
                id: doc.id,
                parentStudentId: doc.ref.parent?.parent?.id,
                docPath: doc.ref.path,
                ...doc.data()
              });
            });
          });

          // Merge fresh first-page notes with previously loaded older notes
          // Fresh notes take priority (they have real-time updates)
          const freshIds = new Set(freshNotes.map(n => n.id));
          const updatedStudentIdSet = new Set(updatedStudentIds);
          setClassroomNotes(prev => {
            const olderNotes = prev.filter(n => !freshIds.has(n.id) && updatedStudentIdSet.has(n.studentId));
            const merged = [...freshNotes, ...olderNotes];
            merged.sort((a, b) => {
              const aDate = a.observedAt?.toDate?.() || (a.observedAt?.seconds ? new Date(a.observedAt.seconds * 1000) : new Date(0));
              const bDate = b.observedAt?.toDate?.() || (b.observedAt?.seconds ? new Date(b.observedAt.seconds * 1000) : new Date(0));
              return bDate - aDate;
            });
            return merged;
          });
          const updatedTotalBatches = Math.ceil(updatedStudentIds.length / batchSize);
          setHasMoreNotes(exhaustedBatchesRef.current.size < updatedTotalBatches);
        }, () => {
          /* ignored */
        });

        return unsubscribe;
      } catch {
        // error handled by caller
      }
    };

    // Fetch data sequentially: students first, then notes (to avoid duplicate queries)
    (async () => {
      try {
        // Clean up any existing listener
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }

        const students = await fetchStudents();
        const studentIds = students.map(s => s.id);
        fetchTeachers(); // Teachers can load in parallel

        // Fetch notes, media docs, and reports in parallel, then mark loading done
        const batchSize = 10;
        const [notesUnsub] = await Promise.all([
          fetchNotes(studentIds),
          // Fetch media docs for all students in classroom
          (async () => {
            try {
              const mediaQueries = [];
              for (let i = 0; i < studentIds.length; i += batchSize) {
                const batch = studentIds.slice(i, i + batchSize);
                mediaQueries.push(
                  query(
                    collectionGroup(db, 'media'),
                    where('studentId', 'in', batch),
                    orderBy('observedAt', 'desc'),
                    limit(100)
                  )
                );
              }
              const mediaSnapshots = await Promise.all(mediaQueries.map(q => getDocs(q)));
              const allMedia = [];
              mediaSnapshots.forEach((snap) => {
                snap.docs.forEach((d) => {
                  allMedia.push({
                    id: d.id,
                    parentStudentId: d.ref.parent?.parent?.id,
                    docPath: d.ref.path,
                    ...d.data(),
                  });
                });
              });
              setClassroomMediaDocs(allMedia);
            } catch {
              setClassroomMediaDocs([]);
            }
          })(),
          // Fetch reports for all students in classroom
          Promise.all(
            students.map(async (s) => {
              try {
                const snap = await getDocs(collection(db, 'students', s.id, 'ai_summaries'));
                return snap.docs
                  .filter((d) => /^report_\d/.test(d.id))
                  .map((d) => {
                    const data = d.data();
                    return {
                      id: d.id,
                      studentId: s.id,
                      studentName: s.displayName || s.firstName || 'Unknown Student',
                      generatedAt: data.generatedAt || null,
                      generatedByName: data.generatedByName || null,
                      noteCount: data.noteCount || 0,
                      reportText: data.reportText || '',
                      missingInputFlags: data.missingInputFlags || [],
                      driveDocLink: data.driveDocLink || null,
                      status: data.status || 'ok',
                    };
                  })
                  .filter((r) => r.status === 'ok');
              } catch {
                return [];
              }
            })
          ).then((results) => {
            setClassroomReports(results.flat());
          }),
        ]);
        unsubscribeRef.current = notesUnsub;
      } catch (err) {
        reportCaughtError(err, 'ClassroomTimeline', 'data fetch IIFE');
      } finally {
        setLoading(false);
      }
    })();

    // Cleanup function
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [classroom, hasClassroomAccess, scopedClassroomsKey, notesReloadToken]);

  // Fetch media URLs for classroom media docs (PEP-33)
  useEffect(() => {
    const readyPaths = [];
    classroomMediaDocs.forEach((doc) => {
      if (doc.status !== 'ready' || !Array.isArray(doc.media)) return;
      doc.media.forEach((entry) => {
        const path = entry?.storagePath;
        if (path) readyPaths.push(path);
      });
    });
    const missing = planMissingMediaUrlPaths(readyPaths, {
      mediaUrls: mediaUrlsRef.current,
      inFlightPaths: mediaUrlInFlightRef.current,
    });
    if (missing.length === 0) return;
    missing.forEach((p) => mediaUrlInFlightRef.current.add(p));
    fetchMediaUrlsWithConcurrency(
      missing,
      async (path) => getDownloadURL(ref(storage, path)),
      {
        concurrency: 6,
        onSuccess: ({ path, url }) => {
          setMediaUrls((prev) => {
            if (prev[path] === url) return prev;
            const next = { ...prev, [path]: url };
            mediaUrlsRef.current = next;
            return next;
          });
        },
        onError: ({ path }) => {
          mediaUrlInFlightRef.current.delete(path);
        },
      },
    );
  }, [classroomMediaDocs]);

  const handleStudentClick = (student) => {
    onNavigateToStudent(student);
  };

  const handleLoadMore = async () => {
    const batchSize = 10;
    const studentIds = studentIdsRef.current;
    if (!studentIds || studentIds.length === 0) return;

    setLoadingMore(true);
    try {
      const moreQueries = [];
      const batchIndices = [];

      for (let i = 0; i < studentIds.length; i += batchSize) {
        const batchIndex = i / batchSize;
        if (exhaustedBatchesRef.current.has(batchIndex)) continue;
        const cursor = batchCursorsRef.current.get(batchIndex);
        if (!cursor) continue;

        const batch = studentIds.slice(i, i + batchSize);
        moreQueries.push(
          query(
            collectionGroup(db, 'observations'),
            where('studentId', 'in', batch),
            orderBy('observedAt', 'desc'),
            startAfter(cursor),
            limit(NOTES_PAGE_SIZE)
          )
        );
        batchIndices.push(batchIndex);
      }

      if (moreQueries.length === 0) {
        setHasMoreNotes(false);
        setLoadingMore(false);
        return;
      }

      const snapshots = await Promise.all(moreQueries.map(q => getDocs(q)));
      const newNotes = [];
      snapshots.forEach((snapshot, idx) => {
        const batchIndex = batchIndices[idx];
        if (snapshot.docs.length > 0) {
          batchCursorsRef.current.set(batchIndex, snapshot.docs[snapshot.docs.length - 1]);
        }
        if (snapshot.docs.length < NOTES_PAGE_SIZE) {
          exhaustedBatchesRef.current.add(batchIndex);
        }
        snapshot.docs.forEach(doc => {
          newNotes.push({
            id: doc.id,
            parentStudentId: doc.ref.parent?.parent?.id,
            docPath: doc.ref.path,
            ...doc.data()
          });
        });
      });

      if (newNotes.length > 0) {
        setClassroomNotes(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const deduped = newNotes.filter(n => !existingIds.has(n.id));
          const combined = [...prev, ...deduped];
          combined.sort((a, b) => {
            const aDate = a.observedAt?.toDate?.() || (a.observedAt?.seconds ? new Date(a.observedAt.seconds * 1000) : new Date(0));
            const bDate = b.observedAt?.toDate?.() || (b.observedAt?.seconds ? new Date(b.observedAt.seconds * 1000) : new Date(0));
            return bDate - aDate;
          });
          return combined;
        });
      }

      const totalBatches = Math.ceil(studentIds.length / batchSize);
      setHasMoreNotes(exhaustedBatchesRef.current.size < totalBatches);
    } catch {
      notify.error('Failed to load more notes. Please try again.', { duration: 3000 });
    } finally {
      setLoadingMore(false);
    }
  };

  // Swipe navigation between tabs
  const { bind: swipeBind, dx, isDragging } = useSwipeTabs({
    onSwipeLeft: () => {
      // Swipe left = next tab (if not on last tab)
      if (activeTab < 1) {
        setActiveTab(activeTab + 1);
      }
    },
    onSwipeRight: () => {
      // Swipe right = previous tab (if not on first tab)
      if (activeTab > 0) {
        setActiveTab(activeTab - 1);
      }
    },
  });

  // Calculate container width for swipe feedback
  const containerWidthRef = useRef(null);
  const containerWidth = containerWidthRef.current?.offsetWidth || 0;

  // Calculate transform based on active tab and swipe delta
  const getTransform = () => {
    if (!isDragging || !containerWidth) {
      return `translateX(-${activeTab * 50}%)`;
    }
    // During swipe, offset by dx relative to current tab position
    // Each tab is 50% of the container (since we have 2 tabs = 200% total width)
    const baseOffset = -activeTab * 50; // percentage
    const dxPercent = (dx / containerWidth) * 100;
    return `translateX(${baseOffset + dxPercent}%)`;
  };

  // Filter students based on search query
  const filteredStudents = useMemo(() => {
    return fuzzySearchStudents(classroomStudents, searchQuery);
  }, [classroomStudents, searchQuery]);

  // Alphabetically sort filtered students by display name for the Students tab
  const sortedFilteredStudents = useMemo(() => {
    const getName = (s) => (
      s?.name || s?.displayName || [s?.firstName, s?.lastName].filter(Boolean).join(' ') || ''
    ).trim();
    return [...filteredStudents].sort((a, b) => getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' }));
  }, [filteredStudents]);

  // Batch-fetch note counts for all students (coordinated at parent level)
  const allStudentIds = useMemo(() => classroomStudents.map(s => s.id), [classroomStudents]);
  const { counts: studentNoteCounts, loading: noteCountsLoading } = useStudentNoteCounts(allStudentIds);

  // Filter notes based on search query (only show notes from students whose names match)
  const filteredNotes = useMemo(() => {
    // Merge observation notes with media docs, deduplicating by id
    const seen = new Set();
    const merged = [...classroomNotes, ...classroomMediaDocs].filter(note => {
      if (seen.has(note.id)) return false;
      seen.add(note.id);
      return true;
    });
    merged.sort((a, b) => {
      const aDate = a.observedAt?.toDate?.() || (a.observedAt?.seconds ? new Date(a.observedAt.seconds * 1000) : new Date(0));
      const bDate = b.observedAt?.toDate?.() || (b.observedAt?.seconds ? new Date(b.observedAt.seconds * 1000) : new Date(0));
      return bDate - aDate;
    });

    if (!searchQuery || !searchQuery.trim()) {
      return merged;
    }

    const matchingStudentIds = filteredStudents.map(student => student.id);
    return merged.filter(note =>
      matchingStudentIds.includes(note.studentId)
    );
  }, [classroomNotes, classroomMediaDocs, filteredStudents, searchQuery]);

  // Group filtered notes by time periods
  // Apply advanced filters (date, creator, type) on top of search-filtered notes
  const {
    showFilters,
    filters,
    filteredObservations,
    hasActiveFilters,
    handleFilterChange,
    handleClearFilters,
    toggleFilters
  } = useObservationFilters(filteredNotes);

  // Derive unique curriculum areas for FilterPanel (PEP-33)
  const availableCurriculumAreas = useMemo(() => {
    const areas = new Set();
    classroomMediaDocs.forEach(note => {
      const area = note.curriculumArea;
      if (area) areas.add(area);
    });
    return [...areas].sort();
  }, [classroomMediaDocs]);

  // Group notes by groupId, then sort
  const groupedAndSortedObservations = useMemo(() => {
    if (!filteredObservations || filteredObservations.length === 0) {
      return { grouped: [], ungrouped: [] };
    }

    // Group notes by groupId
    const groupMap = new Map();
    const ungrouped = [];

    filteredObservations.forEach((note) => {
      if (note.groupId) {
        if (!groupMap.has(note.groupId)) {
          groupMap.set(note.groupId, []);
        }
        groupMap.get(note.groupId).push(note);
      } else {
        ungrouped.push(note);
      }
    });

    // Convert groups to array format, using first note as representative
    const grouped = Array.from(groupMap.entries()).map(([groupId, notes]) => {
      // Sort notes within group by observedAt (newest first)
      notes.sort((a, b) => {
        const da = toDate(a.observedAt || a.timestamp);
        const db = toDate(b.observedAt || b.timestamp);
        return db - da;
      });
      
      // Use earliest observedAt for time categorization
      const earliestDate = notes.reduce((earliest, note) => {
        const noteDate = toDate(note.observedAt || note.timestamp);
        return noteDate < earliest ? noteDate : earliest;
      }, toDate(notes[0].observedAt || notes[0].timestamp));

      return {
        groupId,
        notes,
        representativeNote: notes[0], // Use first note for display
        earliestObservedAt: earliestDate,
        studentIds: notes.map(n => n.studentId),
        studentCount: notes.length
      };
    });

    // Move any singleton "groups" back into ungrouped so they display as regular notes
    const filteredGrouped = [];
    grouped.forEach((group) => {
      if (group.notes.length <= 1) {
        ungrouped.push(group.notes[0]);
      } else {
        filteredGrouped.push(group);
      }
    });

    // Sort grouped notes by earliest observedAt (newest first)
    filteredGrouped.sort((a, b) => b.earliestObservedAt - a.earliestObservedAt);

    // Sort ungrouped notes
    ungrouped.sort((a, b) => {
      const da = toDate(a.observedAt || a.timestamp);
      const db = toDate(b.observedAt || b.timestamp);
      return db - da;
    });

    return { grouped: filteredGrouped, ungrouped };
  }, [filteredObservations]);

  const groupedReports = useMemo(() => groupReportsByDate(classroomReports), [classroomReports]);

  // All fetched notes + report groups — merged chronologically into day-grouped buckets
  const dayGroups = useMemo(() => {
    const { grouped, ungrouped } = groupedAndSortedObservations;

    // Build a single merged list with isGrouped flags, sorted newest-first for correct within-day ordering
    const merged = [];
    for (const g of grouped) merged.push({ ...g, isGrouped: true });
    for (const n of ungrouped) merged.push({ ...n, isGrouped: false });
    // Add report groups
    for (const rg of groupedReports) merged.push({ ...rg, isReportGroup: true });

    // Sort by date so within-day items are chronologically ordered (newest first)
    merged.sort((a, b) => {
      const aDate = a.isReportGroup ? a.date : toDate(a.earliestObservedAt || a.observedAt || a.timestamp);
      const bDate = b.isReportGroup ? b.date : toDate(b.earliestObservedAt || b.observedAt || b.timestamp);
      return bDate - aDate;
    });

    return groupByCalendarDay(merged);
  }, [groupedAndSortedObservations, groupedReports]);

  const toggleReportGroup = (groupKey) => {
    setExpandedReportGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const lessonTitleById = useMemo(() => {
    const map = {};
    (classroomNotes || []).forEach((note) => {
      if (note?.type === 'lesson') {
        map[note.id] = note.lessonTitle || 'Lesson note';
      }
    });
    return map;
  }, [classroomNotes]);

  // Get student name for a note
  const getStudentName = (note) => {
    const student = classroomStudents.find(s => s.id === note.studentId);
    return student?.displayName || student?.firstName || 'Unknown Student';
  };

  // Render a single timeline item (note, grouped note, or report group)
  const renderTimelineItem = (item) => {
    if (item.isReportGroup) {
      const group = item;
      const isExpanded = expandedReportGroups.has(group.key);
      return (
        <Card
          key={`report-group-${group.key}`}
          sx={{
            borderLeft: '3px solid',
            borderLeftColor: 'secondary.main',
            backgroundColor: 'rgba(76, 175, 80, 0.04)',
            borderRadius: 2,
          }}
        >
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Description size={18} style={{ color: 'var(--color-secondary)' }} />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {group.reports.length} report{group.reports.length !== 1 ? 's' : ''} generated
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ml: 3.5, mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {group.dateLabel}
              </Typography>
              <Typography
                variant="caption"
                color="primary"
                onClick={() => toggleReportGroup(group.key)}
                sx={{ cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.25 }}
              >
                {isExpanded ? 'Hide' : 'See'} students
                <KeyboardArrowDown size={16} style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
              </Typography>
            </Box>
            <Collapse in={isExpanded}>
              <Box sx={{ ml: 3.5, mt: 0.75, display: 'flex', flexDirection: 'column' }}>
                {group.reports.map((report) => (
                  <Box
                    key={`${report.studentId}-${report.id}`}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 0.5,
                      px: 1,
                      borderRadius: 1,
                    }}
                  >
                    <Typography
                      variant="body2"
                      color="primary"
                      onClick={() => {
                        const student = classroomStudents.find(s => s.id === report.studentId);
                        if (student) onNavigateToStudent(student);
                      }}
                      sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      {report.studentName}
                    </Typography>
                    <Visibility
                      size={18}
                      onClick={() => setReportPreviewData(report)}
                      style={{ color: 'var(--color-text-soft)', cursor: 'pointer' }}
                    />
                  </Box>
                ))}
              </Box>
            </Collapse>
          </CardContent>
        </Card>
      );
    }
    if (item.isGrouped) {
      return (
        <GroupedNoteCard
          key={item.groupId}
          groupedNote={item}
          classroomStudents={classroomStudents}
          classroomTeachers={classroomTeachers}
          onNoteClick={() => setSelectedGroupNote(item)}
          onNavigateToStudent={onNavigateToStudent}
          lessonTitleById={lessonTitleById}
        />
      );
    }
    return (
      <ClassroomNoteCard
        key={item.id}
        note={item}
        studentName={getStudentName(item)}
        classroomTeachers={classroomTeachers}
        onStudentClick={() => {
          const student = classroomStudents.find(s => s.id === item.studentId);
          if (student) onNavigateToStudent(student);
        }}
        onNoteClick={() => handleNoteClick(item)}
        mediaUrls={mediaUrls}
      />
    );
  };

  const handleNoteClick = (note) => {
    setSelectedNote(note);
  };

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '200px'
      }}>
        <CircularProgress size={32} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Coach Pepper is opening this classroom...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 1
    }}>

      {/* Search + Filters row */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1.5,
        borderBottom: '1px solid var(--color-border)',
      }}>
        <HFSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search notes or students"
          sx={{ flex: 1 }}
        />
        <HFFilterChip
          active={hasActiveFilters}
          onClick={activeTab === 0 ? toggleFilters : undefined}
          count={hasActiveFilters ? filters.types.length + filters.creators.length + (filters.dateFrom ? 1 : 0) + (filters.dateTo ? 1 : 0) + filters.curriculumAreas.length : undefined}
        />
      </Box>

      {/* Filter Panel - visible only on Notes tab */}
      <FilterPanel
        showFilters={showFilters && activeTab === 0}
        filters={filters}
        classroomTeachers={classroomTeachers}
        hasActiveFilters={hasActiveFilters}
        filteredCount={filteredObservations.length}
        /* Intentionally omit totalCount here to avoid duplicate count inside panel */
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        onToggleFilters={toggleFilters}
        availableCurriculumAreas={availableCurriculumAreas}
      />

      {/* Tabs — sticky */}
      <Box sx={{
        backgroundColor: 'white',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        borderBottom: '1px solid var(--color-border)',
      }}>
        <HFTabs
          tabs={[
            { label: 'Notes', icon: <Notes size={16} />, value: 0 },
            { label: 'Students', icon: <Group size={16} />, value: 1 },
          ]}
          value={activeTab}
          onChange={(v) => setActiveTab(v)}
          variant="fullWidth"
        />
      </Box>

      {/* Tab Content - Wrapped for swipe navigation */}
      <Box 
        {...swipeBind}
        ref={(el) => {
          containerWidthRef.current = el;
          if (swipeBind.ref) {
            if (typeof swipeBind.ref === 'function') {
              swipeBind.ref(el);
            } else {
              swipeBind.ref.current = el;
            }
          }
        }}
        sx={{ 
          touchAction: 'pan-x pan-y', // Allow both horizontal and vertical panning
          overflow: 'hidden', // Hide tabs that are off-screen
          position: 'relative',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            width: '200%', // Two tabs side by side
            transform: getTransform(),
            transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: isDragging ? 'transform' : 'auto',
          }}
        >
          {/* Tab 0: Notes */}
          <Box 
            sx={{
              width: '50%',
              flexShrink: 0,
              p: 2,
              minHeight: '200px'
            }}
          >
          {/* Notes Count */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {filteredObservations.length} observation{filteredObservations.length !== 1 ? 's' : ''} among {filteredStudents.length} students
            </Typography>
          </Box>

          {/* Notes Timeline — day-grouped */}
          {filteredObservations.length === 0 && groupedReports.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                {searchQuery ? `No students or observations found for "${searchQuery}"` : 'No activity here yet'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dayGroups.map((day) => (
                <React.Fragment key={day.dateKey}>
                  <DayHeader label={day.label} accent={day.label === 'Today'} />
                  {day.items.map((item) => renderTimelineItem(item))}
                </React.Fragment>
              ))}

              {/* Show More Button */}
              {hasMoreNotes && (
                <Box sx={{ textAlign: 'center', pt: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    startIcon={loadingMore ? <CircularProgress size={16} /> : <ExpandMore />}
                    sx={{ textTransform: 'none' }}
                  >
                    {loadingMore ? 'Loading...' : 'Show 20 More'}
                  </Button>
                </Box>
              )}
            </Box>
          )}
          </Box>
          
          {/* Tab 1: Students */}
          <Box 
            sx={{
              width: '50%',
              flexShrink: 0,
              p: 2,
              minHeight: '200px'
            }}
          >
          {/* Students Count */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {sortedFilteredStudents.length} students in {classroom.name}
            </Typography>
          </Box>

          {/* Students List */}
          {sortedFilteredStudents.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                {searchQuery ? `No students found matching "${searchQuery}"` : 'No students found in this classroom'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {sortedFilteredStudents.map((student) => (
                <ClassroomStudentCard
                  key={student.id}
                  student={student}
                  totalNotes={studentNoteCounts.get(student.id)?.totalNotes}
                  notesLast7Days={studentNoteCounts.get(student.id)?.notesLast7Days}
                  loading={noteCountsLoading}
                  onClick={() => handleStudentClick(student)}
                />
              ))}
            </Box>
          )}
          </Box>
        </Box>
      </Box>

      {/* Report preview dialog */}
      <ReportPreviewDialog
        open={!!reportPreviewData}
        onClose={() => setReportPreviewData(null)}
        reportText={reportPreviewData?.reportText || ''}
        missingInputFlags={reportPreviewData?.missingInputFlags || []}
        generatedAt={reportPreviewData?.generatedAt || null}
        studentLabel={reportPreviewData?.studentName || 'Student'}
        noteCount={reportPreviewData?.noteCount || null}
        driveDocLink={reportPreviewData?.driveDocLink || null}
      />

      {/* Note expansion bottom sheet (all types) */}
      <NoteBottomSheet
        open={!!selectedNote}
        onClose={() => setSelectedNote(null)}
        observation={selectedNote}
        student={selectedNote ? classroomStudents.find(s => s.id === selectedNote.studentId) : null}
        currentUser={currentUser}
        userRole={userRole}
        isClassroomContext={true}
        onNavigateToStudent={onNavigateToStudent}
        classroomTeachers={classroomTeachers}
        mediaUrl={selectedNote?.type === 'media' ? mediaUrls[selectedNote.media?.[0]?.storagePath ?? selectedNote.mediaItems?.[0]?.storagePath] : undefined}
      />

      {/* Grouped note expansion dialog */}
      <GroupedNoteDialog
        open={!!selectedGroupNote}
        onClose={() => setSelectedGroupNote(null)}
        groupedNote={selectedGroupNote}
        classroomStudents={classroomStudents}
        userRole={userRole}
        onNavigateToStudent={onNavigateToStudent}
      />

    </Box>
  );
}

export default ClassroomTimeline;
