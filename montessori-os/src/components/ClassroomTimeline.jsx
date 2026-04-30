// ClassroomTimeline.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
  Card,
  CardContent,
  Button,
  ButtonBase,
  IconButton,
  Divider,
  TextField,
  InputAdornment,
  Collapse,
  OutlinedInput,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Checkbox,
  ListItemIcon,
  Alert
} from '@mui/material';
import {
  Group,
  Notes,
  FilterList,
  AccessTime,
  Person,
  ExpandMore,
  Search,
  Close,
  Delete,
  Visibility,
  Description,
  KeyboardArrowDown
} from '@mui/icons-material';
import { collection, collectionGroup, query, where, orderBy, limit, onSnapshot, getDocs, doc, getDoc, deleteDoc, updateDoc, deleteField, startAfter } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import { formatTimestamp, getObservationTypeIcon, getObservationTypeText } from '../utils/observationUtils.jsx';
import {
  planMissingMediaUrlPaths,
  fetchMediaUrlsWithConcurrency,
} from '../utils/mediaUrlBatching';
import { fuzzySearchStudents } from '../utils/fuzzySearch';
import NoteExpansionDialog from './NoteExpansionDialog';
import ReportPreviewDialog from './ReportPreviewDialog';
import FilterPanel from './FilterPanel';
import useObservationFilters from '../hooks/useObservationFilters';
import useNotify from '../notifications/useNotify.js';
import { isAdminRole } from '../utils/roleUtils';
import useSwipeTabs from '../hooks/useSwipeTabs';
import {
  getLessonDimensions,
  LESSON_RATING_LABELS,
  LESSON_RATING_COLORS,
  LESSON_ATTENDANCE_LABELS
} from '../utils/lessonNoteConstraints';
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { paginateTimelineItems, toDate } from './classroomTimelineUtils.js';
import { groupReportsByDate } from '../utils/reportTimelineUtils.js';

const renderLessonSummary = (note, showGroupDefaults = false, showStudentComment = false) => {
  const dimensions = getLessonDimensions(note);
  const groupDefaults = note.groupDefaults || {};
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {note.lessonTitle || 'Lesson Note'}
      </Typography>
      {note.lessonDescription && (
        <Typography variant="body2" color="text.secondary">
          {note.lessonDescription}
        </Typography>
      )}
      {note.groupComment && (
        <Typography variant="body2" color="text.secondary">
          {note.groupComment}
        </Typography>
      )}
      {/* Show group defaults if available - ONLY show these for grouped notes */}
      {showGroupDefaults && Object.keys(groupDefaults).length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            Group Defaults:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {Object.entries(groupDefaults).map(([dimension, rating]) => {
              const color = LESSON_RATING_COLORS[rating] || '#475569'; // hex required — downstream ${color}22 concatenation
              return (
                <Chip
                  key={`group-default-${dimension}`}
                  size="small"
                  label={`${dimension}: ${LESSON_RATING_LABELS[rating] || 'N/A'}`}
                  sx={{ 
                    backgroundColor: `${color}22`, 
                    color,
                    border: '1px dashed',
                    borderColor: color
                  }}
                />
              );
            })}
          </Box>
        </Box>
      ) : (
        /* Individual ratings - only show for non-grouped notes */
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {dimensions.map((dimension) => {
            const rating = dimension.value || 'na';
            const color = LESSON_RATING_COLORS[rating] || '#475569'; // hex required — downstream ${color}22 concatenation
            return (
              <Chip
                key={`${note.id}-${dimension.name}`}
                size="small"
                label={`${dimension.name}: ${LESSON_RATING_LABELS[rating] || 'N/A'}`}
                sx={{ backgroundColor: `${color}22`, color }}
              />
            );
          })}
        </Box>
      )}
      {/* Only show student comment if explicitly requested (for expanded views) */}
      {showStudentComment && note.studentComment && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            💬 {note.studentComment}
          </Typography>
        </Box>
      )}
    </Box>
  );
};


const NOTES_PAGE_SIZE = 20;

