import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Autocomplete,
  TextField,
  Button,
  Divider,
  Paper,
  Stack,
  Badge,
  Tooltip
} from '@mui/material';
import {
  BarChart,
  TrendingUp,
  TrendingDown,
  People,
  School,
  Mic,
  TextFields,
  ArrowBack,
  FilterList,
  Warning,
  CheckCircle,
  Info,
  Download,
  Refresh,
  Visibility,
  VisibilityOff,
  Clear
} from '@mui/icons-material';
import { collection, collectionGroup, query, getDocs, orderBy, getDoc, doc, where, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import { fuzzySearchClassrooms, fuzzySearchTeachers, fuzzySearchStudents } from '../utils/fuzzySearch';

const StatsPage = ({ user, role, onBack }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [timePeriod, setTimePeriod] = useState('1W');
  const [stats, setStats] = useState({
    totalObservations: 0,
    thisWeek: 0,
    lastWeek: 0,
    thisWeekChange: 0,
    voiceNotes: 0,
    textNotes: 0,
    topStudents: [],
    strugglingStudents: [],
    weeklyActivity: [],
    teacherStats: [],
    classroomStats: [],
    allObservations: [],
    loading: true
  });

  // Filter states
  const [selectedClassrooms, setSelectedClassrooms] = useState([]);
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  
  // Data for filters
  const [classrooms, setClassrooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setFilterLoading(true);
        setStats(prev => ({ ...prev, loading: true }));
        
        // Log user info for debugging
        console.log('Current user:', user);
        console.log('User role:', role);
        console.log('User UID:', user?.uid);
        
        // Initialize data variables
        let classroomsData = [];
        let teachersData = [];
        let studentsData = [];
        
        // Fetch classrooms
        console.log('Fetching classrooms...');
        try {
          const classroomsQuery = query(collection(db, 'classrooms'));
          const classroomsSnap = await getDocs(classroomsQuery);
          console.log('Classrooms fetched:', classroomsSnap.size, 'found');
          classroomsData = classroomsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setClassrooms(classroomsData);
        } catch (error) {
          console.error('Classrooms query failed:', error);
          console.log('Classrooms error code:', error.code);
          console.log('Classrooms error message:', error.message);
          setClassrooms([]);
        }
        
        // Fetch teachers (users with teacher role)
        console.log('Fetching teachers...');
        try {
          // First try to get all users to see if the collection is accessible
          console.log('Testing users collection access...');
          const allUsersQuery = query(collection(db, 'users'));
          const allUsersSnap = await getDocs(allUsersQuery);
          console.log('All users fetched:', allUsersSnap.size, 'found');
          
          // Now filter for teachers client-side
          const teacherUsers = allUsersSnap.docs.filter(doc => doc.data().role === 'teacher');
          console.log('Teachers found after filtering:', teacherUsers.length);
          
          teachersData = teacherUsers.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setTeachers(teachersData);
        } catch (error) {
          console.error('Teachers query failed:', error);
          console.log('Teachers error code:', error.code);
          console.log('Teachers error message:', error.message);
          setTeachers([]);
        }
        
        // Fetch students
        console.log('Fetching students...');
        try {
          const studentsQuery = query(collection(db, 'students'));
          console.log('Students query created successfully');
          const studentsSnap = await getDocs(studentsQuery);
          console.log('Students fetched:', studentsSnap.size, 'found');
          studentsData = studentsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setStudents(studentsData);
        } catch (error) {
          console.error('Students query failed:', error);
          console.log('Students error code:', error.code);
          console.log('Students error message:', error.message);
          setStudents([]);
        }
        
        // Fetch observations using collection group query
        console.log('Fetching observations...');
        let observationsSnap;
        try {
          let observationsQuery = query(collectionGroup(db, 'observations'));
          console.log('Collection group query created successfully');
          observationsSnap = await getDocs(observationsQuery);
          console.log('Collection group query successful:', observationsSnap.size, 'documents found');
        } catch (error) {
          console.error('Collection group query failed:', error);
          console.log('Observations error code:', error.code);
          console.log('Observations error message:', error.message);
          console.log('Observations error details:', error);
          observationsSnap = { docs: [], size: 0 };
        }
        
        let allObservations = observationsSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data
          };
        });
        
        // Debug: Log a few observations to see their structure
        console.log('Sample observations:', allObservations.slice(0, 3).map(obs => ({
          id: obs.id,
          observedAt: obs.observedAt,
          createdAt: obs.createdAt,
          text: obs.text?.substring(0, 50) + '...',
          studentId: obs.studentId
        })));
        
        // Sort by observedAt client-side
        allObservations.sort((a, b) => {
          const aDate = a.observedAt?.toDate ? a.observedAt.toDate() : 
                       a.createdAt?.toDate ? a.createdAt.toDate() : 
                       new Date(a.observedAt?.seconds * 1000) || new Date(a.createdAt?.seconds * 1000) || new Date(0);
          const bDate = b.observedAt?.toDate ? b.observedAt.toDate() : 
                       b.createdAt?.toDate ? b.createdAt.toDate() : 
                       new Date(b.observedAt?.seconds * 1000) || new Date(b.createdAt?.seconds * 1000) || new Date(0);
          return bDate - aDate;
        });

        // Apply filters
        let filteredObservations = allObservations;
        
        // Role-based filtering: teachers only see their assigned classrooms
        if (role === 'teacher') {
          // Get classrooms where this teacher is assigned
          const teacherClassroomIds = classroomsData
            .filter(classroom => classroom.teacherIds && classroom.teacherIds.includes(user.uid))
            .map(classroom => classroom.id);
          
          // Filter observations to only include students from teacher's classrooms
          const teacherStudentIds = studentsData
            .filter(student => teacherClassroomIds.includes(student.classroomId))
            .map(student => student.id);
          
          filteredObservations = filteredObservations.filter(obs => 
            teacherStudentIds.includes(obs.studentId)
          );
          
          // Also filter classrooms, teachers, and students data for teacher view
          const teacherClassrooms = classroomsData.filter(classroom => 
            classroom.teacherIds && classroom.teacherIds.includes(user.uid)
          );
          setClassrooms(teacherClassrooms);
          
          const teacherStudents = studentsData.filter(student => 
            teacherClassroomIds.includes(student.classroomId)
          );
          setStudents(teacherStudents);
          
          // For teachers, only show teachers from their assigned classrooms
          const teacherClassroomTeacherIds = new Set();
          teacherClassrooms.forEach(classroom => {
            if (classroom.teacherIds) {
              classroom.teacherIds.forEach(teacherId => teacherClassroomTeacherIds.add(teacherId));
            }
          });
          
          const teacherClassroomTeachers = teachersData.filter(teacher => 
            teacherClassroomTeacherIds.has(teacher.id)
          );
          setTeachers(teacherClassroomTeachers);
        } else {
          // Admin sees all data
          setClassrooms(classroomsData);
          setTeachers(teachersData);
          setStudents(studentsData);
        }
        
        // Apply user-selected filters with AND logic between different filter types
        // Classrooms filter: OR logic within classrooms, AND logic with other filters
        if (selectedClassrooms.length > 0) {
          const classroomStudentIds = studentsData
            .filter(student => selectedClassrooms.some(classroom => classroom.id === student.classroomId))
            .map(student => student.id);
          filteredObservations = filteredObservations.filter(obs => 
            classroomStudentIds.includes(obs.studentId)
          );
        }
        
        // Teachers filter: OR logic within teachers, AND logic with other filters
        if (selectedTeachers.length > 0) {
          const selectedTeacherIds = selectedTeachers.map(teacher => teacher.id);
          filteredObservations = filteredObservations.filter(obs => 
            selectedTeacherIds.includes(obs.createdBy)
          );
        }
        
        // Students filter: OR logic within students, AND logic with other filters
        if (selectedStudents.length > 0) {
          const selectedStudentIds = selectedStudents.map(student => student.id);
          filteredObservations = filteredObservations.filter(obs => 
            selectedStudentIds.includes(obs.studentId)
          );
        }

        // Calculate weekly stats
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        // Helper function to get observation date with fallback
        const getObservationDate = (obs) => {
          if (obs.observedAt?.toDate) return obs.observedAt.toDate();
          if (obs.createdAt?.toDate) return obs.createdAt.toDate();
          if (obs.observedAt?.seconds) return new Date(obs.observedAt.seconds * 1000);
          if (obs.createdAt?.seconds) return new Date(obs.createdAt.seconds * 1000);
          return new Date(0); // fallback
        };

        const thisWeek = filteredObservations.filter(obs => {
          const obsDate = getObservationDate(obs);
          return obsDate >= weekAgo;
        });

        const lastWeek = filteredObservations.filter(obs => {
          const obsDate = getObservationDate(obs);
          return obsDate >= twoWeeksAgo && obsDate < weekAgo;
        });

        const thisWeekChange = lastWeek.length > 0 ? 
          ((thisWeek.length - lastWeek.length) / lastWeek.length * 100) : 0;

        // Calculate note types
        const voiceNotes = filteredObservations.filter(obs => 
          obs.tags?.type === 'voice' || obs.type === 'voice' || obs.tags?.includes?.('voice') || obs.duration
        );
        const textNotes = filteredObservations.filter(obs => 
          obs.tags?.type === 'text' || obs.type === 'text' || obs.tags?.includes?.('text') || (!obs.duration && obs.text)
        );

        // Debug: Log note type detection
        console.log('Note type detection:', {
          total: filteredObservations.length,
          voiceNotes: voiceNotes.length,
          textNotes: textNotes.length,
          sampleVoice: voiceNotes.slice(0, 2).map(obs => ({ type: obs.type, tags: obs.tags, duration: obs.duration })),
          sampleText: textNotes.slice(0, 2).map(obs => ({ type: obs.type, tags: obs.tags, duration: obs.duration }))
        });

        // Calculate classroom performance
        const classroomStats = classroomsData.map(classroom => {
          const classroomStudents = studentsData.filter(student => 
            student.classroomId === classroom.id
          );
          const classroomObservations = filteredObservations.filter(obs => 
            classroomStudents.some(student => student.id === obs.studentId)
          );
          const thisWeekObs = classroomObservations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= weekAgo;
          });
          
          return {
            id: classroom.id,
            name: classroom.name,
            studentCount: classroomStudents.length,
            totalObservations: classroomObservations.length,
            thisWeekObservations: thisWeekObs.length,
            avgPerStudent: classroomStudents.length > 0 ? 
              (thisWeekObs.length / classroomStudents.length) : 0,
            target: 5, // 5 notes per student per week
            performance: classroomStudents.length > 0 ? 
              (thisWeekObs.length / (classroomStudents.length * 5) * 100) : 0
          };
        });

        // Calculate teacher performance
        const teacherStats = teachersData.map(teacher => {
          const teacherObservations = filteredObservations.filter(obs => 
            obs.createdBy === teacher.id
          );
          const thisWeekObs = teacherObservations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= weekAgo;
          });
          
          return {
            id: teacher.id,
            name: teacher.displayName || teacher.email,
            email: teacher.email,
            totalObservations: teacherObservations.length,
            thisWeekObservations: thisWeekObs.length,
            target: 20, // 20 notes per week
            performance: (thisWeekObs.length / 20) * 100
          };
        });

        // Calculate student performance
        const studentStats = {};
        filteredObservations.forEach(obs => {
          if (obs.studentId) {
            if (!studentStats[obs.studentId]) {
              const student = studentsData.find(s => s.id === obs.studentId);
              studentStats[obs.studentId] = { 
                id: obs.studentId,
                name: student?.displayName || student?.name || 'Unknown Student',
                classroomId: student?.classroomId,
                count: 0,
                thisWeekCount: 0
              };
            }
            studentStats[obs.studentId].count++;
            
            const obsDate = getObservationDate(obs);
            if (obsDate >= weekAgo) {
              studentStats[obs.studentId].thisWeekCount++;
            }
          }
        });

        const topStudents = Object.values(studentStats)
          .sort((a, b) => b.thisWeekCount - a.thisWeekCount)
          .slice(0, 5);

        const strugglingStudents = Object.values(studentStats)
          .filter(student => student.thisWeekCount < 2) // Less than 2 notes this week
          .sort((a, b) => a.thisWeekCount - b.thisWeekCount)
          .slice(0, 5);

        // Weekly activity for trend analysis
        const weeklyActivity = [];
        for (let i = 3; i >= 0; i--) {
          const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
          const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          
          const weekCount = filteredObservations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= weekStart && obsDate < weekEnd;
          }).length;
          
          weeklyActivity.push({
            week: `Week ${4 - i}`,
            count: weekCount
          });
        }

        console.log('About to set stats...');
        console.log('Filtered observations count:', filteredObservations.length);
        console.log('This week count:', thisWeek.length);
        console.log('Last week count:', lastWeek.length);
        
        setStats({
          totalObservations: filteredObservations.length,
          thisWeek: thisWeek.length,
          lastWeek: lastWeek.length,
          thisWeekChange: thisWeekChange,
          voiceNotes: voiceNotes.length,
          textNotes: textNotes.length,
          topStudents,
          strugglingStudents,
          weeklyActivity,
          teacherStats,
          classroomStats,
          allObservations: filteredObservations,
          loading: false
        });
        
        console.log('Stats set successfully!');

      } catch (error) {
        console.error('Error fetching stats:', error);
        setStats(prev => ({ ...prev, loading: false }));
      } finally {
        setFilterLoading(false);
      }
    };

    fetchData();
  }, [selectedClassrooms, selectedTeachers, selectedStudents, user, role]);

  const handleTabChange = (event, newValue) => {
    // Teachers can't access certain tabs
    if (role === 'teacher') {
      if (newValue === 2 || newValue === 3) { // Hide Teachers and Students tabs for teachers
        return;
      }
    }
    setActiveTab(newValue);
  };

  const handleTimePeriodChange = (event, newPeriod) => {
    if (newPeriod !== null) {
      setTimePeriod(newPeriod);
    }
  };

  const clearFilters = () => {
    setSelectedClassrooms([]);
    setSelectedTeachers([]);
    setSelectedStudents([]);
  };

  const getFilterSummary = () => {
    const filters = [];
    
    if (selectedClassrooms.length > 0) {
      const classroomNames = selectedClassrooms.map(c => c.name).join(', ');
      filters.push(`Classrooms: ${classroomNames}`);
    }
    
    if (selectedTeachers.length > 0) {
      const teacherNames = selectedTeachers.map(t => t.displayName || t.email).join(', ');
      filters.push(`Teachers: ${teacherNames}`);
    }
    
    if (selectedStudents.length > 0) {
      const studentNames = selectedStudents.map(s => s.displayName || s.name).join(', ');
      filters.push(`Students: ${studentNames}`);
    }
    
    if (filters.length === 0) {
      return 'All data (no filters applied)';
    }
    
    return filters.join(' • ');
  };

  const hasActiveFilters = () => {
    return selectedClassrooms.length > 0 || selectedTeachers.length > 0 || selectedStudents.length > 0;
  };

  const getActionItems = () => {
    const actions = [];
    
    // Classroom actions
    stats.classroomStats.forEach(classroom => {
      if (classroom.performance < 50) {
        actions.push({
          type: 'warning',
          message: `${classroom.name} needs attention - only ${classroom.performance.toFixed(1)}% of target met`,
          priority: 'high',
          category: 'classroom',
          progress: Math.max(0, Math.min(100, classroom.performance)),
          contextLeft: `${classroom.thisWeekObservations}`,
          contextRight: `${classroom.studentCount * classroom.target}`
        });
      }
    });
    
    // Teacher actions
    stats.teacherStats.forEach(teacher => {
      if (teacher.performance < 50) {
        actions.push({
          type: 'warning',
          message: `${teacher.name} needs support - only ${teacher.thisWeekObservations}/20 notes this week`,
          priority: 'medium',
          category: 'teacher',
          progress: Math.max(0, Math.min(100, (teacher.thisWeekObservations / 20) * 100)),
          contextLeft: `${teacher.thisWeekObservations}`,
          contextRight: '20'
        });
      }
    });
    
    // Student actions
    stats.strugglingStudents.forEach(student => {
      actions.push({
        type: 'info',
        message: `${student.name} has only ${student.thisWeekCount} note(s) this week`,
        priority: 'low',
        category: 'student',
        progress: Math.max(0, Math.min(100, (student.thisWeekCount / 2) * 100)),
        contextLeft: `${student.thisWeekCount}`,
        contextRight: '2'
      });
    });
    
    return actions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  };

  const StatCard = ({ title, value, icon, color = 'primary', subtitle, trend }) => (
    <Card sx={{ 
      borderRadius: 2,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      height: '100%'
    }}>
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Box sx={{ 
            color: `${color}.main`, 
            mr: 1,
            display: 'flex',
            alignItems: 'center'
          }}>
            {icon}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {title}
          </Typography>
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 700, color: `${color}.main` }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
        {trend && (
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
            {trend > 0 ? (
              <TrendingUp sx={{ color: 'success.main', fontSize: 16, mr: 0.5 }} />
            ) : (
              <TrendingDown sx={{ color: 'error.main', fontSize: 16, mr: 0.5 }} />
            )}
            <Typography 
              variant="caption" 
              color={trend > 0 ? 'success.main' : 'error.main'}
              sx={{ fontWeight: 600 }}
            >
              {Math.abs(trend).toFixed(1)}%
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const FilterSection = () => (
    <Card sx={{ mb: 3, borderRadius: 2 }}>
      <CardContent sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Data Filters
          </Typography>
          <Button
            size="small"
            onClick={clearFilters}
            startIcon={<Clear />}
          >
            Clear All
          </Button>
        </Box>
        
        {showFilters && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Classrooms Filter */}
            <Box sx={{ position: 'relative' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary' }}>
                Classrooms
              </Typography>
              <Autocomplete
                multiple
                options={classrooms}
                getOptionLabel={(option) => option.name}
                value={selectedClassrooms}
                onChange={(event, newValue) => setSelectedClassrooms(newValue)}
                filterOptions={(options, { inputValue }) => 
                  fuzzySearchClassrooms(options, inputValue)
                }
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    label="Select Classrooms" 
                    size="small"
                    placeholder="Search classrooms..."
                    fullWidth
                  />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      label={option.name}
                      size="small"
                      {...getTagProps({ index })}
                      onDelete={() => {
                        const newValue = value.filter((_, i) => i !== index);
                        setSelectedClassrooms(newValue);
                      }}
                    />
                  ))
                }
                noOptionsText="No classrooms found"
                loading={classrooms.length === 0}
              />
              {selectedClassrooms.length > 0 && (
                <Button
                  size="small"
                  onClick={() => setSelectedClassrooms([])}
                  sx={{ 
                    position: 'absolute', 
                    top: 20, 
                    right: -8, 
                    minWidth: 'auto',
                    p: 0.5,
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    '&:hover': { backgroundColor: 'grey.50' }
                  }}
                >
                  <Clear sx={{ fontSize: 16 }} />
                </Button>
              )}
            </Box>

            {/* Teachers Filter */}
            <Box sx={{ position: 'relative' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary' }}>
                Teachers
              </Typography>
              <Autocomplete
                multiple
                options={teachers}
                getOptionLabel={(option) => option.displayName || option.email}
                value={selectedTeachers}
                onChange={(event, newValue) => setSelectedTeachers(newValue)}
                filterOptions={(options, { inputValue }) => 
                  fuzzySearchTeachers(options, inputValue)
                }
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    label="Select Teachers" 
                    size="small"
                    placeholder="Search teachers..."
                    fullWidth
                  />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      label={option.displayName || option.email}
                      size="small"
                      {...getTagProps({ index })}
                      onDelete={() => {
                        const newValue = value.filter((_, i) => i !== index);
                        setSelectedTeachers(newValue);
                      }}
                    />
                  ))
                }
                noOptionsText="No teachers found"
                loading={teachers.length === 0}
              />
              {selectedTeachers.length > 0 && (
                <Button
                  size="small"
                  onClick={() => setSelectedTeachers([])}
                  sx={{ 
                    position: 'absolute', 
                    top: 20, 
                    right: -8, 
                    minWidth: 'auto',
                    p: 0.5,
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    '&:hover': { backgroundColor: 'grey.50' }
                  }}
                >
                  <Clear sx={{ fontSize: 16 }} />
                </Button>
              )}
            </Box>

            {/* Students Filter */}
            <Box sx={{ position: 'relative' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary' }}>
                Students
              </Typography>
              <Autocomplete
                multiple
                options={students}
                getOptionLabel={(option) => option.displayName || option.name}
                value={selectedStudents}
                onChange={(event, newValue) => setSelectedStudents(newValue)}
                filterOptions={(options, { inputValue }) => 
                  fuzzySearchStudents(options, inputValue)
                }
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    label="Select Students" 
                    size="small"
                    placeholder="Search students..."
                    fullWidth
                  />
                )}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      label={option.displayName || option.name}
                      size="small"
                      {...getTagProps({ index })}
                      onDelete={() => {
                        const newValue = value.filter((_, i) => i !== index);
                        setSelectedStudents(newValue);
                      }}
                    />
                  ))
                }
                noOptionsText="No students found"
                loading={students.length === 0}
              />
              {selectedStudents.length > 0 && (
                <Button
                  size="small"
                  onClick={() => setSelectedStudents([])}
                  sx={{ 
                    position: 'absolute', 
                    top: 20, 
                    right: -8, 
                    minWidth: 'auto',
                    p: 0.5,
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    '&:hover': { backgroundColor: 'grey.50' }
                  }}
                >
                  <Clear sx={{ fontSize: 16 }} />
                </Button>
              )}
            </Box>
          </Box>
        )}
        
        {/* Filter Summary */}
        <Box sx={{ mt: 2, p: 1.5, backgroundColor: 'grey.50', borderRadius: 1, border: '1px solid #e2e8f0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              Showing data for: <strong>{getFilterSummary()}</strong>
            </Typography>
            {filterLoading && <CircularProgress size={12} />}
          </Box>
          {stats.allObservations.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              <strong>{stats.allObservations.length}</strong> observation{stats.allObservations.length !== 1 ? 's' : ''} found
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );

  const ActionItemsPanel = () => {
    const actions = getActionItems();
    
    if (actions.length === 0) {
      return (
        <Card sx={{ mb: 3, borderRadius: 2 }}>
          <CardContent sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CheckCircle sx={{ color: 'success.main', mr: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                All Good! 🎉
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              No immediate actions needed. All targets are being met.
            </Typography>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card sx={{ mb: 3, borderRadius: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Warning sx={{ color: 'warning.main', mr: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Action Items ({actions.length})
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">Ranked by urgency</Typography>
          </Box>

          <List sx={{ p: 0 }}>
            {actions.map((action, index) => {
              const isWarning = action.type === 'warning';
              const bg = isWarning ? 'warning.50' : 'info.50';
              const border = isWarning ? 'warning.200' : 'info.200';
              const iconBg = isWarning ? 'warning.main' : 'info.main';
              const IconComp = action.category === 'classroom' ? School : action.category === 'teacher' ? People : Info;
              return (
                <ListItem key={index} sx={{
                  mb: 1,
                  border: `1px solid`,
                  borderColor: border,
                  borderRadius: 1,
                  bgcolor: bg
                }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: iconBg }}>
                      <IconComp sx={{ color: 'common.white' }} />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primaryTypographyProps={{ variant: 'body2', sx: { fontWeight: 600 } }}
                    secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                    primary={action.message}
                    secondary={
                      <Box sx={{ mt: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">{action.contextLeft}</Typography>
                          <Typography variant="caption" color="text.secondary">{action.contextRight}</Typography>
                        </Box>
                        <LinearProgress variant="determinate" value={action.progress} sx={{ height: 8, borderRadius: 6 }} />
                      </Box>
                    }
                  />
                  <Chip
                    label={`${Math.round(action.progress)}%`}
                    color={action.progress >= 80 ? 'success' : action.progress >= 50 ? 'warning' : 'error'}
                    size="small"
                  />
                </ListItem>
              );
            })}
          </List>
        </CardContent>
      </Card>
    );
  };

  const ClassroomComparisonChart = () => {
    if (stats.classroomStats.length === 0) {
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: 200,
          backgroundColor: 'grey.50',
          borderRadius: 2
        }}>
          <Typography variant="body2" color="text.secondary">
            No classroom data available
          </Typography>
        </Box>
      );
    }

    const data = stats.classroomStats.map(classroom => ({
      name: classroom.name,
      'This Week': classroom.thisWeekObservations,
      'Target': classroom.studentCount * classroom.target,
      'Performance %': classroom.performance
    }));

    return (
      <Box sx={{ height: 300, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              width={40}
              tickFormatter={(value) => Math.round(value)}
            />
            <RechartsTooltip 
              contentStyle={{ 
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <Box sx={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: 2,
                      p: 1.5,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                      <Typography sx={{ fontSize: '16px', fontWeight: 'bold', color: '#4f46e5' }}>
                        {payload[0].value}
                      </Typography>
                      <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                        {payload[0].dataKey}: {payload[0].payload.name}
                      </Typography>
                    </Box>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="This Week" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Target" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
          </RechartsBarChart>
        </ResponsiveContainer>
      </Box>
    );
  };

  const generateActivityData = (observations, period) => {
    const now = new Date();
    const data = [];
    
    // Helper function to get observation date with fallback
    const getObservationDate = (obs) => {
      if (obs.observedAt?.toDate) return obs.observedAt.toDate();
      if (obs.createdAt?.toDate) return obs.createdAt.toDate();
      if (obs.observedAt?.seconds) return new Date(obs.observedAt.seconds * 1000);
      if (obs.createdAt?.seconds) return new Date(obs.createdAt.seconds * 1000);
      return new Date(0); // fallback
    };
    
    switch (period) {
      case '1D':
        // Last 24 hours in 4-hour intervals
        for (let i = 5; i >= 0; i--) {
          const start = new Date(now.getTime() - i * 4 * 60 * 60 * 1000);
          const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
          
          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= start && obsDate < end;
          }).length;
          
          data.push({
            period: `${start.getHours()}:00`,
            count
          });
        }
        break;
        
      case '1W':
        // Last 7 days
        for (let i = 6; i >= 0; i--) {
          const start = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
          
          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= start && obsDate < end;
          }).length;
          
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          data.push({
            period: dayNames[start.getDay()],
            count
          });
        }
        break;
        
      case '1M':
        // Last 4 weeks
        for (let i = 3; i >= 0; i--) {
          const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
          const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          
          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= weekStart && obsDate < weekEnd;
          }).length;
          
          data.push({
            period: `Week ${4 - i}`,
            count
          });
        }
        break;
        
      case '3M':
        // Last 3 months
        for (let i = 2; i >= 0; i--) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
          
          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= monthStart && obsDate < monthEnd;
          }).length;
          
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          data.push({
            period: monthNames[monthStart.getMonth()],
            count
          });
        }
        break;
        
      case '6M':
        // Last 6 months
        for (let i = 5; i >= 0; i--) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
          
          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= monthStart && obsDate < monthEnd;
          }).length;
          
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          data.push({
            period: monthNames[monthStart.getMonth()],
            count
          });
        }
        break;
        
      case '1Y':
        // Last 12 months
        for (let i = 11; i >= 0; i--) {
          const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
          
          const count = observations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= monthStart && obsDate < monthEnd;
          }).length;
          
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          data.push({
            period: monthNames[monthStart.getMonth()],
            count
          });
        }
        break;
        
      default:
        return [];
    }
    
    return data;
  };

  const ActivityTrendChart = () => {
    const activityData = generateActivityData(stats.allObservations, timePeriod);
    
    if (activityData.length === 0) {
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: 200,
          backgroundColor: 'grey.50',
          borderRadius: 2
        }}>
          <Typography variant="body2" color="text.secondary">
            No trend data available for {timePeriod}
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ height: 250, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={activityData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="period" 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
              width={40}
              tickFormatter={(value) => Math.round(value)}
            />
            <RechartsTooltip 
              contentStyle={{ 
                backgroundColor: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <Box sx={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: 2,
                      p: 1.5,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                      <Typography sx={{ fontSize: '16px', fontWeight: 'bold', color: '#4f46e5' }}>
                        {payload[0].value}
                      </Typography>
                      <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                        Time: {payload[0].payload.period}
                      </Typography>
                    </Box>
                  );
                }
                return null;
              }}
            />
            <Line 
              type="monotone" 
              dataKey="count" 
              stroke="#4f46e5" 
              strokeWidth={3}
              dot={{ fill: '#4f46e5', strokeWidth: 2, r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    );
  };

  if (stats.loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        py: 8 
      }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 3,
      pb: 4 
    }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton 
            onClick={onBack} 
            aria-label="Go back"
            sx={{ mr: 2 }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h5" sx={{ fontWeight: 600, color: '#1e293b' }}>
            {role === 'teacher' ? 'My Statistics' : 'Statistics & Analytics'}
          </Typography>
        </Box>
        
        {/* Filter Button */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {hasActiveFilters() && (
            <Chip 
              label={`${stats.allObservations.length} filtered`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
          <Button
            startIcon={<FilterList />}
            onClick={() => setShowFilters(!showFilters)}
            variant={hasActiveFilters() ? 'contained' : 'outlined'}
            color={hasActiveFilters() ? 'primary' : 'default'}
            size="small"
            aria-label="Toggle filters"
          >
            Filters
          </Button>
        </Box>
      </Box>

      {/* Filters Section */}
      {showFilters && <FilterSection />}

      {/* Statistics Tabs */}
      <Card sx={{ 
        borderRadius: 3,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange}
            variant="fullWidth"
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 600
              }
            }}
          >
            <Tab 
              icon={<BarChart />} 
              label="Overview" 
              iconPosition="start"
            />
            <Tab 
              icon={<School />} 
              label={role === 'teacher' ? 'My Classrooms' : 'All Classrooms'} 
              iconPosition="start"
            />
            {role !== 'teacher' && (
              <Tab 
                icon={<People />} 
                label="Teachers" 
                iconPosition="start"
              />
            )}
            {role !== 'teacher' && (
              <Tab 
                icon={<People />} 
                label="Students" 
                iconPosition="start"
              />
            )}
          </Tabs>
        </Box>

        <CardContent sx={{ p: 3 }}>
          {/* Overview Tab */}
          {activeTab === 0 && (
            <Box>
              {/* Activity Trend Chart */}
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                mb: 3,
                p: 2,
                backgroundColor: 'primary.50',
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'primary.200'
              }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', mb: 0.5 }}>
                    Activity Trend
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {timePeriod === '1D' ? 'Last 24 Hours' : 
                     timePeriod === '1W' ? 'Last 7 Days' :
                     timePeriod === '1M' ? 'Last 4 Weeks' :
                     timePeriod === '3M' ? 'Last 3 Months' :
                     timePeriod === '6M' ? 'Last 6 Months' :
                     timePeriod === '1Y' ? 'Last 12 Months' : 'Weekly'}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {stats.thisWeek}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    notes created
                  </Typography>
                </Box>
              </Box>
              
              {/* Time Period Toggles */}
              <Box sx={{ mb: 2 }}>
                <ToggleButtonGroup
                  value={timePeriod}
                  exclusive
                  onChange={handleTimePeriodChange}
                  size="small"
                  sx={{
                    '& .MuiToggleButton-root': {
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 2,
                      py: 1,
                      borderColor: '#e2e8f0',
                      '&.Mui-selected': {
                        backgroundColor: '#4f46e5',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: '#4338ca'
                        }
                      }
                    }
                  }}
                >
                  <ToggleButton value="1D">1D</ToggleButton>
                  <ToggleButton value="1W">1W</ToggleButton>
                  <ToggleButton value="1M">1M</ToggleButton>
                  <ToggleButton value="3M">3M</ToggleButton>
                  <ToggleButton value="6M">6M</ToggleButton>
                  <ToggleButton value="1Y">1Y</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              
              <Box sx={{ 
                backgroundColor: 'white',
                borderRadius: 2,
                p: 2,
                border: '1px solid #e2e8f0',
                mb: 3
              }}>
                <ActivityTrendChart />
              </Box>

              {/* Note Distribution Card */}
              <Box sx={{ 
                backgroundColor: 'white',
                borderRadius: 2,
                p: 3,
                border: '1px solid #e2e8f0',
                mb: 3
              }}>
                {/* Header */}
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mb: 2 }}>
                  Note Distribution
                </Typography>
                
                {/* Pie Chart */}
                <Box sx={{ height: 250, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Voice Notes', value: stats.voiceNotes, color: '#3b82f6' },
                          { name: 'Text Notes', value: stats.textNotes, color: '#f59e0b' }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={0}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {[
                          { name: 'Voice Notes', value: stats.voiceNotes, color: '#3b82f6' },
                          { name: 'Text Notes', value: stats.textNotes, color: '#f59e0b' }
                        ].map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.color}
                            stroke="#ffffff"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ 
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: 8,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}
                        formatter={(value, name) => [value, name]}
                        labelFormatter={(label) => `${label}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
                
                {/* Simple Legend */}
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 4 }}>
                  {[
                    { name: 'Voice Notes', value: stats.voiceNotes, color: '#3b82f6' },
                    { name: 'Text Notes', value: stats.textNotes, color: '#f59e0b' }
                  ].map((item, index) => (
                    <Box key={index} sx={{ textAlign: 'center' }}>
                      <Box sx={{ 
                        width: 16, 
                        height: 16, 
                        bgcolor: item.color, 
                        borderRadius: '50%',
                        mx: 'auto',
                        mb: 1,
                        border: '2px solid white',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }} />
                      <Typography variant="body2" sx={{ fontWeight: 600, color: item.color, mb: 0.5 }}>
                        {item.value}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.name}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          )}

          {/* Classrooms Tab */}
          {activeTab === 1 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                {role === 'teacher' ? 'My Classrooms' : 'Classroom Performance'}
              </Typography>
              
              {stats.classroomStats.length > 0 ? (
                <Box>
                  {/* Classroom Comparison Chart */}
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                      {role === 'teacher' ? 'My Classrooms This Week' : 'This Week vs Target'}
                    </Typography>
                    <ClassroomComparisonChart />
                  </Box>
                  
                  {/* Classroom Details */}
                  <Grid container spacing={2}>
                    {stats.classroomStats.map((classroom) => (
                      <Grid item xs={12} sm={6} key={classroom.id}>
                        <Card sx={{ borderRadius: 2 }}>
                          <CardContent sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                {classroom.name}
                              </Typography>
                              <Chip 
                                label={`${classroom.performance.toFixed(1)}%`}
                                color={classroom.performance >= 80 ? 'success' : 
                                       classroom.performance >= 60 ? 'warning' : 'error'}
                                size="small"
                              />
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                              {classroom.studentCount} students
                            </Typography>
                            <Box sx={{ mb: 2 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2">This Week</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {classroom.thisWeekObservations}/{classroom.studentCount * classroom.target}
                                </Typography>
                              </Box>
                              <LinearProgress 
                                variant="determinate" 
                                value={Math.min(classroom.performance, 100)} 
                                sx={{ height: 8, borderRadius: 4 }}
                              />
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              ) : (
                <Alert severity="info">
                  No classroom data available.
                </Alert>
              )}
            </Box>
          )}

          {/* Teachers Tab */}
          {activeTab === 2 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Teacher Performance
              </Typography>
              
              {stats.teacherStats.length > 0 ? (
                <Box>
                  {/* Teacher Performance Bars */}
                  <Box sx={{ mb: 3 }}>
                    {stats.teacherStats.map((teacher) => (
                      <Box key={teacher.id} sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                            {teacher.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {teacher.thisWeekObservations}/20 notes
                          </Typography>
                        </Box>
                        <Box sx={{ position: 'relative', height: 24, backgroundColor: '#f1f5f9', borderRadius: 2 }}>
                          <Box sx={{
                            height: '100%',
                            width: `${Math.min((teacher.thisWeekObservations / 20) * 100, 100)}%`,
                            backgroundColor: teacher.performance >= 80 ? '#10b981' : 
                                           teacher.performance >= 50 ? '#f59e0b' : '#ef4444',
                            borderRadius: 2,
                            transition: 'width 0.3s ease'
                          }} />
                        </Box>
                      </Box>
                    ))}
                  </Box>
                  
                  {/* Summary Stats */}
                  <Box sx={{ p: 2, backgroundColor: '#f8fafc', borderRadius: 1, border: '1px solid #e2e8f0' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Team Performance Summary
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 3 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">High Engagement</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {stats.teacherStats.filter(t => t.performance >= 80).length} teachers
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Average Notes</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {(stats.teacherStats.reduce((sum, t) => sum + t.thisWeekObservations, 0) / stats.teacherStats.length).toFixed(1)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Alert severity="info">
                  No teacher data available.
                </Alert>
              )}
            </Box>
          )}

          {/* Students Tab */}
          {activeTab === 3 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Student Performance
              </Typography>
              
              {stats.topStudents.length > 0 ? (
                <Box>
                  {/* Top Performers */}
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    Top Performers This Week
                  </Typography>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    {stats.topStudents.map((student) => (
                      <Grid item xs={12} sm={6} key={student.id}>
                        <Card sx={{ borderRadius: 2 }}>
                          <CardContent sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box>
                                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                  {student.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {student.thisWeekCount} notes this week
                                </Typography>
                              </Box>
                              <Chip 
                                label="Top Performer"
                                color="success"
                                size="small"
                              />
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                  
                  {/* Struggling Students */}
                  {stats.strugglingStudents.length > 0 && (
                    <Box>
                      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: 'warning.main' }}>
                        Students Needing Attention
                      </Typography>
                      <Grid container spacing={2}>
                        {stats.strugglingStudents.map((student) => (
                          <Grid item xs={12} sm={6} key={student.id}>
                            <Card sx={{ borderRadius: 2, border: '1px solid #fbbf24' }}>
                              <CardContent sx={{ p: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Box>
                                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                      {student.name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Only {student.thisWeekCount} note(s) this week
                                    </Typography>
                                  </Box>
                                  <Chip 
                                    label="Needs Attention"
                                    color="warning"
                                    size="small"
                                  />
                                </Box>
                              </CardContent>
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    </Box>
                  )}
                </Box>
              ) : (
                <Alert severity="info">
                  No student data available.
                </Alert>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Action Items Panel - moved to bottom for streamlined flow */}
      <ActionItemsPanel />
    </Box>
  );
};

export default StatsPage; 