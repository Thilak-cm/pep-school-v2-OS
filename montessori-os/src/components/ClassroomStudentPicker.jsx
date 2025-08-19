import React, { useEffect, useState, useMemo } from 'react';
import { 
  TextField, 
  CircularProgress, 
  Box, 
  Typography, 
  Checkbox, 
  FormControlLabel,
  Collapse,
  IconButton,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Paper,
  Button
} from '@mui/material';
import { 
  Search, 
  ExpandMore, 
  ExpandLess,
  Person,
  Group,
  Edit,
  Close,
  CheckCircle
} from '@mui/icons-material';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { fuzzySearchStudents } from '../utils/fuzzySearch';

/*
Props:
  selectedStudents: array of student UIDs
  onStudentsChange: (array) => void
*/
function ClassroomStudentPicker({
  selectedStudents,
  onStudentsChange,
  currentUser,
  userRole,
  textData,
  onTextDataChange
}) {
  const [classrooms, setClassrooms] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClassrooms, setExpandedClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Edit mode state for text
  const [isEditing, setIsEditing] = useState(false);
  const [editableText, setEditableText] = useState('');
  const [originalText, setOriginalText] = useState('');

  // Fetch all classrooms and students once
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch classrooms based on user role
        let classList = [];
        
        // Get teacher's assigned classrooms first (for both teacher and admin)
        let assignedClassroomNames = [];
        if (userRole === 'teacher') {
          // For teachers: get classrooms where their UID is in teacherIds array
          // This matches the security rules and DATA_STRUCTURE.md approach
          const classroomsQuery = query(
            collection(db, 'classrooms'),
            where('teacherIds', 'array-contains', currentUser.uid)
          );
          const classroomsSnap = await getDocs(classroomsQuery);
          const teacherClassrooms = classroomsSnap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
          }));
          
          // Get classroom names for filtering students later
          assignedClassroomNames = teacherClassrooms.map(cls => cls.name);
          
          // Set classrooms directly from the query
          classList = teacherClassrooms;
          
          // Update the classrooms state for the Browse by Classroom section
          setClassrooms(classList);
        } else {
          // For admins: get all classrooms
          const allClassroomsSnap = await getDocs(collection(db, 'classrooms'));
          classList = allClassroomsSnap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
          }));
          
          // Update the classrooms state for the Browse by Classroom section
          setClassrooms(classList);
        }
        
        // Fetch students based on user role
        let studentList = [];
        
        if (userRole === 'teacher') {
          // For teachers: only get students from their assigned classrooms

          // Get all students and filter by assigned classrooms
          const allStudentsSnap = await getDocs(collection(db, 'students'));
          const allStudents = allStudentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          // Filter students to only those in assigned classrooms
          studentList = allStudents.filter(student => {
            // Handle different classroomId formats
            let classroomId;
            if (student.classroomId) {
              if (typeof student.classroomId === 'object' && student.classroomId.id) {
                classroomId = student.classroomId.id;
              } else if (typeof student.classroomId === 'string') {
                classroomId = student.classroomId.includes('/') 
                  ? student.classroomId.split('/').pop() 
                  : student.classroomId;
              } else {
                classroomId = student.classroomId;
              }
            }
            
            // Find the classroom name for this student
            const studentClassroom = classList.find(c => c.id === classroomId);
            const isInAssignedClassroom = studentClassroom && assignedClassroomNames.includes(studentClassroom.name);
            
            return isInAssignedClassroom;
          });
          
        } else {
          // For admins: get all students
          const studentSnap = await getDocs(collection(db, 'students'));
          studentList = studentSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        
        // Add classroom name to each student for display
        const studentsWithClassroom = studentList.map(student => {
          // Handle different classroomId formats
          let classroomId;
          if (student.classroomId) {
            if (typeof student.classroomId === 'object' && student.classroomId.id) {
              // DocumentReference object
              classroomId = student.classroomId.id;
            } else if (typeof student.classroomId === 'string') {
              // String format - could be just ID or full path
              classroomId = student.classroomId.includes('/') 
                ? student.classroomId.split('/').pop() 
                : student.classroomId;
            } else {
              classroomId = student.classroomId;
            }
          }
          
          const classroom = classList.find(c => c.id === classroomId);
          
          return {
            ...student,
            classroom_name: classroom?.name || 'Unknown Classroom',
            classroomId: classroomId
          };
        });
        
        setAllStudents(studentsWithClassroom);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, userRole]);

  const getStudentName = (s) => s?.name || s?.displayName || [s?.firstName, s?.lastName].filter(Boolean).join(' ') || 'Unnamed Student';

  // Use fuzzy search for better student matching
  const filteredStudents = useMemo(() => {
    return fuzzySearchStudents(allStudents, searchQuery);
  }, [allStudents, searchQuery]);

  // Group students by classroom
  const studentsByClassroom = useMemo(() => {
    const grouped = {};
    
    // Only create entries for classrooms that have students
    allStudents.forEach(student => {
      const classroomId = student.classroomId;
      if (!grouped[classroomId]) {
        // Find the classroom in our filtered classrooms list
        const classroom = classrooms.find(c => c.id === classroomId);
        if (classroom) {
          grouped[classroomId] = {
            classroom: {
              id: classroom.id,
              name: classroom.name
            },
            students: []
          };
        }
      }
      
      if (grouped[classroomId]) {
        grouped[classroomId].students.push(student);
      }
    });
    
    return Object.values(grouped);
  }, [allStudents, classrooms]);

  // Handle student selection
  const handleStudentToggle = (studentId) => {
    const newSelected = selectedStudents.includes(studentId)
      ? selectedStudents.filter(id => id !== studentId)
      : [...selectedStudents, studentId];
    onStudentsChange(newSelected);
  };



  // Toggle classroom expansion
  const toggleClassroomExpansion = (classroomId) => {
    setExpandedClassrooms(prev => 
      prev.includes(classroomId)
        ? prev.filter(id => id !== classroomId)
        : [...prev, classroomId]
    );
  };

  // Text editing functions
  const startEditing = () => {
    setOriginalText(textData?.text || '');
    setEditableText(textData?.text || '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditableText('');
    setOriginalText('');
  };

  const saveEditing = () => {
    if (!editableText.trim()) {
      return; // Don't save empty text
    }
    
    // Update the textData with edited text
    if (onTextDataChange) {
      onTextDataChange({
        ...textData,
        text: editableText.trim()
      });
    }
    
    setIsEditing(false);
    setEditableText('');
    setOriginalText('');
  };



  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Text Display Section - Same style as VoiceRecorder */}
      {textData?.text && (
        <Box
          sx={{
            padding: 3,
            backgroundColor: '#f0f9ff',
            borderTop: '1px solid #e2e8f0',
            borderRadius: 2
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 2
            }}
          >
            <Typography
              variant="h6"
              component="h4"
              sx={{
                margin: 0,
                color: '#1e293b',
                fontSize: '1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <CheckCircle sx={{ fontSize: 16 }} />
              Text Note
            </Typography>
          </Box>

          {/* Text Content */}
          <Paper
            sx={{
              padding: 2,
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              marginBottom: 2
            }}
          >
            {isEditing ? (
              <TextField
                multiline
                rows={4}
                fullWidth
                value={editableText}
                onChange={(e) => setEditableText(e.target.value)}
                variant="outlined"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1,
                  }
                }}
              />
            ) : (
              <Typography
                sx={{
                  color: '#1e293b',
                  fontSize: '0.875rem',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {textData.text}
              </Typography>
            )}
          </Paper>

          {/* Text Actions */}
          {isEditing ? (
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}
            >
              <Button
                variant="contained"
                color="error"
                onClick={cancelEditing}
                startIcon={<Close />}
                size="small"
                sx={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: '#b91c1c',
                  }
                }}
              >
                Cancel Edit
              </Button>
              
              <Button
                variant="contained"
                color="success"
                onClick={saveEditing}
                startIcon={<CheckCircle />}
                size="small"
                disabled={!editableText.trim()}
                sx={{
                  backgroundColor: editableText.trim() ? '#059669' : '#cbd5e1',
                  color: 'white',
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: editableText.trim() ? '#047857' : '#cbd5e1',
                  }
                }}
              >
                Save Edit
              </Button>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}
            >
              <Button
                variant="contained"
                onClick={startEditing}
                startIcon={<Edit />}
                size="small"
                sx={{
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: '#4338ca',
                  }
                }}
              >
                Edit Text
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* Divider between Text Note and Student Selection */}
      {textData?.text && (
        <Divider sx={{ my: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Next: Select Recipients
          </Typography>
        </Divider>
      )}

      {/* Main Heading with Total Selected Count */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Group sx={{ fontSize: 20 }} />
          Select classroom(s) and student(s)
        </Typography>
        {selectedStudents.length > 0 && (
          <Chip 
            label={`${selectedStudents.length} student${selectedStudents.length === 1 ? '' : 's'} selected`}
            color="primary"
            variant="filled"
            size="medium"
          />
        )}
      </Box>

      {/* Search Section */}
      <Box>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Search sx={{ fontSize: 20 }} />
          Quick Search
        </Typography>
        
        <TextField
          fullWidth
          placeholder="Type student name or classroom..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ mb: 2 }}
        />

        {/* Search Results */}
        {searchQuery.trim() && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Search Results:
            </Typography>
            <List dense>
              {filteredStudents.map((student) => (
                <ListItem key={student.id} disablePadding>
                  <ListItemButton dense onClick={() => handleStudentToggle(student.id)}>
                    <ListItemIcon>
                      <Checkbox
                        checked={selectedStudents.includes(student.id)}
                        edge="start"
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText primary={getStudentName(student)} secondary={`${student.classroom_name}`} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
            {filteredStudents.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No students found matching "{searchQuery}"
              </Typography>
            )}
          </Box>
        )}
      </Box>
                        
      {/* Divider */}
      {searchQuery.trim() && (
        <Divider sx={{ my: 2 }}>
          <Typography variant="body2" color="text.secondary">
            OR
          </Typography>
        </Divider>
      )}

      {/* Browse by Classroom Section */}
      <Box>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Group sx={{ fontSize: 20 }} />
          Browse by Classroom
        </Typography>

        <List>
          {studentsByClassroom.map((group) => {
            const selectionState = getClassroomSelectionState(group);
            const isExpanded = expandedClassrooms.includes(group.classroom.id);
            
            return (
              <Box key={group.classroom.id} sx={{ mb: 1 }}>
                {/* Classroom Header */}
                <ListItem disablePadding>
                  <ListItemButton 
                    dense
                    onClick={() => toggleClassroomExpansion(group.classroom.id)}
                    sx={{ 
                      backgroundColor: '#f8fafc',
                      borderRadius: 1,
                      mb: isExpanded ? 1 : 0
                    }}
                  >
                    <ListItemText
                      primary={group.classroom.name}
                      secondary={`${group.students.filter(s => selectedStudents.includes(s.id)).length}/${group.students.length} selected`}
                    />
                    <IconButton size="small">
                      {isExpanded ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                  </ListItemButton>
                </ListItem>

                {/* Students in Classroom */}
                <Collapse in={isExpanded}>
                  <List dense sx={{ pl: 4 }}>
                    {group.students.map((student) => (
                      <ListItem key={student.id} disablePadding>
                      <ListItemButton dense onClick={() => handleStudentToggle(student.id)}>
                          <ListItemIcon>
                            <Checkbox
                            checked={selectedStudents.includes(student.id)}
                              edge="start"
                              tabIndex={-1}
                              disableRipple
                            />
                          </ListItemIcon>
                          <ListItemText primary={getStudentName(student)} secondary={`UID: ${student.id}`} />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </Box>
            );
          })}
        </List>
      </Box>

      {/* Selected Students Summary */}
      {selectedStudents.length > 0 && (
        <Box sx={{ mt: 2, p: 2, backgroundColor: '#f0f9ff', borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Selected Students ({selectedStudents.length}):
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {selectedStudents.map(studentId => {
              const student = allStudents.find(s => (s.id || s.uid) === studentId);
              return student ? (
                <Chip
                  key={studentId}
                  label={getStudentName(student)}
                  size="small"
                  onDelete={() => handleStudentToggle(studentId)}
                  deleteIcon={<Person />}
                />
              ) : null;
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default ClassroomStudentPicker; 