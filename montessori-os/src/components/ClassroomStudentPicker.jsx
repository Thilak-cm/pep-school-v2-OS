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
  ListItemButton
} from '@mui/material';
import { 
  Search, 
  ExpandMore, 
  ExpandLess,
  Person,
  Group
} from '@mui/icons-material';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { db } from '../firebase';

/*
Props:
  selectedStudents: array of student UIDs
  onStudentsChange: (array) => void
*/
function ClassroomStudentPicker({
  selectedStudents,
  onStudentsChange
}) {
  const [classrooms, setClassrooms] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClassrooms, setExpandedClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all classrooms and students once
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch classrooms
        const classSnap = await getDocs(collection(db, 'classrooms'));
        const classList = classSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        console.log('Fetched classrooms:', classList);
        setClassrooms(classList);
        
        // Fetch all students
        const studentSnap = await getDocs(collection(db, 'students'));
        const studentList = studentSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        console.log('Fetched students:', studentList);
        
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
          console.log(`Student ${student.name}: classroomId=${student.classroomId}, parsed=${classroomId}, found=${classroom?.name || 'NOT FOUND'}`);
          
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
  }, []);

  // Filter students based on search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    return allStudents.filter(student => 
      student.name?.toLowerCase().includes(query) ||
      student.classroom_name?.toLowerCase().includes(query)
    );
  }, [allStudents, searchQuery]);

  // Group students by classroom
  const studentsByClassroom = useMemo(() => {
    const grouped = {};
    
    // First, create entries for all classrooms (even empty ones)
    classrooms.forEach(classroom => {
      grouped[classroom.id] = {
        classroom: {
          id: classroom.id,
          name: classroom.name
        },
        students: []
      };
    });
    
    // Then add students to their respective classrooms
    allStudents.forEach(student => {
      const classroomId = student.classroomId;
      if (grouped[classroomId]) {
        grouped[classroomId].students.push(student);
      } else {
        // If student has unknown classroom, create it
        if (!grouped[classroomId]) {
          grouped[classroomId] = {
            classroom: {
              id: classroomId,
              name: student.classroom_name || 'Unknown Classroom'
            },
            students: []
          };
        }
        grouped[classroomId].students.push(student);
      }
    });
    
    console.log('Students by classroom:', grouped);
    return Object.values(grouped);
  }, [allStudents, classrooms]);

  // Handle student selection
  const handleStudentToggle = (studentId) => {
    const newSelected = selectedStudents.includes(studentId)
      ? selectedStudents.filter(id => id !== studentId)
      : [...selectedStudents, studentId];
    onStudentsChange(newSelected);
  };

  // Handle classroom selection (select all students in classroom)
  const handleClassroomToggle = (classroomId) => {
    const classroom = studentsByClassroom.find(g => g.classroom.id === classroomId);
    if (!classroom) return;

    const classroomStudentIds = classroom.students.map(s => s.sid || s.id);
    const allSelected = classroomStudentIds.every(id => selectedStudents.includes(id));
    
    let newSelected;
    if (allSelected) {
      // Deselect all students in this classroom
      newSelected = selectedStudents.filter(id => !classroomStudentIds.includes(id));
    } else {
      // Select all students in this classroom
      newSelected = [...new Set([...selectedStudents, ...classroomStudentIds])];
    }
    
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

  // Get selection state for classroom
  const getClassroomSelectionState = (classroom) => {
    const studentIds = classroom.students.map(s => s.sid || s.id);
    const selectedCount = studentIds.filter(id => selectedStudents.includes(id)).length;
    
    if (selectedCount === 0) return 'unchecked';
    if (selectedCount === studentIds.length) return 'checked';
    return 'indeterminate';
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
                  <ListItemButton dense onClick={() => handleStudentToggle(student.sid || student.id)}>
                    <ListItemIcon>
                      <Checkbox
                        checked={selectedStudents.includes(student.sid || student.id)}
                        edge="start"
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={student.name}
                      secondary={`${student.classroom_name}`}
                    />
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
                    <ListItemIcon>
                      <Checkbox
                        checked={selectionState === 'checked'}
                        indeterminate={selectionState === 'indeterminate'}
                        onChange={() => handleClassroomToggle(group.classroom.id)}
                        onClick={(e) => e.stopPropagation()}
                        edge="start"
                        tabIndex={-1}
                        disableRipple
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={group.classroom.name}
                      secondary={`${group.students.length} student${group.students.length !== 1 ? 's' : ''}`}
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
                        <ListItemButton dense onClick={() => handleStudentToggle(student.sid || student.id)}>
                          <ListItemIcon>
                            <Checkbox
                              checked={selectedStudents.includes(student.sid || student.id)}
                              edge="start"
                              tabIndex={-1}
                              disableRipple
                            />
                          </ListItemIcon>
                          <ListItemText
                            primary={student.name}
                            secondary={`UID: ${student.sid || student.id}`}
                          />
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
                  label={student.name}
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