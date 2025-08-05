// ClassroomList.jsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Card,
  CardContent,
  CardActionArea,
  Avatar,
} from '@mui/material';
import { ArrowBack, School, Group, ArrowForward } from '@mui/icons-material';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

function ClassroomList({ onBack, onSelectClassroom, currentUser, userRole }) {
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentCounts, setStudentCounts] = useState({});

  useEffect(() => {
    const fetchClassrooms = async () => {
      try {
        let classroomsToShow = [];

        if (userRole === 'teacher') {
          // For teachers: get classrooms where their UID is in teacherIds array
          const classroomsSnap = await getDocs(collection(db, 'classrooms'));
          const allClassrooms = classroomsSnap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
          }));

          // Filter classrooms where current user's UID is in teacherIds array
          classroomsToShow = allClassrooms.filter(cls => 
            cls.teacherIds && cls.teacherIds.includes(currentUser.uid)
          );
        } else {
          // For admins: get all classrooms
          const qSnap = await getDocs(collection(db, 'classrooms'));
          classroomsToShow = qSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        }

        setClassrooms(classroomsToShow);

        // Get student counts for each classroom
        const counts = {};
        for (const classroom of classroomsToShow) {
          const studentsQuery = query(
            collection(db, 'students'),
            where('classroomId', '==', classroom.id)
          );
          const studentsSnap = await getDocs(studentsQuery);
          counts[classroom.id] = studentsSnap.size;
        }
        setStudentCounts(counts);

      } catch (err) {
        console.error('Error fetching classrooms', err);
      } finally {
        setLoading(false);
      }
    };

    fetchClassrooms();
  }, [currentUser?.email, userRole]);

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        minHeight: '200px'
      }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header - different for teachers vs admins */}
      {userRole === 'teacher' ? (
        // Teacher header
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="h4" component="h1" sx={{ 
            color: '#1e293b', 
            fontWeight: 600,
            mb: 1
          }}>
            Welcome back, {currentUser.displayName?.split(' ')[0] || 'Teacher'}!
          </Typography>
          <Typography variant="body1" sx={{ color: '#64748b' }}>
            Select a classroom to view your students
          </Typography>
        </Box>
      ) : (
        // Admin header with back button
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={onBack} aria-label="Go back">
            <ArrowBack />
          </IconButton>
        </Box>
      )}

      {/* Classrooms Grid */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {classrooms.length === 0 ? (
          <Card sx={{ 
            p: 4, 
            textAlign: 'center',
            backgroundColor: '#f8fafc',
            border: '2px dashed #cbd5e1'
          }}>
            <School sx={{ fontSize: 48, color: '#94a3b8', mb: 2 }} />
            <Typography variant="h6" sx={{ color: '#475569', mb: 1 }}>
              {userRole === 'teacher' ? 'No classrooms assigned' : 'No classrooms found'}
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b' }}>
              {userRole === 'teacher' 
                ? 'Contact your administrator to get assigned to classrooms.'
                : 'No classrooms have been created yet.'
              }
            </Typography>
          </Card>
        ) : (
          classrooms.map((classroom) => (
            <Card
              key={classroom.id}
              sx={{
                borderRadius: 2,
                '&:hover': {
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  transform: 'translateY(-2px)',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              <CardActionArea
                onClick={() => onSelectClassroom(classroom)}
                sx={{ p: 0 }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between'
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ 
                        bgcolor: '#4f46e5',
                        width: 48,
                        height: 48
                      }}>
                        <School />
                      </Avatar>
                      <Box>
                        <Typography variant="h6" component="h3" sx={{ 
                          color: '#1e293b',
                          fontWeight: 600
                        }}>
                          {classroom.name}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Group sx={{ fontSize: 16, color: '#64748b' }} />
                          <Typography variant="body2" sx={{ color: '#64748b' }}>
                            {studentCounts[classroom.id] || 0} students
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                    <ArrowForward sx={{ color: '#94a3b8' }} />
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          ))
        )}
      </Box>
    </Box>
  );
}

export default ClassroomList; 