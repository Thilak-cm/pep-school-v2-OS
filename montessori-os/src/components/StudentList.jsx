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
import { Search } from '@mui/icons-material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { fuzzySearchStudents } from '../utils/fuzzySearch';

function StudentList({ classroom, onSelectStudent }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const getStudentName = (s) =>
    s?.name || s?.displayName || [s?.firstName, s?.lastName].filter(Boolean).join(' ') || 'Unnamed Student';

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
          {visibleStudents.map((stu) => (
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
                  {getStudentName(stu)}
                </Typography>
              </CardContent>
            </Card>
          ))}
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