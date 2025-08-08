// StudentList.jsx
import React, { useEffect, useState } from 'react';
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
import { ArrowBack, Search } from '@mui/icons-material';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { db } from '../firebase';

function StudentList({ classroom, onBack, onSelectStudent }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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
          where('classroomID', '==', classroom.id)
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

  // Filter students based on search term (name or UID)
  const filteredStudents = students.filter(student => {
    const searchLower = searchTerm.toLowerCase();
    const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim().toLowerCase();
    const uid = (student.studentID || student.sid || student.id || '').toString().toLowerCase();
    return fullName.includes(searchLower) || uid.includes(searchLower);
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header with back button and search */}
      {!loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <IconButton onClick={onBack} aria-label="Go back">
            <ArrowBack />
          </IconButton>
          <TextField
            fullWidth
            placeholder="Search students by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: '#64748b' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                backgroundColor: '#ffffff',
                '&:hover fieldset': {
                  borderColor: '#4f46e5',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#4f46e5',
                },
              },
            }}
          />
        </Box>
      )}

      {/* Loading state header */}
      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton onClick={onBack} aria-label="Go back">
            <ArrowBack />
          </IconButton>
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredStudents.length === 0 && searchTerm ? (
            <Card sx={{ 
              p: 4, 
              textAlign: 'center',
              backgroundColor: '#f8fafc',
              border: '2px dashed #cbd5e1'
            }}>
              <Search sx={{ fontSize: 48, color: '#94a3b8', mb: 2 }} />
              <Typography variant="h6" sx={{ color: '#475569', mb: 1 }}>
                No students found
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                Try adjusting your search term.
              </Typography>
            </Card>
          ) : (
            filteredStudents.map((stu) => (
            <Card
              key={stu.id}
              onClick={() => onSelectStudent(stu)}
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                },
              }}
              aria-label={`Open student ${`${stu.firstName || ''} ${stu.lastName || ''}`.trim() || 'Unknown Student'}`}
            >
              <CardContent>
                <Typography variant="h6" component="h3">
                  {`${stu.firstName || ''} ${stu.lastName || ''}`.trim() || 'Unknown Student'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  UID: {stu.studentID || stu.sid || stu.id || 'N/A'} • DOB: {formatDob(stu.dateOfBirth)}
                </Typography>
              </CardContent>
            </Card>
            ))
          )}
          {filteredStudents.length === 0 && !searchTerm && (
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