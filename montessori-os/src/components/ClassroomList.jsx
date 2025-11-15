// ClassroomList.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Card,
  CardContent,
  CardActionArea,
  Avatar,
  TextField,
  InputAdornment,
  Divider,
  Tabs,
  Tab,
  Button,
} from '@mui/material';
import { School, Group, ArrowForward, Search, Person, ExpandMore } from '@mui/icons-material';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { fuzzySearchClassrooms, fuzzySearchStudents } from '../utils/fuzzySearch';

const CACHE_KEY_PREFIX = 'classroomListCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const buildCacheKey = (uid, role) =>
  `${CACHE_KEY_PREFIX}:${role || 'unknown'}:${uid || 'anonymous'}`;

const readCachedClassrooms = (key) => {
  if (typeof window === 'undefined' || !window?.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('Unable to read classroom cache', err);
    return null;
  }
};

const writeCachedClassrooms = (key, payload) => {
  if (typeof window === 'undefined' || !window?.localStorage) return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...payload,
        timestamp: Date.now(),
      })
    );
  } catch (err) {
    console.warn('Unable to persist classroom cache', err);
  }
};

function ClassroomList({ onSelectClassroom, currentUser, userRole, onNavigateToStudent }) {
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentCounts, setStudentCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [programMap, setProgramMap] = useState({}); // programId -> [classroomId]
  const [activeTab, setActiveTab] = useState(0); // 0 = Classrooms, 1 = Students
  const [allStudents, setAllStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [classroomMap, setClassroomMap] = useState({}); // classroomId -> classroom name
  const [displayedStudentsCount, setDisplayedStudentsCount] = useState(10); // Show first 10, then 10 more on each expansion

  useEffect(() => {
    let isMounted = true;
    const cacheKey = buildCacheKey(currentUser?.uid, userRole);
    const cached = readCachedClassrooms(cacheKey);

    if (cached) {
      setProgramMap(cached.programMap || {});
      setClassrooms(cached.classrooms || []);
      setStudentCounts(cached.studentCounts || {});
      setLoading(false);
    } else {
      setLoading(true);
    }

    const fetchClassrooms = async () => {
      try {
        let classroomsToShow = [];

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
        if (!isMounted) return;

        setProgramMap(pMap);

        if (userRole === 'teacher') {
          // Get all classrooms first (should work with list permission)
          const allClassroomsQuery = query(collection(db, 'classrooms'));
          const allClassroomsSnap = await getDocs(allClassroomsQuery);
          
          // Filter client-side to show only classrooms where teacher is assigned
          const allClassrooms = allClassroomsSnap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
          }));
          
          // Filter to only show classrooms where this teacher is assigned
          classroomsToShow = allClassrooms
            // exclude archived classrooms
            .filter(classroom => (classroom.status || 'active') !== 'archived')
            .filter(classroom => {
            return classroom.teacherIds && classroom.teacherIds.includes(currentUser.uid);
          });
        } else {
          // For admins: get all classrooms
          const q = query(collection(db, 'classrooms'), where('status', '==', 'active'));
          const qSnap = await getDocs(q);
          classroomsToShow = qSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        }

        // Exclude any classrooms labeled as "Adolescent" by name (case-insensitive)
        classroomsToShow = classroomsToShow.filter(c => {
          const name = String(c?.name || '').toLowerCase();
          return !name.includes('adolescent');
        });

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
        writeCachedClassrooms(cacheKey, {
          classrooms: classroomsToShow,
          studentCounts: counts,
          programMap: pMap,
        });
      } catch (err) {
        console.error('Error fetching classrooms', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (!cached) {
      fetchClassrooms();
    }

    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid, userRole]);

  // Fetch all students when Students tab is active
  useEffect(() => {
    if (activeTab !== 1) return; // Only fetch when Students tab is active

    let isMounted = true;
    setStudentsLoading(true);

    const fetchAllStudents = async () => {
      try {
        let studentsToShow = [];
        let classroomIdsToFetch = new Set();

        if (userRole === 'teacher') {
          // For teachers: get students from their assigned classrooms only
          if (classrooms.length === 0) {
            setAllStudents([]);
            setStudentsLoading(false);
            return;
          }

          const assignedClassroomIds = classrooms.map(c => c.id);
          
          // Handle batching if more than 10 classrooms (Firestore 'in' limit is 10)
          if (assignedClassroomIds.length > 10) {
            const allStudentPromises = [];
            for (let i = 0; i < assignedClassroomIds.length; i += 10) {
              const batch = assignedClassroomIds.slice(i, i + 10);
              const batchQuery = query(
                collection(db, 'students'),
                where('classroomId', 'in', batch)
              );
              allStudentPromises.push(getDocs(batchQuery));
            }
            const allSnapshots = await Promise.all(allStudentPromises);
            allSnapshots.forEach(snapshot => {
              snapshot.docs.forEach(doc => {
                studentsToShow.push({ id: doc.id, ...doc.data() });
                if (doc.data().classroomId) classroomIdsToFetch.add(doc.data().classroomId);
              });
            });
          } else {
            const studentsQuery = query(
              collection(db, 'students'),
              where('classroomId', 'in', assignedClassroomIds)
            );
            const studentsSnap = await getDocs(studentsQuery);
            studentsSnap.docs.forEach(doc => {
              studentsToShow.push({ id: doc.id, ...doc.data() });
              if (doc.data().classroomId) classroomIdsToFetch.add(doc.data().classroomId);
            });
          }
        } else {
          // For admins: get all students
          const studentsQuery = query(collection(db, 'students'));
          const studentsSnap = await getDocs(studentsQuery);
          studentsSnap.docs.forEach(doc => {
            studentsToShow.push({ id: doc.id, ...doc.data() });
            if (doc.data().classroomId) classroomIdsToFetch.add(doc.data().classroomId);
          });
        }

        // Fetch classroom names for display
        const classroomNameMap = {};
        const classroomPromises = Array.from(classroomIdsToFetch).map(async (classroomId) => {
          try {
            const classroomDoc = await getDoc(doc(db, 'classrooms', classroomId));
            if (classroomDoc.exists()) {
              classroomNameMap[classroomId] = classroomDoc.data().name || classroomId;
            }
          } catch (err) {
            console.error(`Error fetching classroom ${classroomId}:`, err);
          }
        });
        await Promise.all(classroomPromises);

        if (!isMounted) return;

        setClassroomMap(classroomNameMap);
        setAllStudents(studentsToShow);
      } catch (err) {
        console.error('Error fetching all students:', err);
        if (isMounted) {
          setAllStudents([]);
        }
      } finally {
        if (isMounted) {
          setStudentsLoading(false);
        }
      }
    };

    fetchAllStudents();

    return () => {
      isMounted = false;
    };
  }, [activeTab, classrooms, userRole]);

  // Use fuzzy search for better matching
  const visibleClassrooms = fuzzySearchClassrooms(classrooms, activeTab === 0 ? searchQuery : '');
  
  // Filter students based on search query
  const filteredStudents = useMemo(() => {
    if (activeTab !== 1) return [];
    return fuzzySearchStudents(allStudents, searchQuery);
  }, [allStudents, searchQuery, activeTab]);

  // Sort students alphabetically
  const sortedFilteredStudents = useMemo(() => {
    const getName = (s) => (
      s?.name || s?.displayName || [s?.firstName, s?.lastName].filter(Boolean).join(' ') || ''
    ).trim();
    return [...filteredStudents].sort((a, b) => getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' }));
  }, [filteredStudents]);

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
    for (const c of visibleClassrooms) {
      const pid = classroomToProgram[c.id];
      if (pid) present.add(pid);
    }
    return Array.from(present).sort((a, b) => a.localeCompare(b));
  }, [visibleClassrooms, classroomToProgram]);

  // Group classrooms by program using programs collection; anything unmapped goes to 'unassigned'
  const groupedByProgram = useMemo(() => {
    const groups = {};
    for (const pid of sortedProgramIds) groups[pid] = [];
    const unassigned = [];
    for (const c of visibleClassrooms) {
      const pid = classroomToProgram[c.id];
      if (pid) {
        if (!groups[pid]) groups[pid] = [];
        groups[pid].push(c);
      } else {
        unassigned.push(c);
      }
    }
    return { groups, unassigned };
  }, [visibleClassrooms, classroomToProgram, sortedProgramIds]);

  const PROGRAM_TITLES = {
    adolescent: 'Adolescent',
    elementary: 'Elementary',
    primary: 'Primary',
    toddler: 'Toddler',
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    // Clear search when switching tabs
    setSearchQuery('');
  };

  const handleStudentClick = (student) => {
    if (onNavigateToStudent) {
      onNavigateToStudent(student);
    }
  };

  const handleShowMoreStudents = () => {
    setDisplayedStudentsCount(prev => prev + 10);
  };

  // Reset displayed count when switching tabs, changing search, or when students list changes
  useEffect(() => {
    if (activeTab === 1) {
      setDisplayedStudentsCount(10);
    }
  }, [activeTab, searchQuery, allStudents.length]);

  // Get students to display (paginated)
  const studentsToDisplay = useMemo(() => {
    return sortedFilteredStudents.slice(0, displayedStudentsCount);
  }, [sortedFilteredStudents, displayedStudentsCount]);

  const renderCard = (classroom) => (
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
      <CardActionArea onClick={() => onSelectClassroom(classroom)} sx={{ p: 0 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: '#4f46e5', width: 48, height: 48 }}>
                <School />
              </Avatar>
              <Box>
                <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
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
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header - different for teachers vs admins */}
      {userRole === 'teacher' ? (
        // Teacher header - removed welcome message
        null
      ) : (
        // Admin header with search
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <TextField
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 0 ? "Search classrooms…" : "Search students…"}
            aria-label={activeTab === 0 ? "Search classrooms" : "Search students"}
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
      )}

      {/* Optional search for teachers */}
      {userRole === 'teacher' && (
        <TextField
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={activeTab === 0 ? "Search classrooms…" : "Search students…"}
          aria-label={activeTab === 0 ? "Search classrooms" : "Search students"}
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
      )}

      {/* Tabs */}
      <Box sx={{ 
        backgroundColor: 'white',
        borderRadius: 1,
        overflow: 'hidden',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            '& .MuiTab-root': {
              minHeight: 48,
              textTransform: 'none',
              fontWeight: 500
            }
          }}
        >
          <Tab 
            icon={<School />} 
            label="Classrooms" 
            iconPosition="start"
            aria-label="View classrooms"
          />
          <Tab 
            icon={<Person />} 
            label="Students" 
            iconPosition="start"
            aria-label="View all students"
          />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {loading ? (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              minHeight: '200px'
            }}>
              <CircularProgress size={32} />
            </Box>
          ) : visibleClassrooms.length === 0 ? (
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
            <>
              {sortedProgramIds.map((pid) => {
                const items = groupedByProgram.groups[pid] || [];
                if (!items.length) return null;
                const label = PROGRAM_TITLES[pid] || (pid.charAt(0).toUpperCase() + pid.slice(1));
                return (
                  <Box key={pid} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Divider
                      textAlign="left"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        color: '#64748b',        // slate-500
                        '&::before, &::after': {
                          borderColor: '#e2e8f0', // slate-200
                        },
                      }}
                    >
                      {label}
                    </Divider>
                    {items.map(renderCard)}
                  </Box>
                );
              })}
              {groupedByProgram.unassigned.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Divider
                    textAlign="left"
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      color: '#64748b',
                      '&::before, &::after': { borderColor: '#e2e8f0' },
                    }}
                  >
                    Unassigned
                  </Divider>
                  {groupedByProgram.unassigned.map(renderCard)}
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      {activeTab === 1 && (
        <Box sx={{ 
          backgroundColor: 'white',
          borderRadius: 1,
          p: 2,
          minHeight: '200px'
        }}>
          {/* Students Count */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {searchQuery 
                ? `${sortedFilteredStudents.length} student${sortedFilteredStudents.length !== 1 ? 's' : ''} found`
                : `Showing ${studentsToDisplay.length} of ${sortedFilteredStudents.length} student${sortedFilteredStudents.length !== 1 ? 's' : ''}`
              }
            </Typography>
          </Box>

          {/* Students List */}
          {studentsLoading ? (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              minHeight: '200px'
            }}>
              <CircularProgress size={32} />
            </Box>
          ) : sortedFilteredStudents.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Person sx={{ fontSize: 48, color: '#94a3b8', mb: 2 }} />
              <Typography variant="body2" color="text.secondary">
                {searchQuery ? `No students found matching "${searchQuery}"` : 'No students found'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {studentsToDisplay.map((student) => (
                <StudentCard
                  key={student.id}
                  student={student}
                  classroomName={classroomMap[student.classroomId] || student.classroomId || 'Unassigned'}
                  onClick={() => handleStudentClick(student)}
                />
              ))}
              
              {/* Show More Button */}
              {sortedFilteredStudents.length > displayedStudentsCount && (
                <Box sx={{ textAlign: 'center', pt: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={handleShowMoreStudents}
                    startIcon={<ExpandMore />}
                    sx={{ textTransform: 'none' }}
                  >
                    Show 10 More
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// StudentCard component for displaying individual students in the Students tab
function StudentCard({ student, classroomName, onClick }) {
  const studentName = student.displayName || `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unknown Student';

  return (
    <Card
      sx={{
        cursor: 'pointer',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
        transition: 'all 0.2s ease-in-out',
      }}
      onClick={onClick}
      aria-label={`View timeline for ${studentName}`}
    >
      <CardContent sx={{ p: 2 }}>
        {/* Student Name - Prominent */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Person sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography 
            variant="subtitle2" 
            sx={{ 
              fontWeight: 600, 
              color: 'primary.main'
            }}
          >
            {studentName}
          </Typography>
        </Box>

        {/* Classroom */}
        {classroomName && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <School sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              {classroomName}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default ClassroomList; 
