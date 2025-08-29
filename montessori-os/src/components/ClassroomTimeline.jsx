// ClassroomTimeline.jsx
import React, { useState, useEffect, useMemo } from 'react';
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
  InputAdornment
} from '@mui/material';
import { 
  Group,
  Notes,
  FilterList,
  Mic,
  EditNote,
  AccessTime,
  Person,
  ExpandMore,
  Search
} from '@mui/icons-material';
import { collection, collectionGroup, query, where, orderBy, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { formatTimestamp } from '../utils/observationUtils.jsx';
import CopyToClipboardButton from './CopyToClipboardButton';
import { fuzzySearchStudents } from '../utils/fuzzySearch';
import NoteExpansionDialog from './NoteExpansionDialog';


function ClassroomTimeline({ classroom, currentUser, userRole, onNavigateToStudent }) {
  const [activeTab, setActiveTab] = useState(0); // 0 = Notes, 1 = Students
  const [loading, setLoading] = useState(true);
  const [classroomNotes, setClassroomNotes] = useState([]);
  const [classroomStudents, setClassroomStudents] = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [classroomTeachers, setClassroomTeachers] = useState([]);
  const [showMoreNotes, setShowMoreNotes] = useState(false);
  const [displayedNotesCount, setDisplayedNotesCount] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Note expansion states
  const [selectedNote, setSelectedNote] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);


  useEffect(() => {
    if (!classroom) return;
    
    setLoading(true);
    
    // Fetch classroom students
    const fetchStudents = async () => {
      try {
        const studentsQuery = query(
          collection(db, 'students'),
          where('classroomId', '==', classroom.id)
        );
        const studentsSnap = await getDocs(studentsQuery);
        const students = studentsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setClassroomStudents(students);
        setStudentCount(students.length);
      } catch (err) {
        console.error('Error fetching classroom students:', err);
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

    // Fetch classroom notes using collection group query
    const fetchNotes = async () => {
      try {
        // Use collectionGroup to query across all student observation subcollections
        const notesQuery = query(
          collectionGroup(db, 'observations'),
          where('classroomId', '==', classroom.id),
          orderBy('observedAt', 'desc')
        );
        
        const unsubscribe = onSnapshot(notesQuery, (snapshot) => {
          const notes = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setClassroomNotes(notes);
          setLoading(false);
        }, (err) => {
          console.error('Error fetching classroom notes:', err);
          setLoading(false);
        });

        return unsubscribe;
      } catch (err) {
        console.error('Error setting up notes listener:', err);
        setLoading(false);
      }
    };

    fetchStudents();
    fetchTeachers();
    fetchNotes();
  }, [classroom]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleStudentClick = (student) => {
    onNavigateToStudent(student);
  };

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

  // Handle close dialog
  const handleCloseDialog = () => {
    setDetailDialogOpen(false);
    setSelectedNote(null);
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
  const groupedFilteredNotes = useMemo(() => {
    if (!filteredNotes || filteredNotes.length === 0) {
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
    
    filteredNotes.forEach(note => {
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
  }, [filteredNotes]);


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
          Loading classroom...
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

      {/* Search Bar - Fixed positioned above tabs */}
      <Box sx={{ 
        backgroundColor: 'white',
        borderRadius: 1,
        p: 2,
        borderBottom: '1px solid #e2e8f0'
      }}>
        <TextField
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search students…"
          aria-label="Search students in this classroom"
          variant="outlined"
          size="small"
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

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
              {filteredNotes.length} observation{filteredNotes.length !== 1 ? 's' : ''} among {filteredStudents.length} students
            </Typography>
          </Box>

          {/* Notes Timeline */}
          {filteredNotes.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                {searchQuery ? `No students or observations found for "${searchQuery}"` : 'No activity here yet'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Today */}
              {groupedFilteredNotes.today && groupedFilteredNotes.today.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      Today
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {groupedFilteredNotes.today.map((note) => (
                    <ClassroomNoteCard
                      key={note.id}
                      note={note}
                      studentName={getStudentName(note)}
                      onStudentClick={() => {
                        const student = classroomStudents.find(s => s.id === note.studentId);
                        if (student) onNavigateToStudent(student);
                      }}
                      onNoteClick={() => handleNoteClick(note)}
                    />
                  ))}
                </>
              )}

              {/* Last 7 Days */}
              {groupedFilteredNotes.last7Days && groupedFilteredNotes.last7Days.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Last 7 Days
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {groupedFilteredNotes.last7Days.map((note) => (
                    <ClassroomNoteCard
                      key={note.id}
                      note={note}
                      studentName={getStudentName(note)}
                      onStudentClick={() => {
                        const student = classroomStudents.find(s => s.id === note.studentId);
                        if (student) onNavigateToStudent(student);
                      }}
                      onNoteClick={() => handleNoteClick(note)}
                    />
                  ))}
                </>
              )}

              {/* Beyond */}
              {groupedFilteredNotes.beyond && groupedFilteredNotes.beyond.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Beyond
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {groupedFilteredNotes.beyond.slice(0, Math.max(0, displayedNotesCount - (groupedFilteredNotes.today?.length || 0) - (groupedFilteredNotes.last7Days?.length || 0))).map((note) => (
                    <ClassroomNoteCard
                      key={note.id}
                      note={note}
                      studentName={getStudentName(note)}
                      onStudentClick={() => {
                        const student = classroomStudents.find(s => s.id === note.studentId);
                        if (student) onNavigateToStudent(student);
                      }}
                      onNoteClick={() => handleNoteClick(note)}
                    />
                  ))}
                </>
              )}

              {/* Show More Button */}
              {filteredNotes.length > displayedNotesCount && (
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
              {filteredStudents.length} students in {classroom.name}
            </Typography>
          </Box>

          {/* Students List */}
          {filteredStudents.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                {searchQuery ? `No students found matching "${searchQuery}"` : 'No students found in this classroom'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredStudents.map((student) => (
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
      />
    </Box>
  );
}

// ClassroomNoteCard component for displaying individual notes in the classroom timeline
function ClassroomNoteCard({ note, studentName, onStudentClick, onNoteClick }) {
  // Determine note type and icon
  const getNoteTypeInfo = (note) => {
    if (note.type === 'voice') {
      return { type: 'Voice Note', icon: <Mic sx={{ fontSize: 16, color: 'text.secondary' }} /> };
    } else if (note.type === 'text' || note.text) {
      return { type: 'Text Note', icon: <EditNote sx={{ fontSize: 16, color: 'text.secondary' }} /> };
    }
    return { type: 'Note', icon: <Notes sx={{ fontSize: 16, color: 'text.secondary' }} /> };
  };

  const noteTypeInfo = getNoteTypeInfo(note);

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

      {/* Copy button overlay - subtle utility near type badge */}
      {note.text && (
        <Box sx={{ position: 'absolute', top: 40, right: 8 }}>
          <CopyToClipboardButton
            text={note.text}
            size="small"
            ariaLabel="Copy note text"
          />
        </Box>
      )}

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
        
        <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {note.text || '(transcribing…)'}
        </Typography>
        
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