function ClassroomTimeline({ classroom, userRole, manageableClassrooms = [], onNavigateToStudent }) {
  const notify = useNotify();
  const [activeTab, setActiveTab] = useState(0); // 0 = Notes, 1 = Students
  const [loading, setLoading] = useState(true);
  const [classroomNotes, setClassroomNotes] = useState([]);
  const [classroomStudents, setClassroomStudents] = useState([]);
  const [classroomTeachers, setClassroomTeachers] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreNotes, setHasMoreNotes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [classroomReports, setClassroomReports] = useState([]);
  const [classroomMediaDocs, setClassroomMediaDocs] = useState([]);
  const [mediaUrls, setMediaUrls] = useState({});
  const mediaUrlsRef = useRef({});
  const mediaUrlInFlightRef = useRef(new Set());
  const [reportPreviewData, setReportPreviewData] = useState(null);
  const [expandedReportGroups, setExpandedReportGroups] = useState(new Set());
  const searchInputRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const [notesReloadToken] = useState(0);
  const batchCursorsRef = useRef(new Map());
  const exhaustedBatchesRef = useRef(new Set());
  const studentIdsRef = useRef([]);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      // Defer focus slightly to ensure visibility
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [showSearch]);

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

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

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

  // All fetched notes + report groups — merged chronologically into time buckets
  const groupedLimitedNotes = useMemo(() => {
    const { grouped, ungrouped } = groupedAndSortedObservations;
    const buckets = paginateTimelineItems(grouped, ungrouped, Infinity);

    // Insert report groups into the correct bucket at the right chronological position
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastWeek = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const group of groupedReports) {
      const reportItem = { ...group, isReportGroup: true };
      const d = group.date;
      let bucket;
      if (d >= todayStart) bucket = buckets.today;
      else if (d >= lastWeek) bucket = buckets.last7Days;
      else bucket = buckets.beyond;

      // Insert at correct chronological position (newest first)
      const idx = bucket.findIndex((item) => {
        const itemDate = item.isGrouped
          ? item.earliestObservedAt
          : item.isReportGroup
            ? item.date
            : toDate(item.observedAt || item.timestamp);
        return d >= itemDate;
      });
      if (idx === -1) bucket.push(reportItem);
      else bucket.splice(idx, 0, reportItem);
    }

    return buckets;
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
              <Description sx={{ fontSize: 18, color: 'secondary.main' }} />
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
                <KeyboardArrowDown sx={{ fontSize: 16, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
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
                      onClick={() => setReportPreviewData(report)}
                      sx={{ fontSize: 18, color: 'text.secondary', cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
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
          onNoteClick={() => {}}
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
        lessonTitleById={lessonTitleById}
        onStudentClick={() => {
          const student = classroomStudents.find(s => s.id === item.studentId);
          if (student) onNavigateToStudent(student);
        }}
        onNoteClick={() => handleNoteClick(item)}
        mediaUrls={mediaUrls}
      />
    );
  };

  // Handle note click to expand
  const handleNoteClick = () => {
    // Note expansion dialog functionality removed
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

      {/* Compact Header: Search icon left, count + Filters right */}
      <Box sx={{ 
        backgroundColor: 'white',
        borderRadius: 1,
        p: 2,
        borderBottom: '1px solid var(--color-border)'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          {/* Expanding pill search */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              width: showSearch ? 360 : 200,
              maxWidth: 420,
              minWidth: 180,
              flex: '1 1 auto',
              transition: 'width 200ms ease',
            }}
          >
            {showSearch ? (
              <OutlinedInput
                inputRef={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setShowSearch(false); }}
                placeholder="Search notes or students"
                size="small"
                startAdornment={(
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                )}
                sx={{
                  height: 36,
                  borderRadius: 999,
                  px: 0.75,
                  py: 0,
                  backgroundColor: 'var(--color-bg)',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderRadius: 999,
                    borderColor: 'var(--color-border)',
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--grey-300)',
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--color-text-faint)',
                  },
                  '& .MuiInputBase-input': {
                    p: 0.5,
                    pl: 0.25,
                  },
                }}
              />
            ) : (
              <ButtonBase
                onClick={() => setShowSearch(true)}
                disableRipple
                aria-label="Open search"
                sx={{
                  width: '100%',
                  height: 36,
                  borderRadius: 999,
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  px: 1.25,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: 0.75,
                  color: 'var(--color-text-soft)',
                  transition: 'background-color 150ms ease, border-color 150ms ease',
                  '&:hover': {
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--grey-300)',
                  },
                }}
              >
                <Search fontSize="small" />
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'inherit' }}>
                  Search
                </Typography>
              </ButtonBase>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              startIcon={<FilterList />}
              onClick={activeTab === 0 ? toggleFilters : undefined}
              variant={hasActiveFilters ? 'contained' : 'outlined'}
              color={hasActiveFilters ? 'primary' : 'default'}
              size="small"
              disabled={activeTab !== 0}
              aria-label={activeTab === 0 ? 'Toggle filters' : 'Filters available only on Notes tab'}
              title={activeTab === 0 ? 'Filters' : 'Filters available only on Notes tab'}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Filters
            </Button>
          </Box>
        </Box>
        {/* Removed separate collapse row; search expands inline as a pill */}
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

      {/* Tabs - Sticky positioned under AppHeader */}
      <Box sx={{ 
        backgroundColor: 'white',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        borderBottom: '1px solid var(--color-border)'
      }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            '& .MuiTab-root': {
              minHeight: 48,
              textTransform: 'none',
              fontWeight: 500
            }
          }}
        >
          <Tab 
            icon={<Notes />} 
            label="Notes" 
            iconPosition="start"
            aria-label="View classroom notes"
          />
          <Tab 
            icon={<Group />} 
            label="Students" 
            iconPosition="start"
            aria-label="View classroom students"
          />
        </Tabs>
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
              backgroundColor: 'white',
              borderRadius: 1,
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

          {/* Notes Timeline */}
          {filteredObservations.length === 0 && groupedReports.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                {searchQuery ? `No students or observations found for "${searchQuery}"` : 'No activity here yet'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Today */}
              {groupedLimitedNotes.today && groupedLimitedNotes.today.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      Today
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {groupedLimitedNotes.today.map((item) => renderTimelineItem(item))}
                </>
              )}

              {/* Last 7 Days */}
              {groupedLimitedNotes.last7Days && groupedLimitedNotes.last7Days.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Last 7 Days
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {groupedLimitedNotes.last7Days.map((item) => renderTimelineItem(item))}
                </>
              )}

              {/* Beyond */}
              {groupedLimitedNotes.beyond && groupedLimitedNotes.beyond.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Beyond 7 Days
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {groupedLimitedNotes.beyond.map((item) => renderTimelineItem(item))}
                </>
              )}

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
              backgroundColor: 'white',
              borderRadius: 1,
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
                  classroomNotes={classroomNotes}
                  onClick={() => handleStudentClick(student)}
                />
              ))}
            </Box>
          )}
          </Box>
        </Box>
      </Box>

      {/* Report preview dialog for classroom timeline report markers */}
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
    </Box>
  );
}

