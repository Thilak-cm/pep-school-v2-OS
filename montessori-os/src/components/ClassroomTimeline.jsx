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
  Divider
} from '@mui/material';
import { 
  Group,
  Notes,
  FilterList,
  Mic,
  EditNote,
  AccessTime,
  Person,
  ExpandMore
} from '@mui/icons-material';
import { collection, collectionGroup, query, where, orderBy, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { formatTimestamp } from '../utils/observationUtils.jsx';

function ClassroomTimeline({ classroom, currentUser, userRole, onNavigateToStudent }) {
  const [activeTab, setActiveTab] = useState(0); // 0 = Notes, 1 = Students
  const [loading, setLoading] = useState(true);
  const [classroomNotes, setClassroomNotes] = useState([]);
  const [classroomStudents, setClassroomStudents] = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [classroomTeachers, setClassroomTeachers] = useState([]);
  const [showMoreNotes, setShowMoreNotes] = useState(false);
  const [displayedNotesCount, setDisplayedNotesCount] = useState(10);

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

  // Get notes to display (with pagination)
  const notesToDisplay = useMemo(() => {
    const allNotes = [
      ...groupedNotes.today,
      ...groupedNotes.last7Days,
      ...groupedNotes.beyond
    ];
    return allNotes.slice(0, displayedNotesCount);
  }, [groupedNotes, displayedNotesCount]);

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
              {classroomNotes.length} observation{classroomNotes.length !== 1 ? 's' : ''} among {studentCount} students
            </Typography>
          </Box>

          {/* Notes Timeline */}
          {classroomNotes.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                No activity here yet
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Today */}
              {groupedNotes.today && groupedNotes.today.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      Today
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {groupedNotes.today.map((note) => (
                    <ClassroomNoteCard
                      key={note.id}
                      note={note}
                      studentName={getStudentName(note)}
                      onStudentClick={() => {
                        const student = classroomStudents.find(s => s.id === note.studentId);
                        if (student) onNavigateToStudent(student);
                      }}
                    />
                  ))}
                </>
              )}

              {/* Last 7 Days */}
              {groupedNotes.last7Days && groupedNotes.last7Days.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Last 7 Days
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {groupedNotes.last7Days.map((note) => (
                    <ClassroomNoteCard
                      key={note.id}
                      note={note}
                      studentName={getStudentName(note)}
                      onStudentClick={() => {
                        const student = classroomStudents.find(s => s.id === note.studentId);
                        if (student) onNavigateToStudent(student);
                      }}
                    />
                  ))}
                </>
              )}

              {/* Beyond */}
              {groupedNotes.beyond && groupedNotes.beyond.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Beyond
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Box>
                  {groupedNotes.beyond.slice(0, Math.max(0, displayedNotesCount - (groupedNotes.today?.length || 0) - (groupedNotes.last7Days?.length || 0))).map((note) => (
                    <ClassroomNoteCard
                      key={note.id}
                      note={note}
                      studentName={getStudentName(note)}
                      onStudentClick={() => {
                        const student = classroomStudents.find(s => s.id === note.studentId);
                        if (student) onNavigateToStudent(student);
                      }}
                    />
                  ))}
                </>
              )}

              {/* Show More Button */}
              {classroomNotes.length > displayedNotesCount && (
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
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Students tab content will be implemented in Phase 3
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ClassroomNoteCard component for displaying individual notes in the classroom timeline
function ClassroomNoteCard({ note, studentName, onStudentClick }) {
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
      aria-label={`View details for observation from ${formatTimestamp(note.observedAt || note.timestamp)}`}
    >
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
        
        <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.5 }}>
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

export default ClassroomTimeline;
