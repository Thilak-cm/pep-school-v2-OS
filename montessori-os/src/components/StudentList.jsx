// StudentList.jsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
  TextField,
  InputAdornment,
} from '@mui/material';
import { Search, Notes, Person } from '@mui/icons-material';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { fuzzySearchStudents } from '../utils/fuzzySearch';

function StudentList({ classroom, onSelectStudent }) {
  const [students, setStudents] = useState([]);
  const [classroomObservations, setClassroomObservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const getStudentName = (s) =>
    s?.name || s?.displayName || [s?.firstName, s?.lastName].filter(Boolean).join(' ') || 'Unnamed Student';

  // Calculate note counts for a student
  const getStudentNoteCounts = (studentId) => {
    if (!classroomObservations || classroomObservations.length === 0) {
      return { total: 0, last7Days: 0 };
    }

    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const studentNotes = classroomObservations.filter(note => note.studentId === studentId);
    const total = studentNotes.length;
    
    const last7Days = studentNotes.filter(note => {
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

    return { total, last7Days };
  };

  // Format note count display with proper grammar
  const formatNoteCounts = (total, last7Days) => {
    const totalText = `${total} note${total !== 1 ? 's' : ''} overall`;
    const last7DaysText = `${last7Days} note${last7Days !== 1 ? 's' : ''} in the last 7 days`;
    
    return `${totalText} | ${last7DaysText}`;
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!classroom) return;
      
      setLoading(true);
      try {
        // Fetch students
        const studentsQuery = query(
          collection(db, 'students'),
          where('classroomId', '==', classroom.id)
        );
        const studentsSnap = await getDocs(studentsQuery);
        const studentsList = studentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setStudents(studentsList);

        // Fetch classroom observations using collection group query
        const observationsQuery = query(
          collectionGroup(db, 'observations'),
          where('classroomId', '==', classroom.id)
        );
        const observationsSnap = await getDocs(observationsQuery);
        const observationsList = observationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setClassroomObservations(observationsList);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [classroom]);

  // Use fuzzy search for better matching
  const visibleStudents = fuzzySearchStudents(students, searchQuery);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <TextField
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search students…"
          aria-label="Search students"
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

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {visibleStudents.map((stu) => {
            const { total, last7Days } = getStudentNoteCounts(stu.id);
            
            return (
              <Card
                key={stu.id}
                onClick={() => onSelectStudent(stu)}
                sx={{
                  cursor: 'pointer',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    transform: 'translateY(-1px)',
                  },
                  transition: 'all 0.2s ease-in-out',
                }}
                aria-label={`Open student ${getStudentName(stu)}`}
              >
                <CardContent sx={{ p: 2 }}>
                  {/* Student Name */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Person sx={{ fontSize: 16, color: 'primary.main' }} />
                    <Typography 
                      variant="subtitle2" 
                      sx={{ 
                        fontWeight: 600, 
                        color: 'primary.main'
                      }}
                    >
                      {getStudentName(stu)}
                    </Typography>
                  </Box>

                  {/* Note Counts */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Notes sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                      {formatNoteCounts(total, last7Days)}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
          {visibleStudents.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              No students found in this classroom.
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

export default StudentList; 