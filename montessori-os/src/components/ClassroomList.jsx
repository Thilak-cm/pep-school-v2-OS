// ClassroomList.jsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Card,
  CardContent,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

function ClassroomList({ onBack, onSelectClassroom }) {
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClassrooms = async () => {
      try {
        const qSnap = await getDocs(collection(db, 'classrooms'));
        const list = qSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setClassrooms(list);
      } catch (err) {
        console.error('Error fetching classrooms', err);
      } finally {
        setLoading(false);
      }
    };

    fetchClassrooms();
  }, []);

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
          {classrooms.map((cls) => (
            <Card
              key={cls.id}
              onClick={() => onSelectClassroom(cls)}
              sx={{
                cursor: 'pointer',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                },
              }}
              aria-label={`Open classroom ${cls.name}`}
            >
              <CardContent>
                <Typography variant="h6" component="h3">
                  {cls.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ID: {cls.id}
                </Typography>
              </CardContent>
            </Card>
          ))}
          {classrooms.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              No classrooms found.
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

export default ClassroomList; 