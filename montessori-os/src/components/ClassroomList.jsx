// ClassroomList.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  Avatar,
  TextField,
  InputAdornment,
  Divider,
  Button,
  Collapse,
} from '@mui/material';
import { School, Group, ArrowForward, Search, Person, ExpandMore, ExpandLess } from '@mui/icons-material';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { genericFuzzySearch } from '../utils/fuzzySearch';

const CACHE_KEY_PREFIX = 'classroomListCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const buildCacheKey = (uid, role, manageablePrograms = []) => {
  const programKey = Array.isArray(manageablePrograms) && manageablePrograms.length
    ? manageablePrograms.slice().sort().join('|')
    : 'all-programs';
  return `${CACHE_KEY_PREFIX}:${role || 'unknown'}:${uid || 'anonymous'}:${programKey}`;
};

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

const normalizeClassroomId = (value) => {
  if (!value) return '';
  if (typeof value === 'object' && value.id) return value.id;
  if (typeof value === 'string') {
    const parts = value.split('/');
    return parts[parts.length - 1] || value;
  }
  return value;
};

const getStudentName = (student) => (
  student?.displayName ||
  student?.name ||
  [student?.firstName, student?.lastName].filter(Boolean).join(' ')
).trim() || 'Unknown Student';

function ClassroomList({ onSelectClassroom, currentUser, userRole, manageablePrograms = [], onNavigateToStudent }) {
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentCounts, setStudentCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [programMap, setProgramMap] = useState({}); // programId -> [classroomId]
  const [allStudents, setAllStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [classroomMap, setClassroomMap] = useState({}); // classroomId -> classroom name
  const [expandedClassroomId, setExpandedClassroomId] = useState(null);
  const isProgramAdmin = userRole === 'admin';

  useEffect(() => {
    let isMounted = true;
    const cacheKey = buildCacheKey(currentUser?.uid, userRole, manageablePrograms);
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
          // For admins: scope by manageablePrograms for program admins
          if (isProgramAdmin && manageablePrograms.length === 0) {
            classroomsToShow = [];
          } else {
            const constraints = [where('status', '==', 'active')];
            if (isProgramAdmin) {
              constraints.push(where('programId', 'in', manageablePrograms));
            }
            const q = query(collection(db, 'classrooms'), ...constraints);
            const qSnap = await getDocs(q);
            classroomsToShow = qSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          }
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
  }, [currentUser?.uid, userRole, manageablePrograms]);

  // Fetch all students once classrooms are known
  useEffect(() => {
    if (loading) return;

    let isMounted = true;
    setStudentsLoading(true);

    const fetchAllStudents = async () => {
      try {
        let studentsToShow = [];
        const classroomIdsToFetch = new Set();

        const addStudent = (doc) => {
          const data = doc.data() || {};
          const normalizedClassroomId = normalizeClassroomId(data.classroomId);
          studentsToShow.push({
            id: doc.id,
            ...data,
            normalizedClassroomId,
          });
          if (normalizedClassroomId) classroomIdsToFetch.add(normalizedClassroomId);
        };

        if (userRole === 'teacher') {
          // For teachers: get students from their assigned classrooms only
          if (classrooms.length === 0) {
            if (isMounted) {
              setAllStudents([]);
            }
            return;
          }

          const assignedClassroomIds = classrooms.map((c) => c.id);
          const batchSize = 10;
          for (let i = 0; i < assignedClassroomIds.length; i += batchSize) {
            const batch = assignedClassroomIds.slice(i, i + batchSize);
            const batchQuery = query(collection(db, 'students'), where('classroomId', 'in', batch));
            const batchSnapshot = await getDocs(batchQuery);
            batchSnapshot.docs.forEach(addStudent);
          }
        } else if (isProgramAdmin) {
          const allowedClassroomIds = classrooms.map((c) => c.id);
          if (allowedClassroomIds.length) {
            const batchSize = 10;
            for (let i = 0; i < allowedClassroomIds.length; i += batchSize) {
              const batch = allowedClassroomIds.slice(i, i + batchSize);
              const studentsQuery = query(collection(db, 'students'), where('classroomId', 'in', batch));
              const studentsSnap = await getDocs(studentsQuery);
              studentsSnap.docs.forEach(addStudent);
            }
          }
        } else {
          // For super admins: get all students
          const studentsQuery = query(collection(db, 'students'));
          const studentsSnap = await getDocs(studentsQuery);
          studentsSnap.docs.forEach(addStudent);
        }

        // Fetch classroom names for display
        const classroomNameMap = {};
        classrooms.forEach((c) => {
          if (c?.id) classroomNameMap[c.id] = c.name || c.id;
        });

        const missingClassroomIds = Array.from(classroomIdsToFetch).filter((id) => !classroomNameMap[id]);
        const classroomPromises = missingClassroomIds.map(async (classroomId) => {
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
        const studentsWithNames = studentsToShow.map((student) => {
          const normalizedClassroomId = student.normalizedClassroomId || normalizeClassroomId(student.classroomId);
          return {
            ...student,
            normalizedClassroomId,
            classroomName: classroomNameMap[normalizedClassroomId] || normalizedClassroomId || 'Unassigned',
          };
        });
        setAllStudents(studentsWithNames);
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
  }, [classrooms, userRole, isProgramAdmin, loading]);

  const trimmedSearchQuery = searchQuery.trim();

  const sortedClassrooms = useMemo(() => {
    return [...classrooms].sort((a, b) =>
      (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' })
    );
  }, [classrooms]);

  const classroomResults = useMemo(() => {
    if (!trimmedSearchQuery) return sortedClassrooms;
    return genericFuzzySearch(sortedClassrooms, trimmedSearchQuery, [
      { name: 'name', weight: 1 },
    ]);
  }, [sortedClassrooms, trimmedSearchQuery]);

  const studentsByClassroom = useMemo(() => {
    const map = {};
    allStudents.forEach((student) => {
      const cid = student.normalizedClassroomId || normalizeClassroomId(student.classroomId);
      if (!cid) return;
      if (!map[cid]) map[cid] = [];
      map[cid].push(student);
    });
    Object.values(map).forEach((list) => {
      list.sort((a, b) =>
        getStudentName(a).localeCompare(getStudentName(b), undefined, { sensitivity: 'base' })
      );
    });
    return map;
  }, [allStudents]);

  const studentResults = useMemo(() => {
    const keys = [
      { name: 'displayName', weight: 1 },
      { name: 'name', weight: 1 },
      { name: 'firstName', weight: 0.9 },
      { name: 'lastName', weight: 0.9 },
    ];
    const results = genericFuzzySearch(allStudents, trimmedSearchQuery, keys);
    return [...results].sort((a, b) =>
      getStudentName(a).localeCompare(getStudentName(b), undefined, { sensitivity: 'base' })
    );
  }, [allStudents, trimmedSearchQuery]);

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
    for (const c of sortedClassrooms) {
      const pid = classroomToProgram[c.id];
      if (pid) present.add(pid);
    }
    return Array.from(present).sort((a, b) => a.localeCompare(b));
  }, [sortedClassrooms, classroomToProgram]);

  // Group classrooms by program using programs collection; anything unmapped goes to 'unassigned'
  const groupedByProgram = useMemo(() => {
    const groups = {};
    for (const pid of sortedProgramIds) groups[pid] = [];
    const unassigned = [];
    for (const c of sortedClassrooms) {
      const pid = classroomToProgram[c.id];
      if (pid) {
        if (!groups[pid]) groups[pid] = [];
        groups[pid].push(c);
      } else {
        unassigned.push(c);
      }
    }
    return { groups, unassigned };
  }, [sortedClassrooms, classroomToProgram, sortedProgramIds]);

const PROGRAM_TITLES = {
  adolescent: 'Adolescent',
  elementary: 'Elementary',
  primary: 'Primary',
  toddler: 'Toddler',
};

const estimateStudentListHeight = (count) => {
  const cardHeight = 88;            // approximate card height
  const verticalGap = 12;           // gap between cards (theme spacing 1.5)
  const minHeight = 180;
  const maxHeight = 520;            // cap so very large classes still scroll
  const naturalHeight = count > 0
    ? (count * (cardHeight + verticalGap)) - verticalGap
    : minHeight;
  return Math.min(Math.max(naturalHeight, minHeight), maxHeight);
};

const handleStudentClick = (student) => {
  setExpandedClassroomId(null);
  if (onNavigateToStudent) {
    onNavigateToStudent(student);
  }
  };

  const handleToggleStudents = (event, classroomId) => {
    event.stopPropagation();
    event.preventDefault();
    setExpandedClassroomId((prev) => (prev === classroomId ? null : classroomId));
  };

  useEffect(() => {
    setExpandedClassroomId(null);
  }, [searchQuery]);

  const getStudentClassroomLabel = (student, fallbackClassroomId = '') => {
    const normalizedId =
      student?.normalizedClassroomId || normalizeClassroomId(student?.classroomId) || fallbackClassroomId;
    return (
      student?.classroomName ||
      classroomMap[normalizedId] ||
      classroomMap[fallbackClassroomId] ||
      normalizedId ||
      'Unassigned'
    );
  };

  const renderCard = (classroom) => {
    const normalizedId = normalizeClassroomId(classroom.id);
    // Prefer pre-grouped students; fall back to on-the-fly filter if the map is empty.
    const classroomStudents =
      studentsByClassroom[normalizedId] && studentsByClassroom[normalizedId].length
        ? studentsByClassroom[normalizedId]
        : allStudents.filter((s) => {
            const cid = s.normalizedClassroomId || normalizeClassroomId(s.classroomId);
            return cid === normalizedId;
          });
    const isExpanded = expandedClassroomId === classroom.id;
    const studentTotal = studentCounts[classroom.id] ?? classroomStudents.length ?? 0;
    const studentListHeight = estimateStudentListHeight(classroomStudents.length);

    return (
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
        <Box
          onClick={() => {
            setExpandedClassroomId(null);
            onSelectClassroom(classroom);
          }}
          sx={{ p: 0, cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setExpandedClassroomId(null);
              onSelectClassroom(classroom);
            }
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: '#4f46e5', width: 48, height: 48 }}>
                  <School />
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h3" sx={{ color: '#1e293b', fontWeight: 600 }}>
                    {classroom.name || 'Untitled classroom'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Group sx={{ fontSize: 16, color: '#64748b' }} />
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                      {studentTotal} students
                    </Typography>
                  </Box>
                </Box>
              </Box>
              <ArrowForward sx={{ color: '#94a3b8' }} />
            </Box>
            <Button
              size="small"
              variant="outlined"
              endIcon={isExpanded ? <ExpandLess /> : <ExpandMore />}
              onClick={(event) => handleToggleStudents(event, classroom.id)}
              sx={{ textTransform: 'none', mt: 1 }}
            >
              View students
            </Button>
          </CardContent>
        </Box>

        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <Box
            sx={{
              px: 3,
              pb: 3,
              pt: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Students ({classroomStudents.length})
              </Typography>
              {studentsLoading && <CircularProgress size={16} />}
            </Box>
            <Box
              sx={{
                maxHeight: studentListHeight,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                pr: 1,
                minHeight: 0,
              }}
            >
              {studentsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={20} />
                </Box>
              ) : classroomStudents.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No students in this classroom.
                </Typography>
              ) : (
                classroomStudents.map((student) => (
                  <StudentCard
                    key={student.id}
                    student={student}
                    classroomName={getStudentClassroomLabel(student, normalizedId)}
                    onClick={() => handleStudentClick(student)}
                  />
                ))
              )}
            </Box>
          </Box>
        </Collapse>
      </Card>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <TextField
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search classrooms or students…"
        aria-label="Search classrooms or students"
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

      {trimmedSearchQuery ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {classroomResults.length === 0 && studentResults.length === 0 && !loading && !studentsLoading ? (
            <Typography variant="body2" color="text.secondary">
              No classrooms or students match "{trimmedSearchQuery}".
            </Typography>
          ) : (
            <>
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
                  Classrooms
                </Divider>
                {loading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 3, gap: 2, flexDirection: 'column' }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary">
                      Coach Pepper is fetching classrooms...
                    </Typography>
                  </Box>
                ) : (
                  classroomResults.map(renderCard)
                )}
              </Box>

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
                  Students
                </Divider>
                {studentsLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                    <CircularProgress size={32} />
                  </Box>
                ) : (
                  studentResults.map((student) => (
                    <StudentCard
                      key={student.id}
                      student={student}
                      classroomName={getStudentClassroomLabel(student)}
                      onClick={() => handleStudentClick(student)}
                    />
                  ))
                )}
              </Box>
            </>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {loading ? (
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              minHeight: '200px',
              gap: 2,
              flexDirection: 'column'
            }}>
              <CircularProgress size={32} />
              <Typography variant="body2" color="text.secondary">
                Coach Pepper is fetching classrooms...
              </Typography>
            </Box>
          ) : sortedClassrooms.length === 0 ? (
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
    </Box>
  );
}

// StudentCard component for displaying individual students
function StudentCard({ student, classroomName, onClick, compact = false }) {
  const studentName = getStudentName(student);

  return (
    <Card
      sx={{
        cursor: 'pointer',
        backgroundColor: '#f8fafc',
        border: '1px solid #e2e8f0',
        width: '100%',
        minHeight: compact ? 68 : 88,
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          transform: 'translateY(-1px)',
        },
        transition: 'all 0.2s ease-in-out',
      }}
      onClick={onClick}
      aria-label={`View timeline for ${studentName}`}
    >
      <CardContent sx={{ p: compact ? 1.75 : 2.5 }}>
        {/* Student Name - Prominent */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Person sx={{ fontSize: compact ? 14 : 16, color: 'primary.main' }} />
          <Typography 
            variant="subtitle2" 
            sx={{ 
              fontWeight: 600, 
              color: 'primary.main',
              fontSize: compact ? '0.9rem' : undefined,
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