// GroupedNoteCard component for displaying multi-student notes
function GroupedNoteCard({ groupedNote, classroomStudents, onNoteClick, onNavigateToStudent, lessonTitleById }) {
  const note = groupedNote.representativeNote;
  const noteTypeInfo = {
    type: getObservationTypeText(note.type),
    icon: getObservationTypeIcon(note.type)
  };
  const isLesson = note.type === 'lesson';

  // Get student objects for the group
  const studentsInGroup = groupedNote.studentIds
    .map(studentId => classroomStudents.find(s => s.id === studentId))
    .filter(Boolean);

  const getStudentDisplayName = (student) => {
    if (!student) return 'Unknown Student';
    return student.displayName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown Student';
  };

  // Format student names: "Student A, Student B + X more" with clickable names
  const renderStudentNames = () => {
    if (studentsInGroup.length === 0) {
      return <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'primary.main' }}>Multiple students</Typography>;
    }
    
    if (studentsInGroup.length === 1) {
      const student = studentsInGroup[0];
      return (
        <Typography 
          variant="subtitle2" 
          sx={{ 
            fontWeight: 600, 
            color: 'primary.main',
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (onNavigateToStudent && student) {
              onNavigateToStudent(student);
            }
          }}
        >
          {getStudentDisplayName(student)}
        </Typography>
      );
    }

    if (studentsInGroup.length === 2) {
      const [student1, student2] = studentsInGroup;
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Typography 
            variant="subtitle2" 
            component="span"
            sx={{ 
              fontWeight: 600, 
              color: 'primary.main',
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (onNavigateToStudent && student1) {
                onNavigateToStudent(student1);
              }
            }}
          >
            {getStudentDisplayName(student1)}
          </Typography>
          <Typography variant="subtitle2" component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>,</Typography>
          <Typography 
            variant="subtitle2" 
            component="span"
            sx={{ 
              fontWeight: 600, 
              color: 'primary.main',
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (onNavigateToStudent && student2) {
                onNavigateToStudent(student2);
              }
            }}
          >
            {getStudentDisplayName(student2)}
          </Typography>
        </Box>
      );
    }

    // More than 2 students: "Student A, Student B + X more"
    const [student1, student2] = studentsInGroup;
    const remainingCount = studentsInGroup.length - 2;
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
        <Typography 
          variant="subtitle2" 
          component="span"
          sx={{ 
            fontWeight: 600, 
            color: 'primary.main',
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (onNavigateToStudent && student1) {
              onNavigateToStudent(student1);
            }
          }}
        >
          {getStudentDisplayName(student1)}
        </Typography>
        <Typography variant="subtitle2" component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>,</Typography>
        <Typography 
          variant="subtitle2" 
          component="span"
          sx={{ 
            fontWeight: 600, 
            color: 'primary.main',
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (onNavigateToStudent && student2) {
              onNavigateToStudent(student2);
            }
          }}
        >
          {getStudentDisplayName(student2)}
        </Typography>
        <Typography variant="subtitle2" component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>
          {' '}+ {remainingCount} more
        </Typography>
      </Box>
    );
  };

  return (
    <Card
      sx={{
        cursor: 'pointer',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
        transition: 'all 0.2s ease-in-out',
        position: 'relative',
        border: '1px solid var(--color-border)',
        backgroundColor: 'white',
        borderRadius: 2
      }}
      aria-label={`View details for observation from ${formatTimestamp(note.observedAt || note.timestamp)}`}
      onClick={onNoteClick}
    >
      {/* Note Type Indicator - Top Right */}
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
        border: '1px solid var(--color-border)'
      }}>
        {noteTypeInfo.icon}
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
          {noteTypeInfo.type}
        </Typography>
      </Box>

      <CardContent sx={{ p: 2, pl: 3 }}>
        {/* Student Names - Prominent, condensed, clickable */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Group sx={{ fontSize: 16, color: 'primary.main' }} />
          {renderStudentNames()}
        </Box>

        {/* Teacher Information */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
          <span role="img" aria-label="teacher" style={{ fontSize: '16px' }}>
            👩‍🏫
          </span>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {note.createdByName || note.createdBy || 'Unknown Teacher'}
          </Typography>
        </Box>
        
        {isLesson ? (
          renderLessonSummary(note, !!note.groupDefaults)
        ) : (
          <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {note.text || '(transcribing…)'}
          </Typography>
        )}
        {!isLesson && Array.isArray(note.linkedLessonObservationId) && note.linkedLessonObservationId.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Tagged Lesson Notes:
            </Typography>
            {(note.linkedLessonObservationId || []).map((id) => (
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
        
        {/* Timestamp */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {formatTimestamp(note.observedAt || note.timestamp)}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

// GroupedNoteDialog component for displaying multi-student note details
function GroupedNoteDialog({ open, onClose, groupedNote, classroomStudents, userRole, onNavigateToStudent, onNotesChanged }) {
  const notify = useNotify();
  const note = groupedNote.representativeNote;
  const isLesson = note.type === 'lesson';
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const canDeleteGroupedNote = isAdminRole(userRole);

  // Get student objects for all students in the group
  const studentsInGroup = groupedNote.studentIds
    .map(studentId => classroomStudents.find(s => s.id === studentId))
    .filter(Boolean);

  const getStudentDisplayName = (student) => {
    if (!student) return 'Unknown Student';
    return student.displayName || student.name || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown Student';
  };

  // Handle student selection toggle
  const handleToggleStudent = (studentId) => {
    setSelectedStudentIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedStudentIds.size === studentsInGroup.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(groupedNote.studentIds));
    }
  };

  // Handle delete mode toggle
  const handleDeleteModeToggle = () => {
    if (!canDeleteGroupedNote) return;
    if (deleteMode) {
      // Cancel delete mode
      setDeleteMode(false);
      setSelectedStudentIds(new Set());
    } else {
      // Enter delete mode
      setDeleteMode(true);
    }
  };

  // Handle delete confirm click
  const handleDeleteConfirmClick = () => {
    if (!canDeleteGroupedNote) return;
    if (selectedStudentIds.size === 0) {
      notify.warning('Please select at least one student to delete the note for.', { duration: 3000 });
      return;
    }
    setDeleteConfirmOpen(true);
  };

  // Handle delete confirm
  const handleDeleteConfirm = async () => {
    if (!canDeleteGroupedNote) return;
    if (!groupedNote || selectedStudentIds.size === 0) return;
    
    setDeleting(true);
    setDeleteConfirmOpen(false);
    
    const studentIdsToDelete = Array.from(selectedStudentIds);
    const noteId = note.id;
    const { groupId } = groupedNote;
    
    // Create notification for deletion
    const notifId = `delete-grouped-${noteId}`;
    const deleteCount = studentIdsToDelete.length;
    const isAll = deleteCount === studentsInGroup.length;
    
    notify.info(`Deleting note for ${isAll ? 'all' : deleteCount} student${deleteCount > 1 ? 's' : ''}…`, {
      id: notifId,
      actionLabel: 'Undo',
      onFinalize: async () => {
        try {
          // Delete notes for selected students
          const deletePromises = studentIdsToDelete.map(async (studentId) => {
            // Find the note for this student in the group
            const studentNote = groupedNote.notes.find(n => n.studentId === studentId);
            if (studentNote) {
              const parentId = studentNote.parentStudentId || studentId;
              const noteIdToDelete = studentNote.id || noteId;
              await deleteDoc(doc(db, 'students', parentId, 'observations', noteIdToDelete));
            }
          });
          
          await Promise.all(deletePromises);

          // If group shrinks to a single remaining note, drop groupId so it renders as an individual note
          if (!isAll && groupId) {
            try {
              const remainingSnap = await getDocs(
                query(collectionGroup(db, 'observations'), where('groupId', '==', groupId))
              );
              if (remainingSnap.size === 1) {
                const remainingDoc = remainingSnap.docs[0];
                await updateDoc(remainingDoc.ref, { groupId: deleteField() });
              }
            } catch (_err) {
              reportCaughtError(_err, 'ClassroomTimeline', 'swallow-only try/catch at L1466');
            }
          }

          if (typeof onNotesChanged === 'function') {
            onNotesChanged();
          }
          
          notify.success(
            `Note deleted successfully for ${isAll ? 'all' : deleteCount} student${deleteCount > 1 ? 's' : ''}`,
            { id: notifId, duration: 2500 }
          );
          
          // Close dialog if all notes are deleted
          if (isAll) {
            onClose();
          } else {
            // Reset selection and exit delete mode
            setSelectedStudentIds(new Set());
            setDeleteMode(false);
          }
        } catch {
          notify.error('Error deleting note(s). Please try again.', { id: notifId, duration: 3500 });
        }
      },
      onUndo: () => {
        notify.success('Undo Note Deletion Successful', { id: `${notifId}-undo`, duration: 2000 });
      },
      duration: 6000,
      variant: 'warning',
    });
    
    setDeleting(false);
  };

  // Handle delete cancel
  const handleDeleteCancel = () => {
    setDeleteConfirmOpen(false);
  };

  // Reset selection and delete mode when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedStudentIds(new Set());
      setDeleteConfirmOpen(false);
      setDeleteMode(false);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxWidth: 500,
          width: 'calc(100% - 32px)',
          mx: 'auto'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography variant="h6" component="div">
          Note Details
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="Close dialog"
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 3 }}>
        {/* Note Content */}
        <Box sx={{ mb: 3 }}>
          {isLesson ? (
            renderLessonSummary(note, !!note.groupDefaults)
          ) : (
            <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {note.text || '(transcribing…)'}
            </Typography>
          )}
          
          {/* Teacher and Timestamp */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span role="img" aria-label="teacher" style={{ fontSize: '16px' }}>
                👩‍🏫
              </span>
              <Typography variant="body2" color="text.secondary">
                {note.createdByName || note.createdBy || 'Unknown Teacher'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {formatTimestamp(note.observedAt || note.timestamp)}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Students List */}
        <Box>
          {deleteMode ? (
            <>
              {/* Delete Mode: Show checkboxes */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Select students to delete note for:
                </Typography>
                <Button
                  size="small"
                  onClick={handleSelectAll}
                  sx={{ textTransform: 'none', minWidth: 'auto', px: 1 }}
                >
                  {selectedStudentIds.size === studentsInGroup.length ? 'Deselect All' : 'Select All'}
                </Button>
              </Box>
              <List sx={{ p: 0, maxHeight: 300, overflow: 'auto' }}>
                {studentsInGroup.map((student) => {
                  const isSelected = selectedStudentIds.has(student.id);
                  return (
                    <ListItem key={student.id} disablePadding>
                      <ListItemButton
                        onClick={() => handleToggleStudent(student.id)}
                        sx={{
                          borderRadius: 1,
                          '&:hover': {
                            backgroundColor: 'var(--color-bg)'
                          }
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          <Checkbox
                            edge="start"
                            checked={isSelected}
                            tabIndex={-1}
                            disableRipple
                            size="small"
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={getStudentDisplayName(student)}
                          primaryTypographyProps={{
                            fontWeight: 500,
                            color: isSelected ? 'primary.main' : 'text.primary'
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </>
          ) : (
            <>
              {/* Normal Mode: Show student cards with inline dashboard access */}
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Assigned to {studentsInGroup.length} student{studentsInGroup.length !== 1 ? 's' : ''}:
              </Typography>
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                {studentsInGroup.map((student) => {
                  // Find the note for this student
                  const studentNote = groupedNote.notes.find(n => n.studentId === student.id);
                  const studentRatings = studentNote?.ratings || {};
                  const studentComment = studentNote?.studentComment;
                  const dimensionOrder = note.dimensionOrder || Object.keys(studentRatings);
                  const groupDefaults = note.groupDefaults || {};
                  
                  // Check if student has custom ratings (different from defaults)
                  const hasCustomRatings = dimensionOrder.some(dim => {
                    const studentRating = studentRatings[dim];
                    const defaultRating = groupDefaults[dim];
                    return studentRating && studentRating !== defaultRating;
                  });

                  return (
                    <Box
                      key={student.id}
                      sx={{
                        mb: 1.5,
                        p: 2,
                        borderRadius: 2,
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg)'
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Person sx={{ fontSize: 16, color: 'primary.main' }} />
                          <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main' }}>
                            {getStudentDisplayName(student)}
                          </Typography>
                          {hasCustomRatings && (
                            <Chip 
                              label="Custom" 
                              size="small" 
                              sx={{ 
                                height: 20, 
                                fontSize: '0.65rem',
                                backgroundColor: 'var(--color-indigo-bg-light)',
                                color: 'var(--color-primary)'
                              }} 
                            />
                          )}
                        </Box>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<Visibility />}
                          onClick={() => {
                            onNavigateToStudent(student);
                            onClose();
                          }}
                          sx={{ textTransform: 'none' }}
                        >
                          View Dashboard
                        </Button>
                      </Box>

                      {/* Student Ratings */}
                      {dimensionOrder.length > 0 && (
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1, display: 'block' }}>
                            Ratings:
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {dimensionOrder.map((dimension) => {
                              const studentRating = studentRatings[dimension];
                              const defaultRating = groupDefaults[dimension];
                              const isCustom = studentRating && studentRating !== defaultRating;
                              const displayRating = studentRating || defaultRating || 'na';
                              const color = LESSON_RATING_COLORS[displayRating] || '#475569'; // hex required — downstream ${color}22 concatenation
                              
                              return (
                                <Chip
                                  key={`${student.id}-${dimension}`}
                                  size="small"
                                  label={`${dimension}: ${LESSON_RATING_LABELS[displayRating] || 'N/A'}`}
                                  sx={{ 
                                    backgroundColor: `${color}22`, 
                                    color,
                                    ...(isCustom && {
                                      border: '2px solid',
                                      borderColor: color,
                                      fontWeight: 600
                                    })
                                  }}
                                />
                              );
                            })}
                          </Box>
                          {!hasCustomRatings && Object.keys(groupDefaults).length > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontStyle: 'italic' }}>
                              Uses group defaults
                            </Typography>
                          )}
                        </Box>
                      )}
                      
                      {/* Student Comment */}
                      {studentComment && (
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
                            Comment:
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            💬 {studentComment}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
        {deleteMode && canDeleteGroupedNote ? (
          <>
            <Button onClick={handleDeleteModeToggle} variant="outlined" sx={{ flex: 1 }}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteConfirmClick}
              variant="contained"
              color="error"
              startIcon={deleting ? <CircularProgress size={16} /> : <Delete />}
              disabled={deleting || selectedStudentIds.size === 0}
              sx={{ flex: 1 }}
            >
              {deleting 
                ? 'Deleting...' 
                : selectedStudentIds.size === 0
                ? 'Select to Delete'
                : selectedStudentIds.size === studentsInGroup.length
                ? 'Delete for All'
                : `Delete for ${selectedStudentIds.size}`
              }
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} variant="outlined" sx={{ flex: 1 }}>
              Close
            </Button>
            {canDeleteGroupedNote && (
              <Button
                onClick={handleDeleteModeToggle}
                variant="contained"
                color="error"
                startIcon={<Delete />}
                sx={{ flex: 1 }}
              >
                Delete Note
              </Button>
            )}
          </>
        )}
      </DialogActions>

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
            {selectedStudentIds.size === studentsInGroup.length
              ? 'Are you sure you want to delete this note for all students?'
              : `Are you sure you want to delete this note for ${selectedStudentIds.size} selected student${selectedStudentIds.size > 1 ? 's' : ''}?`
            }
          </Typography>
          {selectedStudentIds.size < studentsInGroup.length && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The note will remain for the other {studentsInGroup.length - selectedStudentIds.size} student{studentsInGroup.length - selectedStudentIds.size > 1 ? 's' : ''}.
            </Typography>
          )}
          <Typography variant="body2" color="error" sx={{ fontWeight: 'medium' }}>
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
    </Dialog>
  );
}

// ClassroomNoteCard component for displaying individual notes in the classroom timeline
function ClassroomNoteCard({ note, studentName, lessonTitleById: _lessonTitleById, onStudentClick, onNoteClick, mediaUrls = {} }) {
  const noteTypeInfo = {
    type: getObservationTypeText(note.type),
    icon: getObservationTypeIcon(note.type)
  };
  const isLesson = note.type === 'lesson';

  return (
    <Card
      sx={{
        cursor: 'pointer',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
        transition: 'all 0.2s ease-in-out',
        position: 'relative',
      }}
      aria-label={`View details for observation from ${formatTimestamp(note.observedAt || note.timestamp)}`}
      onClick={onNoteClick}
    >
      {/* Note Type Indicator - Top Right */}
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
        border: '1px solid var(--color-border)'
      }}>
        {noteTypeInfo.icon}
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 500 }}>
          {noteTypeInfo.type}
        </Typography>
      </Box>

      <CardContent sx={{ p: 2 }}>
        {/* Student Name - Prominent */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Person sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography 
            variant="subtitle2" 
            sx={{ 
              fontWeight: 600, 
              color: 'primary.main',
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' }
            }}
            onClick={(e) => {
              e.stopPropagation();
              onStudentClick();
            }}
          >
            {studentName}
          </Typography>
        </Box>

        {/* Teacher Information */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
          <span role="img" aria-label="teacher" style={{ fontSize: '16px' }}>
            👩‍🏫
          </span>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {note.createdByName || note.createdBy || 'Unknown Teacher'}
          </Typography>
        </Box>
        
        {isLesson ? (
          renderLessonSummary(note, !!note.groupDefaults)
        ) : note.type === 'media' ? (
          <Box sx={{ mb: 1 }}>
            {note.text && (
              <Typography variant="body1" sx={{ lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {note.text}
              </Typography>
            )}
            {(note.curriculumArea || note.materialsIdentified?.length > 0) && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                {note.curriculumArea && (
                  <Chip
                    label={note.curriculumArea}
                    size="small"
                    sx={{
                      bgcolor: 'var(--color-green-bg)',
                      color: 'var(--color-secondary-dark)',
                      fontWeight: 600,
                      fontSize: '0.68rem',
                      border: '1px solid var(--color-green-mint)',
                      height: 20,
                    }}
                  />
                )}
                {Array.isArray(note.materialsIdentified) && note.materialsIdentified.map((mat) => (
                  <Chip
                    key={`mat-${mat}`}
                    label={mat}
                    size="small"
                    sx={{
                      bgcolor: 'var(--color-amber-bg)',
                      color: 'var(--color-amber-text)',
                      fontWeight: 600,
                      fontSize: '0.68rem',
                      border: '1px solid var(--color-amber-gold)',
                      height: 20,
                    }}
                  />
                ))}
              </Box>
            )}
            {/* Media thumbnail */}
            {(() => {
              const path = note.media?.[0]?.storagePath;
              const url = path ? mediaUrls[path] : null;
              if (!url) return null;
              return (
                <Box
                  component="img"
                  src={url}
                  alt="Media"
                  sx={{ mt: 1, width: 140, height: 105, objectFit: 'cover', borderRadius: 1.5, display: 'block' }}
                />
              );
            })()}
          </Box>
        ) : (
          <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {note.text || '(transcribing…)'}
          </Typography>
        )}

        {/* Timestamp */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {formatTimestamp(note.observedAt || note.timestamp)}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

// ClassroomStudentCard component for displaying individual students in the classroom
function ClassroomStudentCard({ student, classroomNotes, onClick }) {
  // Count notes for this specific student from the filtered notes
  const studentNoteCount = classroomNotes.filter(note => note.studentId === student.id).length;
  
  // Calculate notes from last 7 days
  const getLast7DaysCount = () => {
    if (!classroomNotes || classroomNotes.length === 0) return 0;
    
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const studentNotes = classroomNotes.filter(note => note.studentId === student.id);
    
    return studentNotes.filter(note => {
      try {
        let noteDate;
        if (note.observedAt?.toDate) {
          noteDate = note.observedAt.toDate();
        } else if (note.observedAt?.seconds) {
          noteDate = new Date(note.observedAt.seconds * 1000);
        } else if (note.observedAt) {
          noteDate = new Date(note.observedAt);
        } else if (note.timestamp?.toDate) {
          noteDate = note.timestamp.toDate();
        } else if (note.timestamp?.seconds) {
          noteDate = new Date(note.timestamp.seconds * 1000);
        } else if (note.timestamp) {
          noteDate = new Date(note.timestamp);
        } else {
          noteDate = new Date(0);
        }
        
        return noteDate >= lastWeek;
      } catch {
        return false;
      }
    }).length;
  };

  // Format note count display with proper grammar
  const formatNoteCounts = (total, last7Days) => {
    const totalText = `${total} note${total !== 1 ? 's' : ''} overall`;
    const last7DaysText = `${last7Days} note${last7Days !== 1 ? 's' : ''} in the last 7 days`;
    
    return `${totalText} | ${last7DaysText}`;
  };
  
  const last7DaysCount = getLast7DaysCount();
  
  return (
    <Card
      sx={{
        cursor: 'pointer',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
        transition: 'all 0.2s ease-in-out',
      }}
      onClick={onClick}
      aria-label={`View timeline for ${student.displayName || student.firstName}`}
    >
      <CardContent sx={{ p: 2 }}>
        {/* Student Name - Prominent */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Person sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography 
            variant="subtitle2" 
            sx={{ 
              fontWeight: 600, 
              color: 'primary.main'
            }}
          >
            {student.displayName || `${student.firstName} ${student.lastName}`}
          </Typography>
        </Box>

        {/* Number of Notes */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Notes sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
            {formatNoteCounts(studentNoteCount, last7DaysCount)}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

export default ClassroomTimeline;
