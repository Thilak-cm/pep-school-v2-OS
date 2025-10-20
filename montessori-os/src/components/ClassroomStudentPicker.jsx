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
  Button,
  Tooltip
} from '@mui/material';
import { 
  ExpandMore, 
  ExpandLess,
  Person,
  Group,
  Edit,
  Close,
  CheckCircle,
  AutoFixHigh
} from '@mui/icons-material';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { cleanUpText } from '../textCleanup';
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
  onTextDataChange,
  disabledStudentIds = [], // IDs to grey out and disable selection
}) {
  const [classrooms, setClassrooms] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClassrooms, setExpandedClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [cleanedOnce, setCleanedOnce] = useState(!!textData?.cleaned);
  
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
          // Filter out archived rooms client-side to avoid composite index requirement
          const activeTeacherClassrooms = teacherClassrooms.filter(c => (c.status || 'active') !== 'archived');
          
          // Get classroom names for filtering students later
          assignedClassroomNames = activeTeacherClassrooms.map(cls => cls.name);
          
          // Set classrooms directly from the query
          classList = activeTeacherClassrooms;
          
          // Update the classrooms state for the Browse by Classroom section
          setClassrooms(classList);
        } else {
          // For admins: get all classrooms
          const allClassroomsSnap = await getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active')));
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

  // Helper: is this student disabled?
  const isDisabled = (studentId) => disabledStudentIds?.includes?.(studentId);

  // Handle student selection
  const handleStudentToggle = (studentId) => {
    if (isDisabled(studentId)) return; // do nothing for disabled student
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
        text: editableText.trim(),
        cleaned: cleanedOnce || textData?.cleaned || false
      });
    }
    
    setIsEditing(false);
    setEditableText('');
    setOriginalText('');
  };

  const runCleanup = async () => {
    if (!editableText.trim() || cleaning || cleanedOnce) return;
    try {
      setCleaning(true);
      const refined = await cleanUpText(editableText).catch(() => null);
      if (refined) {
        setEditableText(String(refined).trim());
        setCleanedOnce(true);
      } else {
        // No change if cleanup failed
        setCleanedOnce(false);
      }
    } catch (e) {
      console.error('Cleanup error:', e);
    } finally {
      setCleaning(false);
    }
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
              <Tooltip title={cleanedOnce ? 'Already cleaned' : 'AI-powered: fixes capitalization, paragraphs, and structure'}>
                <span>
                  <Button
                    variant="contained"
                    onClick={runCleanup}
                    size="small"
                    startIcon={cleaning ? <CircularProgress size={14} color="inherit" /> : <AutoFixHigh />}
                    disabled={!editableText.trim() || cleaning || cleanedOnce}
                    sx={{
                      textTransform: 'none',
                      backgroundImage: 'linear-gradient(90deg, #7c3aed, #db2777)',
                      color: 'white',
                      boxShadow: '0 6px 14px rgba(124, 58, 237, 0.35)',
                      '&:hover': {
                        backgroundImage: 'linear-gradient(90deg, #6d28d9, #be185d)',
                        boxShadow: '0 8px 18px rgba(190, 24, 93, 0.35)'
                      },
                      '&.Mui-disabled': {
                        backgroundImage: 'none',
                        backgroundColor: '#e2e8f0',
                        color: '#64748b',
                        boxShadow: 'none'
                      }
                    }}
                  >
                    {cleanedOnce ? 'Cleaned' : (cleaning ? 'Cleaning…' : 'Clean Up')}
                  </Button>
                </span>
              </Tooltip>
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

      {/* Removed instructional divider for compactness on mobile */}

      {/* Selected Students Summary (text-only) — shown above quick search */}
      {selectedStudents.length > 0 && (
        <Box sx={{ mt: 1, mb: 2, p: 2, backgroundColor: '#f0f9ff', borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ m: 0 }}>
            {(() => {
              const names = selectedStudents
                .map((id) => allStudents.find((s) => (s.id || s.uid) === id))
                .filter(Boolean)
                .map((s) => getStudentName(s));
              return `Selected Students (${selectedStudents.length}): ${names.join(', ')}`;
            })()}
          </Typography>
        </Box>
      )}

      {/* Search Section (compact) */}
      <Box>
        <Box sx={{ position: 'relative', mb: 2 }}>
          <TextField
            fullWidth
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {(!searchQuery || searchQuery.length === 0) && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              Quick search for student or classroom
            </Typography>
          )}
        </Box>

        {/* Search Results */}
        {searchQuery.trim() && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Search Results:
            </Typography>
            <List dense>
              {filteredStudents.map((student) => {
                const disabled = isDisabled(student.id);
                return (
                  <ListItem key={student.id} disablePadding>
                    <ListItemButton
                      dense
                      onClick={() => handleStudentToggle(student.id)}
                      disabled={disabled}
                      sx={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                    >
                      <ListItemIcon>
                        <Checkbox
                          checked={selectedStudents.includes(student.id)}
                          edge="start"
                          tabIndex={-1}
                          disableRipple
                          disabled={disabled}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={disabled
                          ? `${getStudentName(student)} (can't select this student, the note is already assigned to them)`
                          : getStudentName(student)}
                        secondary={`${student.classroom_name}`}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
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
                    {group.students.map((student) => {
                      const disabled = isDisabled(student.id);
                      return (
                        <ListItem key={student.id} disablePadding>
                          <ListItemButton
                            dense
                            onClick={() => handleStudentToggle(student.id)}
                            disabled={disabled}
                            sx={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                          >
                            <ListItemIcon>
                              <Checkbox
                                checked={selectedStudents.includes(student.id)}
                                edge="start"
                                tabIndex={-1}
                                disableRipple
                                disabled={disabled}
                              />
                            </ListItemIcon>
                            <ListItemText
                              primary={disabled
                                ? `${getStudentName(student)} (can't select this student, the note is already assigned to them)`
                                : getStudentName(student)}
                            />
                          </ListItemButton>
                        </ListItem>
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            );
          })}
        </List>
      </Box>

      {/* Bottom summary removed to avoid redundancy */}
    </Box>
  );
}

export default ClassroomStudentPicker; 
