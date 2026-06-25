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
} from '@mui/material';
import { Users as Group, StickyNote as Notes, ChevronDown as ExpandMore, Eye as Visibility, FileText as Description } from '../icons';
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
import { HFTabs, DayHeader, HFSearchInput, HFFilterChip } from './ui';
import { trackEvent } from '../utils/analytics';

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
  const [displayLimit, setDisplayLimit] = useState(NOTES_PAGE_SIZE);
  // searchInputRef removed — HFSearchInput is always visible
  const unsubscribeRef = useRef(null);
  const [notesReloadToken] = useState(0);
  const lastDocRef = useRef(null);
  const [transferredStudents, setTransferredStudents] = useState(new Map());
  const notesTabRef = useRef(null);
  const studentsTabRef = useRef(null);
  const [tabHeights, setTabHeights] = useState({ notes: 'auto', students: 'auto' });

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
      setDisplayLimit(NOTES_PAGE_SIZE);
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
        })).filter(s => (s.status || 'active') === 'active');
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

    // Single classroomId query for observations (PEP-333)
    const observationsQuery = query(
      collectionGroup(db, 'observations'),
      where('classroomId', '==', classroom.id),
      orderBy('observedAt', 'desc'),
      limit(NOTES_PAGE_SIZE)
    );

    // Single classroomId query for media (PEP-333)
    const mediaQuery = query(
      collectionGroup(db, 'media'),
      where('classroomId', '==', classroom.id),
      orderBy('observedAt', 'desc'),
      limit(100)
    );

    // Fetch data: students, teachers, observations (with real-time), media, reports
    (async () => {
      try {
        // Clean up any existing listener
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }

        lastDocRef.current = null;
        setDisplayLimit(NOTES_PAGE_SIZE);

        const students = await fetchStudents();
        fetchTeachers(); // Teachers can load in parallel

        // Fetch observations, media, and reports in parallel
        await Promise.all([
          // Observations — initial fetch + real-time listener
          (async () => {
            const snap = await getDocs(observationsQuery);
            const notes = snap.docs.map(d => ({
              id: d.id,
              parentStudentId: d.ref.parent?.parent?.id,
              docPath: d.ref.path,
              ...d.data(),
            }));
            if (snap.docs.length > 0) {
              lastDocRef.current = snap.docs[snap.docs.length - 1];
            }
            setHasMoreNotes(snap.docs.length >= NOTES_PAGE_SIZE);
            setClassroomNotes(notes);

            // Real-time listener on observations for this classroom (PEP-333)
            const unsub = onSnapshot(observationsQuery, (snapshot) => {
              const freshNotes = snapshot.docs.map(d => ({
                id: d.id,
                parentStudentId: d.ref.parent?.parent?.id,
                docPath: d.ref.path,
                ...d.data(),
              }));
              if (snapshot.docs.length > 0) {
                lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
              }
              // Merge fresh first-page notes with previously loaded older notes
              const freshIds = new Set(freshNotes.map(n => n.id));
              setClassroomNotes(prev => {
                const olderNotes = prev.filter(n => !freshIds.has(n.id));
                const merged = [...freshNotes, ...olderNotes];
                merged.sort((a, b) => {
                  const aDate = a.observedAt?.toDate?.() || (a.observedAt?.seconds ? new Date(a.observedAt.seconds * 1000) : new Date(0));
                  const bDate = b.observedAt?.toDate?.() || (b.observedAt?.seconds ? new Date(b.observedAt.seconds * 1000) : new Date(0));
                  return bDate - aDate;
                });
                return merged;
              });
            }, () => { /* listener error ignored */ });
            unsubscribeRef.current = unsub;
          })(),
          // Media — single classroomId query (PEP-333)
          (async () => {
            try {
              const snap = await getDocs(mediaQuery);
              const allMedia = snap.docs.map(d => ({
                id: d.id,
                parentStudentId: d.ref.parent?.parent?.id,
                docPath: d.ref.path,
                ...d.data(),
              }));
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
                      type: 'report',
                      studentId: s.id,
                      studentName: s.displayName || s.firstName || 'Unknown Student',
                      observedAt: data.generatedAt || null,
                      createdBy: data.generatedBy || null,
                      generatedByName: data.generatedByName || null,
                      noteCount: data.noteCount || 0,
                      reportText: data.reportText || '',
                      missingInputFlags: data.missingInputFlags || [],
                      driveDocLink: data.driveDocLink || null,
                      status: data.status || 'ok',
                      reportType: data.reportType || 'term',
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

  // Supplement teacher list with user docs for observation authors not in teacherIds (e.g. former teachers)
  useEffect(() => {
    if (!classroomNotes.length) return;
    const knownIds = new Set(classroomTeachers.map(t => t.id));
    const missingIds = new Set();
    classroomNotes.forEach(n => {
      const tid = n.createdBy || n.teacherId;
      if (tid && !knownIds.has(tid)) missingIds.add(tid);
    });
    if (missingIds.size === 0) return;
    (async () => {
      const extras = (await Promise.all([...missingIds].map(async (tid) => {
        try {
          const snap = await getDoc(doc(db, 'users', tid));
          if (snap.exists()) return { id: tid, ...snap.data() };
        } catch { /* ignore */ }
        return null;
      }))).filter(Boolean);
      if (extras.length > 0) setClassroomTeachers(prev => [...prev, ...extras]);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomNotes]);

  // Detect transferred students — observations from students no longer in this classroom (PEP-333)
  useEffect(() => {
    if (!classroomNotes.length && !classroomMediaDocs.length) return;
    const currentStudentIds = new Set(classroomStudents.map(s => s.id));
    const missingIds = new Set();
    classroomNotes.forEach(n => {
      if (n.studentId && !currentStudentIds.has(n.studentId)) missingIds.add(n.studentId);
    });
    classroomMediaDocs.forEach(n => {
      if (n.studentId && !currentStudentIds.has(n.studentId)) missingIds.add(n.studentId);
    });
    // Remove IDs we already fetched
    transferredStudents.forEach((_, id) => missingIds.delete(id));
    if (missingIds.size === 0) return;
    (async () => {
      const entries = (await Promise.all([...missingIds].map(async (sid) => {
        try {
          const snap = await getDoc(doc(db, 'students', sid));
          if (snap.exists()) return [sid, { id: sid, ...snap.data(), isTransferred: true }];
        } catch { /* ignore */ }
        return null;
      }))).filter(Boolean);
      if (entries.length > 0) {
        setTransferredStudents(prev => {
          const next = new Map(prev);
          entries.forEach(([id, data]) => next.set(id, data));
          return next;
        });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomNotes, classroomMediaDocs, classroomStudents]);

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
    trackEvent('student_card_click', { source: 'classroom_students_tab' });
    onNavigateToStudent(student);
  };

  const handleLoadMore = async () => {
    // If we have more already-fetched notes to reveal, just bump the display limit
    const totalFetched = filteredObservations?.length || 0;
    if (displayLimit < totalFetched) {
      setDisplayLimit(prev => prev + NOTES_PAGE_SIZE);
      return;
    }

    if (!lastDocRef.current || !classroom) return;

    setLoadingMore(true);
    try {
      // Single-cursor pagination — fetch next page after the last doc (PEP-333)
      const moreQuery = query(
        collectionGroup(db, 'observations'),
        where('classroomId', '==', classroom.id),
        orderBy('observedAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(NOTES_PAGE_SIZE)
      );

      const snapshot = await getDocs(moreQuery);
      const newNotes = snapshot.docs.map(d => ({
        id: d.id,
        parentStudentId: d.ref.parent?.parent?.id,
        docPath: d.ref.path,
        ...d.data(),
      }));

      if (snapshot.docs.length > 0) {
        lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
      }
      setHasMoreNotes(snapshot.docs.length >= NOTES_PAGE_SIZE);

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

      setDisplayLimit(prev => prev + NOTES_PAGE_SIZE);
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
    // Merge observation notes, media docs, and reports — deduplicating by id
    const seen = new Set();
    const merged = [...classroomNotes, ...classroomMediaDocs, ...classroomReports].filter(note => {
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
  }, [classroomNotes, classroomMediaDocs, classroomReports, filteredStudents, searchQuery]);

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

  // Slice to display limit — show only `displayLimit` notes at a time
  const displayedObservations = useMemo(() => {
    if (!filteredObservations) return [];
    return filteredObservations.slice(0, displayLimit);
  }, [filteredObservations, displayLimit]);

  // Group notes by groupId, then sort
  const groupedAndSortedObservations = useMemo(() => {
    if (!displayedObservations || displayedObservations.length === 0) {
      return { grouped: [], ungrouped: [] };
    }

    // Group notes by groupId
    const groupMap = new Map();
    const ungrouped = [];

    displayedObservations.forEach((note) => {
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
  }, [displayedObservations]);

  // All fetched notes (including reports) — merged chronologically into day-grouped buckets
  const dayGroups = useMemo(() => {
    const { grouped, ungrouped } = groupedAndSortedObservations;

    // Build a single merged list with isGrouped flags, sorted newest-first for correct within-day ordering
    const merged = [];
    for (const g of grouped) merged.push({ ...g, isGrouped: true });
    for (const n of ungrouped) merged.push({ ...n, isGrouped: false });

    // Sort by date so within-day items are chronologically ordered (newest first)
    merged.sort((a, b) => {
      const aDate = toDate(a.earliestObservedAt || a.observedAt || a.timestamp);
      const bDate = toDate(b.earliestObservedAt || b.observedAt || b.timestamp);
      return bDate - aDate;
    });

    return groupByCalendarDay(merged);
  }, [groupedAndSortedObservations]);

  // Measure tab panel heights so the swipe container matches the active tab
  useEffect(() => {
    const measure = () => {
      const notesH = notesTabRef.current?.scrollHeight || 0;
      const studentsH = studentsTabRef.current?.scrollHeight || 0;
      setTabHeights({ notes: notesH, students: studentsH });
    };
    measure();
    const t = setTimeout(measure, 100);
    return () => clearTimeout(t);
  }, [activeTab, dayGroups, sortedFilteredStudents, displayLimit, loading]);

  const activeTabHeight = activeTab === 0 ? tabHeights.notes : tabHeights.students;

  const lessonTitleById = useMemo(() => {
    const map = {};
    (classroomNotes || []).forEach((note) => {
      if (note?.type === 'lesson') {
        map[note.id] = note.lessonTitle || 'Lesson note';
      }
    });
    return map;
  }, [classroomNotes]);

  // Get student name for a note — checks both current and transferred students
  const getStudentName = (note) => {
    const student = classroomStudents.find(s => s.id === note.studentId);
    if (student) return student.displayName || student.firstName || 'Unknown Student';
    const transferred = transferredStudents.get(note.studentId);
    if (transferred) return transferred.displayName || transferred.firstName || 'Unknown Student';
    return 'Unknown Student';
  };

  // Render a single timeline item (note, grouped note, or report)
  const renderTimelineItem = (item) => {
    if (item.type === 'report') {
      return (
        <Card
          key={`report-${item.studentId}-${item.id}`}
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
                {item.reportType === 'monthly' ? 'Monthly Baseline' : 'Term Report'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5, ml: 3.5 }}>
              <Typography
                variant="body2"
                color="primary"
                onClick={() => {
                  const student = classroomStudents.find(s => s.id === item.studentId);
                  if (student) onNavigateToStudent(student);
                }}
                sx={{ cursor: 'pointer', textDecoration: 'underline' }}
              >
                {item.studentName}
              </Typography>
              <Visibility
                size={18}
                onClick={() => setReportPreviewData(item)}
                style={{ color: 'var(--color-text-soft)', cursor: 'pointer' }}
              />
            </Box>
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
          transferredStudents={transferredStudents}
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
        isTransferred={transferredStudents.has(item.studentId)}
        classroomTeachers={classroomTeachers}
        onStudentClick={() => {
          const student = classroomStudents.find(s => s.id === item.studentId) || transferredStudents.get(item.studentId);
          if (student) {
            trackEvent('student_card_click', { source: 'classroom_timeline' });
            onNavigateToStudent(student);
          }
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
          onChange={(v) => { trackEvent('classroom_tab', { tab: v === 0 ? 'notes' : 'students' }); setActiveTab(v); }}
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
          height: activeTabHeight > 0 ? activeTabHeight : 'auto',
          transition: isDragging ? 'none' : 'height 0.3s ease',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            width: '200%', // Two tabs side by side
            transform: getTransform(),
            transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: isDragging ? 'transform' : 'auto',
            alignItems: 'flex-start',
          }}
        >
          {/* Tab 0: Notes */}
          <Box
            ref={notesTabRef}
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
              {filteredObservations.length} item{filteredObservations.length !== 1 ? 's' : ''} among {filteredStudents.length} students
            </Typography>
          </Box>

          {/* Notes Timeline — day-grouped */}
          {filteredObservations.length === 0 ? (
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
              {(hasMoreNotes || displayLimit < (filteredObservations?.length || 0)) && (
                <Box sx={{ textAlign: 'center', pt: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    startIcon={loadingMore ? <CircularProgress size={16} /> : <ExpandMore />}
                    sx={{ textTransform: 'none' }}
                  >
                    {loadingMore ? 'Loading...' : 'Show More'}
                  </Button>
                </Box>
              )}
            </Box>
          )}
          </Box>
          
          {/* Tab 1: Students */}
          <Box
            ref={studentsTabRef}
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
        reportType={reportPreviewData?.reportType || 'term'}
        missingInputFlags={reportPreviewData?.missingInputFlags || []}
        generatedAt={reportPreviewData?.observedAt || null}
        studentLabel={reportPreviewData?.studentName || 'Student'}
        noteCount={reportPreviewData?.noteCount || null}
        driveDocLink={reportPreviewData?.driveDocLink || null}
      />

      {/* Note expansion bottom sheet (all types) */}
      <NoteBottomSheet
        open={!!selectedNote}
        onClose={() => setSelectedNote(null)}
        observation={selectedNote}
        student={selectedNote ? (classroomStudents.find(s => s.id === selectedNote.studentId) || transferredStudents.get(selectedNote.studentId) || null) : null}
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
        classroomTeachers={classroomTeachers}
        transferredStudents={transferredStudents}
        userRole={userRole}
        onNavigateToStudent={onNavigateToStudent}
      />

    </Box>
  );
}

export default ClassroomTimeline;
