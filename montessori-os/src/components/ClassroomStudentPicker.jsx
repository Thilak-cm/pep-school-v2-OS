import React, { useEffect, useState, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
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
  Tooltip,
  Stack,
  InputAdornment
} from '@mui/material';
import { ChevronDown as ExpandMore, ChevronUp as ExpandLess, User as Person, Users as Group, Pencil as Edit, X as Close, CircleCheck as CheckCircle, Sparkles as AutoFixHigh, RefreshCw as Refresh, Search } from '../icons';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cleanUpText } from '../textCleanup';
import { fuzzySearchStudents } from '../utils/fuzzySearch';

/*
Props:
  selectedStudents: array of student UIDs
  onStudentsChange: (array) => void
*/
const ClassroomStudentPicker = forwardRef(function ClassroomStudentPicker({
  selectedStudents,
  onStudentsChange,
  currentUser,
  userRole,
  textData,
  onTextDataChange,
  voiceData,
  onVoiceDataChange,
  onVoiceRecordAgain,
  voiceLoading = false,
  suggestedStudents = [],
  disabledStudentIds = [], // IDs to grey out and disable selection
  maxSelectable, // when set, disable unselected students once limit is reached
}, ref) {
  const [classrooms, setClassrooms] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedClassrooms, setExpandedClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [cleanedOnce, setCleanedOnce] = useState(!!textData?.cleaned);
  const [programMap, setProgramMap] = useState({}); // programId -> [classroomId]
  const [aliases, setAliases] = useState([]);
  const [expandedAliases, setExpandedAliases] = useState({});
  const [showBrowseSection, setShowBrowseSection] = useState(false);
  const searchInputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => searchInputRef.current?.focus(), 350);
    },
  }));

  // Edit mode state for text
  const [isEditing, setIsEditing] = useState(false);
  const [editableText, setEditableText] = useState('');
  const [_originalText, setOriginalText] = useState('');
  const [voiceEditing, setVoiceEditing] = useState(false);
  const [editableVoiceText, setEditableVoiceText] = useState('');
  const [originalVoiceText, setOriginalVoiceText] = useState('');
  const [voiceCleaning, setVoiceCleaning] = useState(false);
  const [voiceCleanedOnce, setVoiceCleanedOnce] = useState(false);
  const [voicePrevText, setVoicePrevText] = useState('');

  // Fetch all classrooms and students once
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch programs -> classroom mapping
        const programsSnap = await getDocs(collection(db, 'programs'));
        const pMap = {};
        programsSnap.forEach((doc) => {
          const data = doc.data() || {};
          const list = Array.isArray(data.classrooms) ? data.classrooms : [];
          const ids = list
            .map((p) => String(p))
            .map((p) => {
              const parts = p.split('/');
              return parts[parts.length - 1];
            });
          pMap[doc.id] = ids;
        });
        setProgramMap(pMap);
        
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
        
        // Load student aliases/groups
        if (currentUser?.uid) {
          try {
            const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
            const aliasMap = userSnap.exists() ? userSnap.data().studentAliases || {} : {};
            const aliasList = Object.values(aliasMap).map((alias) => ({
              ...alias,
              studentIds: Array.isArray(alias.studentIds) ? alias.studentIds : []
            }));
            aliasList.sort((a, b) => a.name.localeCompare(b.name));
            setAliases(aliasList);
          } catch { /* ignored */ }
        }
      } catch { /* ignored */ } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, userRole]);

  useEffect(() => {
    setVoiceEditing(false);
    setEditableVoiceText(voiceData?.text || '');
    setOriginalVoiceText(voiceData?.text || '');
  }, [voiceData]);

  const getStudentName = (s) => s?.name || s?.displayName || [s?.firstName, s?.lastName].filter(Boolean).join(' ') || 'Unnamed Student';

  // Use fuzzy search for better student matching
  const filteredStudents = useMemo(() => {
    return fuzzySearchStudents(allStudents, searchQuery);
  }, [allStudents, searchQuery]);

  // Create studentsById lookup
  const studentsById = useMemo(
    () => Object.fromEntries(allStudents.map((stu) => [stu.id, stu])),
    [allStudents]
  );

  // Filter aliases based on search query
  const aliasMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return aliases
      .map((alias) => {
        const memberIds = alias.studentIds || [];
        const members = memberIds
          .map((id) => studentsById[id])
          .filter(Boolean);
        const matchByName = alias.name.toLowerCase().includes(q);
        const matchByMember = members.some((student) =>
          getStudentName(student).toLowerCase().includes(q)
        );
        return {
          ...alias,
          members,
          hasMatch: matchByName || matchByMember
        };
      })
      .filter((alias) => alias.hasMatch);
  }, [aliases, searchQuery, studentsById]);

  // Hide suggested students once any overlap with current selection exists
  const showSuggestedStudents = useMemo(() => {
    if (!suggestedStudents || suggestedStudents.length === 0) return false;
    if (!selectedStudents || selectedStudents.length === 0) return true;
    const selectedSet = new Set(selectedStudents);
    return !suggestedStudents.some((s) => selectedSet.has(s.id));
  }, [suggestedStudents, selectedStudents]);

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

  // Build reverse index: classroomId -> programId
  const classroomToProgram = useMemo(() => {
    const map = {};
    Object.entries(programMap).forEach(([pid, ids]) => {
      (ids || []).forEach((cid) => {
        if (!map[cid]) map[cid] = pid;
      });
    });
    return map;
  }, [programMap]);

  // Sort available programs alphabetically
  const sortedProgramIds = useMemo(() => {
    const present = new Set();
    for (const group of studentsByClassroom) {
      const pid = classroomToProgram[group.classroom.id];
      if (pid) present.add(pid);
    }
    return Array.from(present).sort((a, b) => a.localeCompare(b));
  }, [studentsByClassroom, classroomToProgram]);

  // Group classrooms by program using programs collection; anything unmapped goes to 'unassigned'
  const groupedByProgram = useMemo(() => {
    const groups = {};
    for (const pid of sortedProgramIds) groups[pid] = [];
    const unassigned = [];
    for (const group of studentsByClassroom) {
      const pid = classroomToProgram[group.classroom.id];
      if (pid) {
        if (!groups[pid]) groups[pid] = [];
        groups[pid].push(group);
      } else {
        unassigned.push(group);
      }
    }
    return { groups, unassigned };
  }, [studentsByClassroom, classroomToProgram, sortedProgramIds]);

  const PROGRAM_TITLES = {
    adolescent: 'Adolescent',
    elementary: 'Elementary',
    primary: 'Primary',
    toddler: 'Toddler',
  };

  // Helper: is this student disabled?
  const isDisabled = (studentId) =>
    disabledStudentIds?.includes?.(studentId) ||
    (maxSelectable != null && selectedStudents.length >= maxSelectable && !selectedStudents.includes(studentId));

  // Handle student selection
  const handleStudentToggle = (studentId) => {
    if (isDisabled(studentId)) return; // do nothing for disabled student
    const newSelected = selectedStudents.includes(studentId)
      ? selectedStudents.filter(id => id !== studentId)
      : [...selectedStudents, studentId];
    onStudentsChange(newSelected);
  };

  const handleRemoveStudent = (studentId) => {
    if (isDisabled(studentId)) return;
    onStudentsChange(selectedStudents.filter((id) => id !== studentId));
  };

  // Handle alias/group selection
  const toggleAliasSelection = (alias) => {
    const members = alias.members || [];
    if (members.length === 0) return;
    
    const memberIds = members.map((s) => s.id);
    const allSelected = memberIds.every((id) => selectedStudents.includes(id));
    
    const newSelected = allSelected
      ? selectedStudents.filter((id) => !memberIds.includes(id))
      : [...new Set([...selectedStudents, ...memberIds])];
    
    onStudentsChange(newSelected);
    setExpandedAliases((prev) => ({ ...prev, [alias.id]: true }));
  };

  const toggleAliasExpanded = (aliasId) => {
    setExpandedAliases((prev) => ({ ...prev, [aliasId]: !prev[aliasId] }));
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
    } catch { /* ignored */ } finally {
      setCleaning(false);
    }
  };

  const startVoiceEditing = () => {
    setOriginalVoiceText(voiceData?.text || '');
    setEditableVoiceText(voiceData?.text || '');
    setVoiceEditing(true);
    // Reset polish state when entering edit mode
    setVoiceCleanedOnce(false);
    setVoicePrevText('');
  };

  const cancelVoiceEditing = () => {
    setVoiceEditing(false);
    setEditableVoiceText(originalVoiceText);
  };

  const saveVoiceEditing = () => {
    if (!editableVoiceText.trim()) return;
    if (onVoiceDataChange) {
      onVoiceDataChange({
        ...(voiceData || {}),
        text: editableVoiceText.trim(),
      });
    }
    setVoiceEditing(false);
    setOriginalVoiceText(editableVoiceText.trim());
    // Reset polish state when editing manually
    setVoiceCleanedOnce(false);
    setVoicePrevText('');
  };

  const handleRecordAgain = () => {
    setVoiceEditing(false);
    setEditableVoiceText('');
    setOriginalVoiceText('');
    // Reset polish state
    setVoiceCleaning(false);
    setVoiceCleanedOnce(false);
    setVoicePrevText('');
    if (onVoiceDataChange) onVoiceDataChange(null);
    if (onVoiceRecordAgain) onVoiceRecordAgain();
  };

  const handleVoiceCleanUp = async () => {
    const textToClean = voiceData?.text || '';
    if (!textToClean.trim() || voiceCleaning || voiceCleanedOnce) return;
    try {
      setVoiceCleaning(true);
      setVoicePrevText(textToClean);
      const refined = await cleanUpText(textToClean).catch(() => null);
      if (refined) {
        const cleanedText = String(refined).trim();
        if (onVoiceDataChange) {
          onVoiceDataChange({
            ...(voiceData || {}),
            text: cleanedText,
          });
        }
        setVoiceCleanedOnce(true);
      } else {
        setVoiceCleanedOnce(false);
      }
    } catch {
      setVoiceCleanedOnce(false);
    } finally {
      setVoiceCleaning(false);
    }
  };

  const handleVoiceUndoClean = () => {
    if (!voicePrevText) return;
    if (onVoiceDataChange) {
      onVoiceDataChange({
        ...(voiceData || {}),
        text: voicePrevText,
      });
    }
    setVoicePrevText('');
    setVoiceCleanedOnce(false);
  };


  const studentsLoading = loading;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {studentsLoading && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1.5,
            borderRadius: 2,
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)'
          }}
        >
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Coach Pepper is lining up classrooms and students…
          </Typography>
        </Box>
      )}

      {(voiceLoading || voiceData?.text) && (
        <Box
          sx={{
            padding: 3,
            backgroundColor: 'var(--color-blue-bg-light)',
            borderTop: '1px solid var(--color-border)',
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
                color: 'var(--color-text)',
                fontSize: '1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <CheckCircle size={16} />
              Transcription
            </Typography>
          </Box>

          <Paper
            sx={{
              padding: 2,
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              marginBottom: 2
            }}
          >
            {voiceLoading ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 1 }}>
                <CircularProgress size={24} sx={{ color: 'var(--color-secondary)' }} />
                <Typography variant="body2" sx={{ color: 'var(--grey-900)', fontWeight: 600, textAlign: 'center' }}>
                  Converting speech to text...
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                  This may take a few seconds
                </Typography>
              </Box>
            ) : voiceEditing ? (
              <TextField
                multiline
                rows={4}
                fullWidth
                value={editableVoiceText}
                onChange={(e) => setEditableVoiceText(e.target.value)}
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
                  color: 'var(--color-text)',
                  fontSize: '0.875rem',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
              >
                {voiceData?.text}
              </Typography>
            )}
          </Paper>

          {!voiceLoading && (
            voiceEditing ? (
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
                  onClick={cancelVoiceEditing}
                  startIcon={<Close />}
                  size="small"
                  sx={{
                    backgroundColor: 'var(--color-error)',
                    color: 'white',
                    textTransform: 'none',
                    '&:hover': {
                      backgroundColor: 'var(--color-error-dark)',
                    }
                  }}
                >
                  Cancel Edit
                </Button>
                
                <Button
                  variant="contained"
                  color="success"
                  onClick={saveVoiceEditing}
                  startIcon={<CheckCircle />}
                  size="small"
                  disabled={!editableVoiceText.trim()}
                  sx={{
                    backgroundColor: editableVoiceText.trim() ? 'var(--color-secondary)' : 'var(--grey-300)',
                    color: 'white',
                    textTransform: 'none',
                    '&:hover': {
                      backgroundColor: editableVoiceText.trim() ? 'var(--color-secondary-dark)' : 'var(--grey-300)',
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
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                {/* Polish with AI button row */}
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                  }}
                >
                  <Button
                    variant="contained"
                    onClick={handleVoiceCleanUp}
                    disabled={!voiceData?.text?.trim() || voiceCleaning || voiceCleanedOnce}
                    startIcon={voiceCleaning ? <CircularProgress size={16} color="inherit" /> : <AutoFixHigh />}
                    sx={{
                      textTransform: 'none',
                      backgroundImage: 'linear-gradient(90deg, var(--color-violet-dark), var(--color-pink-dark))',
                      color: 'white',
                      boxShadow: '0 6px 14px rgba(124, 58, 237, 0.35)',
                      '&:hover': {
                        backgroundImage: 'linear-gradient(90deg, var(--color-violet-deeper), var(--color-pink-darker))',
                        boxShadow: '0 8px 18px rgba(190, 24, 93, 0.35)'
                      },
                      '&.Mui-disabled': {
                        backgroundImage: 'none',
                        backgroundColor: 'var(--color-border)',
                        color: 'var(--color-text-soft)',
                        boxShadow: 'none'
                      }
                    }}
                  >
                    {voiceCleanedOnce ? 'Polished' : (voiceCleaning ? 'Polishing…' : 'Polish with AI')}
                  </Button>
                  {voiceCleanedOnce && voicePrevText && (
                    <Button 
                      variant="text" 
                      onClick={handleVoiceUndoClean} 
                      sx={{ color: 'var(--color-text-soft)', textTransform: 'none' }}
                    >
                      Undo
                    </Button>
                  )}
                </Box>
                
                {/* Other action buttons */}
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    justifyContent: 'center',
                    flexWrap: 'wrap'
                  }}
                >
                  <Button
                    variant="outlined"
                    onClick={handleRecordAgain}
                    startIcon={<Refresh />}
                    size="small"
                    sx={{
                      borderColor: 'var(--grey-300)',
                      color: 'var(--grey-600)',
                      backgroundColor: 'white',
                      textTransform: 'none',
                      '&:hover': {
                        borderColor: 'var(--color-text-faint)',
                        backgroundColor: 'var(--color-bg)',
                        color: 'var(--grey-700)',
                      }
                    }}
                  >
                    Record Again
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={startVoiceEditing}
                    startIcon={<Edit />}
                    size="small"
                    sx={{
                      borderColor: 'var(--grey-300)',
                      color: 'var(--grey-600)',
                      backgroundColor: 'white',
                      textTransform: 'none',
                      '&:hover': {
                        borderColor: 'var(--color-text-faint)',
                        backgroundColor: 'var(--color-bg)',
                        color: 'var(--grey-700)',
                      }
                    }}
                  >
                    Edit Text
                  </Button>
                </Box>
              </Box>
            )
          )}
        </Box>
      )}

      {/* Text Display Section - Same style as VoiceRecorder */}
      {textData?.text && (
        <Box
          sx={{
            padding: 3,
            backgroundColor: 'var(--color-blue-bg-light)',
            borderTop: '1px solid var(--color-border)',
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
                color: 'var(--color-text)',
                fontSize: '1rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <CheckCircle size={16} />
              Text Note
            </Typography>
          </Box>

          {/* Text Content */}
          <Paper
            sx={{
              padding: 2,
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
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
                  color: 'var(--color-text)',
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
                      backgroundImage: 'linear-gradient(90deg, var(--color-violet-dark), var(--color-pink-dark))',
                      color: 'white',
                      boxShadow: '0 6px 14px rgba(124, 58, 237, 0.35)',
                      '&:hover': {
                        backgroundImage: 'linear-gradient(90deg, var(--color-violet-deeper), var(--color-pink-darker))',
                        boxShadow: '0 8px 18px rgba(190, 24, 93, 0.35)'
                      },
                      '&.Mui-disabled': {
                        backgroundImage: 'none',
                        backgroundColor: 'var(--color-border)',
                        color: 'var(--color-text-soft)',
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
                  backgroundColor: 'var(--color-error)',
                  color: 'white',
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: 'var(--color-error-dark)',
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
                  backgroundColor: editableText.trim() ? 'var(--color-secondary)' : 'var(--grey-300)',
                  color: 'white',
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: editableText.trim() ? 'var(--color-secondary-dark)' : 'var(--grey-300)',
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
                  backgroundColor: 'var(--color-primary)',
                  color: 'white',
                  textTransform: 'none',
                  '&:hover': {
                    backgroundColor: 'var(--color-primary-dark)',
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

      {/* Suggested students from transcript (voice) */}
      {showSuggestedStudents && (
        <Box
          sx={{
            mt: 1,
            mb: 2,
            p: 2,
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            backgroundColor: 'var(--color-bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 1
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--grey-900)' }}>
            Suggested students:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {suggestedStudents.map((stu) => {
              const label = stu.fullName || getStudentName(studentsById[stu.id] || stu);
              const selected = selectedStudents.includes(stu.id);
              return (
                <Chip
                  key={stu.id}
                  label={label}
                  color={selected ? 'primary' : 'default'}
                  variant={selected ? 'filled' : 'outlined'}
                  onClick={() => handleStudentToggle(stu.id)}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {/* Selected Students Summary — shown above quick search */}
      {selectedStudents.length > 0 && (
        <Box sx={{ mt: 1, mb: 2, p: 2, backgroundColor: 'var(--color-blue-bg-light)', borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ m: 0 }}>
            {`Selected Students (${selectedStudents.length}):`}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
            {selectedStudents.map((id) => {
              const student = studentsById[id] || allStudents.find((s) => (s.id || s.uid) === id);
              const label = student ? getStudentName(student) : 'Unknown Student';
              return (
                <Chip
                  key={id}
                  label={label}
                  onDelete={() => handleRemoveStudent(id)}
                  deleteIcon={<Close size={20} />}
                  color="primary"
                  variant="outlined"
                />
              );
            })}
          </Box>
        </Box>
      )}

      {/* Search Section (compact) */}
      <Box>
        <Box sx={{ position: 'relative', mb: 2 }}>
          <TextField
            inputRef={searchInputRef}
            fullWidth
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={studentsLoading}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 999,
                backgroundColor: 'background.paper'
              }
            }}
          />
          {(!searchQuery || searchQuery.length === 0) && (
            <Box
              sx={{
                position: 'absolute',
                left: 44,
                right: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                overflow: 'hidden',
                pointerEvents: 'none',
                '@keyframes scrollPlaceholder': {
                  '0%': { transform: 'translateX(0%)' },
                  '45%': { transform: 'translateX(0%)' },
                  '100%': { transform: 'translateX(-55%)' }
                }
              }}
            >
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  animation: 'scrollPlaceholder 10s linear infinite'
                }}
              >
                Search students, classrooms, or groups
              </Typography>
            </Box>
          )}
        </Box>

        {/* Search Results */}
        {searchQuery.trim() && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Search Results:
            </Typography>

            {studentsLoading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Coach Pepper is checking the roster…
                </Typography>
              </Box>
            )}
            
            {/* Groups/Aliases */}
            {aliasMatches.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Groups
                </Typography>
                <Stack spacing={1}>
                  {aliasMatches.map((alias) => {
                    const members = alias.members || [];
                    const checkedCount = members.filter((stu) => selectedStudents.includes(stu.id)).length;
                    const allSelected = members.length > 0 && checkedCount === members.length;
                    const partiallySelected = checkedCount > 0 && !allSelected;
                    
                    return (
                      <Paper key={alias.id} variant="outlined" sx={{ borderRadius: 2, border: '1px solid var(--color-border)' }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            px: 1.5,
                            py: 1
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 32, color: 'var(--color-primary)' }}>
                            <Group />
                          </ListItemIcon>
                          <ListItemText
                            primary={alias.name}
                            secondary={`${checkedCount}/${members.length} selected`}
                            primaryTypographyProps={{ fontWeight: 700 }}
                          />
                          <Checkbox
                            edge="end"
                            checked={allSelected}
                            indeterminate={partiallySelected}
                            onChange={() => toggleAliasSelection(alias)}
                          />
                          <IconButton onClick={() => toggleAliasExpanded(alias.id)} size="small">
                            {expandedAliases[alias.id] ? <ExpandLess /> : <ExpandMore />}
                          </IconButton>
                        </Box>
                        <Collapse in={expandedAliases[alias.id]} timeout="auto" unmountOnExit>
                          <Divider />
                          <List dense disablePadding>
                            {members.map((student) => {
                              const disabled = isDisabled(student.id);
                              return (
                                <ListItem key={student.id} dense sx={{ px: 1.5, py: 0.5 }}>
                                  <ListItemIcon>
                                    <Checkbox
                                      checked={selectedStudents.includes(student.id)}
                                      edge="start"
                                      tabIndex={-1}
                                      disableRipple
                                      disabled={disabled}
                                      onChange={() => handleStudentToggle(student.id)}
                                    />
                                  </ListItemIcon>
                                  <ListItemText
                                    primary={getStudentName(student)}
                                    secondary={student.classroom_name || 'Unknown Classroom'}
                                  />
                                </ListItem>
                              );
                            })}
                            {members.length === 0 && (
                              <ListItem dense sx={{ px: 1.5, py: 1 }}>
                                <ListItemText
                                  primary="No students in this group."
                                  primaryTypographyProps={{ color: 'text.secondary' }}
                                />
                              </ListItem>
                            )}
                          </List>
                        </Collapse>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
            )}
            
            {/* Students */}
            {(aliasMatches.length > 0 || filteredStudents.length > 0) && (
              <Box>
                {aliasMatches.length > 0 && (
                  <Typography variant="subtitle2" sx={{ mb: 1, mt: 2, fontWeight: 600 }}>
                    Students
                  </Typography>
                )}
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
                              ? `${getStudentName(student)}${disabledStudentIds?.includes?.(student.id) ? ' (can\'t select this student, the note is already assigned to them)' : ' (only 1 student per photo note)'}`
                              : getStudentName(student)}
                            secondary={`${student.classroom_name}`}
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            )}
            
            {filteredStudents.length === 0 && aliasMatches.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No students or groups found matching "{searchQuery}"
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

      {/* Browse by Classroom Section (collapsible) */}
      <Box>
        <Button
          variant="outlined"
          startIcon={<Group />}
          endIcon={showBrowseSection ? <ExpandLess /> : <ExpandMore />}
          onClick={() => setShowBrowseSection((s) => !s)}
          sx={{
            mb: 1.5,
            textTransform: 'none',
            justifyContent: 'space-between',
            borderColor: 'var(--grey-300)',
            color: 'var(--grey-900)',
            backgroundColor: 'white',
            '&:hover': { borderColor: 'var(--color-text-faint)', backgroundColor: 'var(--color-bg)' },
            width: '100%',
          }}
        >
          Browse by Classroom
        </Button>

        <Collapse in={showBrowseSection} timeout="auto" unmountOnExit>
          {studentsLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                Coach Pepper is opening classrooms…
              </Typography>
            </Box>
          ) : (
            <List>
              {/* Helper function to render a classroom group */}
              {(() => {
                const renderClassroomGroup = (group) => {
                  const isExpanded = expandedClassrooms.includes(group.classroom.id);
                  
                  return (
                    <Box key={group.classroom.id} sx={{ mb: 1 }}>
                      {/* Classroom Header */}
                      <ListItem disablePadding>
                        <ListItemButton 
                          dense
                          onClick={() => toggleClassroomExpansion(group.classroom.id)}
                          sx={{ 
                            backgroundColor: 'var(--color-bg)',
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
                                      ? `${getStudentName(student)}${disabledStudentIds?.includes?.(student.id) ? ' (can\'t select this student, the note is already assigned to them)' : ' (only 1 student per photo note)'}`
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
                };

                return (
                  <>
                    {sortedProgramIds.map((pid) => {
                      const items = groupedByProgram.groups[pid] || [];
                      if (!items.length) return null;
                      const label = PROGRAM_TITLES[pid] || (pid.charAt(0).toUpperCase() + pid.slice(1));
                      return (
                        <Box key={pid} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                          <Divider
                            textAlign="left"
                            sx={{
                              fontWeight: 600,
                              fontSize: '0.85rem',
                              color: 'var(--color-text-soft)',
                              '&::before, &::after': {
                                borderColor: 'var(--color-border)',
                              },
                            }}
                          >
                            {label}
                          </Divider>
                          {items.map(renderClassroomGroup)}
                        </Box>
                      );
                    })}
                    {groupedByProgram.unassigned.length > 0 && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                        <Divider
                          textAlign="left"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            color: 'var(--color-text-soft)',
                            '&::before, &::after': { borderColor: 'var(--color-border)' },
                          }}
                        >
                          Unassigned
                        </Divider>
                        {groupedByProgram.unassigned.map(renderClassroomGroup)}
                      </Box>
                    )}
                  </>
                );
              })()}
            </List>
          )}
        </Collapse>
      </Box>

      {/* Bottom summary removed to avoid redundancy */}
    </Box>
  );
});

export default ClassroomStudentPicker; 
