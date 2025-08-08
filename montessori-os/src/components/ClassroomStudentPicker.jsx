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
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/*
Props:
  selectedStudents: array of student UIDs
  onStudentsChange: (array) => void
*/
function ClassroomStudentPicker({
  selectedStudents,
  onStudentsChange,
  currentUser,
  userRole
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
        
        // Fetch classrooms based on user role
        let classList = [];
        
        // Get teacher's assigned classrooms first (for both teacher and admin)
        let assignedClassroomNames = [];
        if (userRole === 'teacher') {
          // Get user document using UID
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          if (!userDocSnap.exists()) {
            console.error('Teacher not found');
            return;
          }

          const teacherData = userDocSnap.data();
          assignedClassroomNames = teacherData.assignedClassrooms || [];
          console.log('Teacher assigned classrooms:', assignedClassroomNames);
        }

        // Get all classrooms
        const allClassroomsSnap = await getDocs(collection(db, 'classrooms'));
        const allClassrooms = allClassroomsSnap.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        }));

        // Filter classrooms based on user role
        if (userRole === 'teacher') {
          classList = allClassrooms.filter(cls => 
            assignedClassroomNames.includes(cls.name)
          );
          console.log('Filtered classrooms for teacher:', classList);
        } else {
          // For admins: get all classrooms
          classList = allClassrooms;
        }
        
        console.log('Fetched classrooms:', classList);
        setClassrooms(classList);
        
        // Fetch students based on user role
        let studentList = [];
        
        if (userRole === 'teacher') {
          // For teachers: only get students from their assigned classrooms
          console.log('Teacher assigned classrooms for student filtering:', assignedClassroomNames);

          // Get all students and filter by assigned classrooms
          const allStudentsSnap = await getDocs(collection(db, 'students'));
          const allStudents = allStudentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          
          // Filter students to only those in assigned classrooms
          studentList = allStudents.filter(student => {
            // Handle different classroomID formats
            let classroomID;
            if (student.classroomID) {
              if (typeof student.classroomID === 'object' && student.classroomID.id) {
                classroomID = student.classroomID.id;
              } else if (typeof student.classroomID === 'string') {
                classroomID = student.classroomID.includes('/') 
                  ? student.classroomID.split('/').pop() 
                  : student.classroomID;
              } else {
                classroomID = student.classroomID;
              }
            }
            
            // Find the classroom name for this student
            const studentClassroom = allClassrooms.find(c => c.id === classroomID);
            const isInAssignedClassroom = studentClassroom && assignedClassroomNames.includes(studentClassroom.name);
            
            console.log(`Student ${student.name}: classroomID=${classroomID}, classroom=${studentClassroom?.name || 'unknown'}, assigned=${isInAssignedClassroom}`);
            
            return isInAssignedClassroom;
          });
          
          console.log('Filtered students for teacher:', studentList);
        } else {
          // For admins: get all students
          const studentSnap = await getDocs(collection(db, 'students'));
          studentList = studentSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        
        console.log('Fetched students:', studentList);
        
        // Add classroom name to each student for display
        const studentsWithClassroom = studentList.map(student => {
          // Handle different classroomID formats
          let classroomID;
          if (student.classroomID) {
            if (typeof student.classroomID === 'object' && student.classroomID.id) {
              // DocumentReference object
              classroomID = student.classroomID.id;
            } else if (typeof student.classroomID === 'string') {
              // String format - could be just ID or full path
              classroomID = student.classroomID.includes('/') 
                ? student.classroomID.split('/').pop() 
                : student.classroomID;
            } else {
              classroomID = student.classroomID;
            }
          }
          
          const classroom = classList.find(c => c.id === classroomID);
          console.log(`Student ${student.name}: classroomID=${student.classroomID}, parsed=${classroomID}, found=${classroom?.name || 'NOT FOUND'}`);
          
          return {
            ...student,
            classroom_name: classroom?.name || 'Unknown Classroom',
            classroomID: classroomID
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

  // Filter students based on search query (only from filtered students)
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
    
    // Only create entries for classrooms that have students
    allStudents.forEach(student => {
      const classroomID = student.classroomID;
      if (!grouped[classroomID]) {
        // Find the classroom in our filtered classrooms list
        const classroom = classrooms.find(c => c.id === classroomID);
        if (classroom) {
          grouped[classroomID] = {
            classroom: {
              id: classroom.id,
              name: classroom.name
            },
            students: []
          };
        }
      }
      
      if (grouped[classroomID]) {
        grouped[classroomID].students.push(student);
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
  const handleClassroomToggle = (classroomID) => {
    const classroom = studentsByClassroom.find(g => g.classroom.id === classroomID);
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
  const toggleClassroomExpansion = (classroomID) => {
    setExpandedClassrooms(prev => 
      prev.includes(classroomID)
        ? prev.filter(id => id !== classroomID)
        : [...prev, classroomID]
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
                      secondary={(() => {
                        const studentIds = group.students.map(s => s.sid || s.id);
                        const selectedCount = studentIds.filter(id => selectedStudents.includes(id)).length;
                        const totalCount = group.students.length;
                        return `${selectedCount} out of ${totalCount} student${totalCount !== 1 ? 's' : ''} selected`;
                      })()}
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