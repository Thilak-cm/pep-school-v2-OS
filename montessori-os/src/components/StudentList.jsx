// StudentList.jsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { db } from '../firebase';

function StudentList({ classroom, onBack, onSelectStudent }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const formatDob = (dob) => {
    if (!dob) return 'N/A';
    let date;
    // Firestore Timestamp object
    if (typeof dob === 'object' && dob.seconds !== undefined) {
      date = new Date(dob.seconds * 1000);
    } else {
      date = new Date(dob);
    }
    if (isNaN(date)) return 'N/A';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  useEffect(() => {
    const fetchStudents = async () => {
      if (!classroom) return;
      try {
        const q = query(
          collection(db, 'students'),
          where('classroomId', '==', classroom.id)
        );
        const qSnap = await getDocs(q);
        const list = qSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setStudents(list);
      } catch (err) {
        console.error('Error fetching students', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, [classroom]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={onBack} aria-label="Go back">
          <ArrowBack />
        </IconButton>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {students.map((stu) => (
            <Card
              key={stu.id}
              onClick={() => onSelectStudent(stu)}
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                },
              }}
              aria-label={`Open student ${stu.name}`}
            >
              <CardContent>
                <Typography variant="h6" component="h3">
                  {stu.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  UID: {stu.sid || stu.id} • DOB: {formatDob(stu.dateOfBirth)}
                </Typography>
              </CardContent>
            </Card>
          ))}
          {students.length === 0 && (
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