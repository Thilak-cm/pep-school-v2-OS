// ClassroomTimeline.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Visibility
} from '@mui/icons-material';
import { collection, collectionGroup, query, where, orderBy, limit, onSnapshot, getDocs, doc, getDoc, deleteDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { formatTimestamp, getObservationTypeIcon, getObservationTypeText } from '../utils/observationUtils.jsx';
import { fuzzySearchStudents } from '../utils/fuzzySearch';
import NoteExpansionDialog from './NoteExpansionDialog';
import FilterPanel from './FilterPanel';
import useObservationFilters from '../hooks/useObservationFilters';
import useNotify from '../notifications/useNotify.js';
import { isAdminRole } from '../utils/roleUtils';
import {
  getLessonDimensions,
  LESSON_RATING_LABELS,
  LESSON_RATING_COLORS,
  LESSON_ATTENDANCE_LABELS
} from '../utils/lessonNoteConstraints';

const renderLessonSummary = (note, showGroupDefaults = false) => {
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
              const color = LESSON_RATING_COLORS[rating] || '#475569';
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
            const color = LESSON_RATING_COLORS[rating] || '#475569';
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
      {note.studentComment && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            💬 {note.studentComment}
          </Typography>
        </Box>
      )}
    </Box>
  );
};


function ClassroomTimeline({ classroom, currentUser, userRole, manageableClassrooms = [], onNavigateToStudent }) {
  const [activeTab, setActiveTab] = useState(0); // 0 = Notes, 1 = Students
  const [loading, setLoading] = useState(true);
  const [classroomNotes, setClassroomNotes] = useState([]);
  const [classroomStudents, setClassroomStudents] = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [classroomTeachers, setClassroomTeachers] = useState([]);
  const [showMoreNotes, setShowMoreNotes] = useState(false);
  const [displayedNotesCount, setDisplayedNotesCount] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const [notesReloadToken, setNotesReloadToken] = useState(0);

  const refreshNotes = useCallback(() => {
    setNotesReloadToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      // Defer focus slightly to ensure visibility
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [showSearch]);
  
  // Note expansion states
  const [selectedNote, setSelectedNote] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedGroupedNote, setSelectedGroupedNote] = useState(null);
  const [groupedNoteDialogOpen, setGroupedNoteDialogOpen] = useState(false);
  const isClassroomAdmin = userRole === 'classroomadmin';
  const scopedClassrooms = isClassroomAdmin ? (Array.isArray(manageableClassrooms) ? manageableClassrooms : []) : [];
  const scopedClassroomsKey = scopedClassrooms.join('|');
  const hasClassroomAccess = classroom && (!isClassroomAdmin || scopedClassrooms.includes(classroom.id));


  useEffect(() => {
    if (!classroom || !hasClassroomAccess) {
      setClassroomNotes([]);
      setClassroomStudents([]);
      setClassroomTeachers([]);
      setStudentCount(0);
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
        setStudentCount(students.length);
        return students;
      } catch (err) {
        console.error('Error fetching classroom students:', err);
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
      } catch (err) {
        console.error('Error fetching classroom teachers:', err);
      }
    };

    // Fetch classroom notes by studentId (not classroomId) to include notes from previous classrooms
    const fetchNotes = async (studentIds) => {
      try {
        if (!studentIds || studentIds.length === 0) {
          setClassroomNotes([]);
          setLoading(false);
          return;
        }

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
              limit(50) // Limit to 50 most recent observations per student batch to prevent excessive reads
            )
          );
        }

        // Execute all queries and combine results
        const allSnapshots = await Promise.all(noteQueries.map(q => getDocs(q)));
        const allNotes = [];
        allSnapshots.forEach(snapshot => {
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
          const aDate = a.observedAt?.toDate?.() || a.observedAt?.seconds ? new Date(a.observedAt.seconds * 1000) : new Date(0);
          const bDate = b.observedAt?.toDate?.() || b.observedAt?.seconds ? new Date(b.observedAt.seconds * 1000) : new Date(0);
          return bDate - aDate;
        });

        setClassroomNotes(allNotes);
        setLoading(false);

        // Set up listener for real-time updates
        // Listen to students query changes and re-fetch notes when students change
        const unsubscribe = onSnapshot(studentsQuery, async (snapshot) => {
          const updatedStudentIds = snapshot.docs.map(doc => doc.id);
          
          if (updatedStudentIds.length === 0) {
            setClassroomNotes([]);
            return;
          }

          const updatedNoteQueries = [];
          for (let i = 0; i < updatedStudentIds.length; i += batchSize) {
            const batch = updatedStudentIds.slice(i, i + batchSize);
            updatedNoteQueries.push(
              query(
                collectionGroup(db, 'observations'),
                where('studentId', 'in', batch),
                orderBy('observedAt', 'desc'),
                limit(50) // Limit to 50 most recent observations per student batch
              )
            );
          }

          const updatedSnapshots = await Promise.all(updatedNoteQueries.map(q => getDocs(q)));
          const updatedNotes = [];
          updatedSnapshots.forEach(snapshot => {
            snapshot.docs.forEach(doc => {
              updatedNotes.push({
                id: doc.id,
                parentStudentId: doc.ref.parent?.parent?.id,
                docPath: doc.ref.path,
                ...doc.data()
              });
            });
          });

          updatedNotes.sort((a, b) => {
            const aDate = a.observedAt?.toDate?.() || a.observedAt?.seconds ? new Date(a.observedAt.seconds * 1000) : new Date(0);
            const bDate = b.observedAt?.toDate?.() || b.observedAt?.seconds ? new Date(b.observedAt.seconds * 1000) : new Date(0);
            return bDate - aDate;
          });

          setClassroomNotes(updatedNotes);
        }, (err) => {
          console.error('Error in notes listener:', err);
        });

        return unsubscribe;
      } catch (err) {
        console.error('Error setting up notes listener:', err);
        setLoading(false);
      }
    };

    // Fetch data sequentially: students first, then notes (to avoid duplicate queries)
    (async () => {
      // Clean up any existing listener
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      const students = await fetchStudents();
      const studentIds = students.map(s => s.id);
      unsubscribeRef.current = await fetchNotes(studentIds);
      fetchTeachers(); // Teachers can load in parallel
    })();

    // Cleanup function
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [classroom, hasClassroomAccess, scopedClassroomsKey, notesReloadToken]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleStudentClick = (student) => {
    onNavigateToStudent(student);
  };

  if (!classroom) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">Select a classroom to view its timeline.</Alert>
      </Box>
    );
  }

  if (!hasClassroomAccess) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="warning">You do not have access to this classroom. Please choose one within your allowed classrooms.</Alert>
      </Box>
    );
  }

  // Group notes by time periods
  const groupedNotes = useMemo(() => {
    if (!classroomNotes || classroomNotes.length === 0) {
      return {
        today: [],
        last7Days: [],
        beyond: []
      };
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const groups = {
      today: [],
      last7Days: [],
      beyond: []
    };
    
    classroomNotes.forEach(note => {
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
          noteDate = new Date(0); // fallback
        }
        
        if (noteDate >= today) {
          groups.today.push(note);
        } else if (noteDate >= lastWeek) {
          groups.last7Days.push(note);
        } else {
          groups.beyond.push(note);
        }
      } catch (error) {
        console.error('Error processing note date:', error, note);
        // Put notes with invalid dates in the "beyond" category
        groups.beyond.push(note);
      }
    });
    
    return groups;
  }, [classroomNotes]);

  // Get student name for a note
  const getStudentName = (note) => {
    const student = classroomStudents.find(s => s.id === note.studentId);
    return student?.displayName || student?.firstName || 'Unknown Student';
  };

  // Handle show more notes
  const handleShowMore = () => {
    setDisplayedNotesCount(prev => prev + 10);
    setShowMoreNotes(true);
  };

  // Handle note click to expand
  const handleNoteClick = (note) => {
    setSelectedNote(note);
    setDetailDialogOpen(true);
  };

  // Handle grouped note click
  const handleGroupedNoteClick = (groupedNote) => {
    setSelectedGroupedNote(groupedNote);
    setGroupedNoteDialogOpen(true);
  };

  // Handle close dialog
  const handleCloseDialog = () => {
    setDetailDialogOpen(false);
    setSelectedNote(null);
  };

  // Handle close grouped note dialog
  const handleCloseGroupedDialog = () => {
    setGroupedNoteDialogOpen(false);
    setSelectedGroupedNote(null);
  };

  // Get notes to display (with pagination)
  const notesToDisplay = useMemo(() => {
    const allNotes = [
      ...groupedNotes.today,
      ...groupedNotes.last7Days,
      ...groupedNotes.beyond
    ];
    return allNotes.slice(0, displayedNotesCount);
  }, [groupedNotes, displayedNotesCount]);

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
    if (!searchQuery || !searchQuery.trim()) {
      return classroomNotes;
    }
    
    const matchingStudentIds = filteredStudents.map(student => student.id);
    return classroomNotes.filter(note => 
      matchingStudentIds.includes(note.studentId)
    );
  }, [classroomNotes, filteredStudents, searchQuery]);

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

  // Helper function to convert timestamp to Date
  const toDate = (ts) => {
    if (!ts) return new Date(0);
    if (ts.toDate) return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
  };

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

  // Sorted filtered observations (for backward compatibility, combining grouped and ungrouped)
  const sortedFilteredObservations = useMemo(() => {
    const { grouped, ungrouped } = groupedAndSortedObservations;
    // Flatten grouped notes (using representative) and combine with ungrouped
    const groupedRepresentatives = grouped.map(g => g.representativeNote);
    return [...groupedRepresentatives, ...ungrouped].sort((a, b) => {
      const da = toDate(a.observedAt || a.timestamp);
      const db = toDate(b.observedAt || b.timestamp);
      return db - da;
    });
  }, [groupedAndSortedObservations]);

  // Paginated (first N) notes and grouped for divider rendering
  // Now handles both grouped and ungrouped notes
  const groupedLimitedNotes = useMemo(() => {
    const { grouped, ungrouped } = groupedAndSortedObservations;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const groups = { today: [], last7Days: [], beyond: [] };
    let count = 0;
    const maxCount = displayedNotesCount;

    // Process grouped notes first
    for (const group of grouped) {
      if (count >= maxCount) break;
      const noteDate = group.earliestObservedAt;
      const groupItem = { ...group, isGrouped: true };
      if (noteDate >= today) groups.today.push(groupItem);
      else if (noteDate >= lastWeek) groups.last7Days.push(groupItem);
      else groups.beyond.push(groupItem);
      count++;
    }

    // Process ungrouped notes
    for (const note of ungrouped) {
      if (count >= maxCount) break;
      try {
        const noteDate = toDate(note.observedAt || note.timestamp);
        const noteItem = { ...note, isGrouped: false };
        if (noteDate >= today) groups.today.push(noteItem);
        else if (noteDate >= lastWeek) groups.last7Days.push(noteItem);
        else groups.beyond.push(noteItem);
        count++;
      } catch (e) {
        groups.beyond.push({ ...note, isGrouped: false });
        count++;
      }
    }
    
    return groups;
  }, [groupedAndSortedObservations, displayedNotesCount]);

  const lessonTitleById = useMemo(() => {
    const map = {};
    (classroomNotes || []).forEach((note) => {
      if (note?.type === 'lesson') {
        map[note.id] = note.lessonTitle || 'Lesson note';
      }
    });
    return map;
  }, [classroomNotes]);


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
        borderBottom: '1px solid #e2e8f0'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          {/* Expanding pill search */}
          <Box
            onClick={() => setShowSearch(true)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              width: showSearch ? 320 : 160,
              transition: 'width 200ms ease',
            }}
          >
            <OutlinedInput
              inputRef={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => { if (!searchQuery) setShowSearch(false); }}
              placeholder={'Search'}
              size="small"
              startAdornment={(
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              )}
              sx={{
                height: 36,
                borderRadius: 999,
                px: 0.5,
                py: 0,
                '& .MuiOutlinedInput-notchedOutline': { borderRadius: 999 },
                '& .MuiInputBase-input': {
                  p: 0.5,
                  pl: 0.5,
                },
              }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {activeTab === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                Showing {filteredObservations.length} of {filteredNotes.length} notes
              </Typography>
            )}
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
      />

      {/* Tabs - Sticky positioned under AppHeader */}
      <Box sx={{ 
        backgroundColor: 'white',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        borderBottom: '1px solid #e2e8f0'
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

      {/* Tab Content */}
      {activeTab === 0 && (
        <Box sx={{ 
          backgroundColor: 'white',
          borderRadius: 1,
          p: 2,
          minHeight: '200px'
        }}>
          {/* Notes Count */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {filteredObservations.length} observation{filteredObservations.length !== 1 ? 's' : ''} among {filteredStudents.length} students
            </Typography>
          </Box>

          {/* Notes Timeline */}
          {filteredObservations.length === 0 ? (
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
                  {groupedLimitedNotes.today.map((item) => {
                    if (item.isGrouped) {
                      return (
                        <GroupedNoteCard
                          key={item.groupId}
                          groupedNote={item}
                          classroomStudents={classroomStudents}
                          onNoteClick={() => handleGroupedNoteClick(item)}
                          onNavigateToStudent={onNavigateToStudent}
                        />
                      );
                    } else {
                      return (
                        <ClassroomNoteCard
                          key={item.id}
                          note={item}
                          studentName={getStudentName(item)}
                          onStudentClick={() => {
                            const student = classroomStudents.find(s => s.id === item.studentId);
                            if (student) onNavigateToStudent(student);
                          }}
                          onNoteClick={() => handleNoteClick(item)}
                        />
                      );
                    }
                  })}
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
                  {groupedLimitedNotes.last7Days.map((item) => {
                    if (item.isGrouped) {
                      return (
                        <GroupedNoteCard
                          key={item.groupId}
                          groupedNote={item}
                          classroomStudents={classroomStudents}
                          onNoteClick={() => handleGroupedNoteClick(item)}
                          onNavigateToStudent={onNavigateToStudent}
                        />
                      );
                    } else {
                      return (
                        <ClassroomNoteCard
                          key={item.id}
                          note={item}
                          studentName={getStudentName(item)}
                          onStudentClick={() => {
                            const student = classroomStudents.find(s => s.id === item.studentId);
                            if (student) onNavigateToStudent(student);
                          }}
                          onNoteClick={() => handleNoteClick(item)}
                        />
                      );
                    }
                  })}
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
                  {groupedLimitedNotes.beyond.map((item) => {
                    if (item.isGrouped) {
                      return (
                        <GroupedNoteCard
                          key={item.groupId}
                          groupedNote={item}
                          classroomStudents={classroomStudents}
                          onNoteClick={() => handleGroupedNoteClick(item)}
                          onNavigateToStudent={onNavigateToStudent}
                        />
                      );
                    } else {
                      return (
                        <ClassroomNoteCard
                          key={item.id}
                          note={item}
                          studentName={getStudentName(item)}
                          onStudentClick={() => {
                            const student = classroomStudents.find(s => s.id === item.studentId);
                            if (student) onNavigateToStudent(student);
                          }}
                          onNoteClick={() => handleNoteClick(item)}
                        />
                      );
                    }
                  })}
                </>
              )}

              {/* Show More Button */}
              {sortedFilteredObservations.length > displayedNotesCount && (
                <Box sx={{ textAlign: 'center', pt: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={handleShowMore}
                    startIcon={<ExpandMore />}
                    sx={{ textTransform: 'none' }}
                  >
                    Show 10 More
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}
      
      {activeTab === 1 && (
        <Box sx={{ 
          backgroundColor: 'white',
          borderRadius: 1,
          p: 2,
          minHeight: '200px'
        }}>
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
      )}
      
      {/* Note Expansion Dialog */}
      <NoteExpansionDialog
        open={detailDialogOpen}
        onClose={handleCloseDialog}
        observation={selectedNote}
        student={selectedNote && classroomStudents.length > 0 ? 
          classroomStudents.find(s => s.id === selectedNote.studentId) : null
        }
        currentUser={currentUser}
        userRole={userRole}
        onNavigateToStudent={onNavigateToStudent}
        isClassroomContext={true}
        onNotesChanged={refreshNotes}
      />

      {/* Grouped Note Dialog */}
      {selectedGroupedNote && (
        <GroupedNoteDialog
          open={groupedNoteDialogOpen}
          onClose={handleCloseGroupedDialog}
          groupedNote={selectedGroupedNote}
          classroomStudents={classroomStudents}
          currentUser={currentUser}
          userRole={userRole}
          onNavigateToStudent={onNavigateToStudent}
          onNotesChanged={refreshNotes}
        />
      )}
    </Box>
  );
}

// GroupedNoteCard component for displaying multi-student notes
function GroupedNoteCard({ groupedNote, classroomStudents, onNoteClick, onNavigateToStudent }) {
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
        border: '1px solid #e2e8f0',
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
        border: '1px solid #e2e8f0'
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
function GroupedNoteDialog({ open, onClose, groupedNote, classroomStudents, currentUser, userRole, onNavigateToStudent, onNotesChanged }) {
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
            } catch (err) {
              console.error('Error cleaning up singleton groupId:', err);
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
        } catch (error) {
          console.error('Error deleting observations:', error);
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
                            backgroundColor: '#f8fafc'
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
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc'
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
                                backgroundColor: '#e0e7ff',
                                color: '#4f46e5'
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
                              const color = LESSON_RATING_COLORS[displayRating] || '#475569';
                              
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
function ClassroomNoteCard({ note, studentName, onStudentClick, onNoteClick }) {
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
        border: '1px solid #e2e8f0'
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
      } catch (error) {
        console.error('Error processing note date:', error, note);
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
