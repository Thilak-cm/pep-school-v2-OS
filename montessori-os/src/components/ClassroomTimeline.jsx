// ClassroomTimeline.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Tabs,
  Tab,
  Chip
} from '@mui/material';
import { 
  Group,
  Notes
} from '@mui/icons-material';
import { collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

function ClassroomTimeline({ classroom, currentUser, userRole, onNavigateToStudent }) {
  const [activeTab, setActiveTab] = useState(0); // 0 = Notes, 1 = Students
  const [loading, setLoading] = useState(true);
  const [classroomNotes, setClassroomNotes] = useState([]);
  const [classroomStudents, setClassroomStudents] = useState([]);
  const [studentCount, setStudentCount] = useState(0);

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

    // Fetch classroom notes (all notes from all students in this classroom)
    const fetchNotes = async () => {
      try {
        const notesQuery = query(
          collection(db, 'observations'),
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
    fetchNotes();
  }, [classroom]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleStudentClick = (student) => {
    onNavigateToStudent(student);
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
          Loading classroom...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }}>
      {/* Student Count Info */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 1,
        p: 1
      }}>
        <Chip 
          icon={<Group />} 
          label={`${studentCount} students`}
          size="small"
          color="primary"
          variant="outlined"
        />
      </Box>



      {/* Tabs */}
      <Box sx={{ 
        backgroundColor: 'white',
        borderRadius: 1,
        overflow: 'hidden'
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
      <Box sx={{ 
        backgroundColor: 'white',
        borderRadius: 1,
        p: 2,
        minHeight: '200px'
      }}>
        {activeTab === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Notes tab content will be implemented in Phase 2
            </Typography>
          </Box>
        )}
        
        {activeTab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Students tab content will be implemented in Phase 3
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default ClassroomTimeline;
