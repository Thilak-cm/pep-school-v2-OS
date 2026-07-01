// ClassroomList.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  TextField,
  InputAdornment,
  Divider,
  Button,
  Collapse,
} from '@mui/material';
import { GraduationCap as School, Users as Group, ArrowRight as ArrowForward, Search, User as Person, ChevronDown as ExpandMore, ChevronUp as ExpandLess } from '../icons';
import { MiniTangram } from './ui';
import { collection, getDocs, query, where, doc, getDoc, documentId } from 'firebase/firestore';
import { db } from '../firebase';
import { trackEvent } from '../utils/analytics';

const CACHE_KEY_PREFIX = 'classroomListCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const PROGRAM_LABELS = {
  toddler: 'Toddler',
  primary: 'Primary',
  elementary: 'Elementary',
  adolescent: 'Adolescent',
  unassigned: 'Unassigned',
};
const CLASSROOM_PALETTES = [
  ['var(--color-primary)', 'var(--color-indigo-bg)', 'var(--color-indigo-soft)'],
  ['var(--color-secondary)', 'var(--color-green-bg)', 'var(--color-green-mint)'],
  ['var(--color-warning)', 'var(--color-amber-bg)', 'var(--color-amber-yellow)'],
  ['var(--color-pink)', 'rgba(236, 72, 153, 0.1)', 'rgba(236, 72, 153, 0.2)'],
];

const SECTION_DIVIDER_SX = {
  fontWeight: 600,
  fontSize: '0.85rem',
  color: 'var(--color-text-soft)',
  '&::before, &::after': { borderColor: 'var(--color-border)' },
};

const getProgramLabel = (programId) => {
  const key = String(programId || '').trim();
  if (!key) return PROGRAM_LABELS.unassigned;
  return PROGRAM_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
};

const buildCacheKey = (uid, role, manageableClassrooms = []) => {
  const classroomKey = Array.isArray(manageableClassrooms) && manageableClassrooms.length
    ? manageableClassrooms.slice().sort().join('|')
    : 'all-classrooms';
  return `${CACHE_KEY_PREFIX}:${role || 'unknown'}:${uid || 'anonymous'}:${classroomKey}`;
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
  } catch {
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
  } catch {
    /* ignored */
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

function ClassroomList({ onSelectClassroom, currentUser, userRole, manageableClassrooms = [], onNavigateToStudent, classrooms: classroomsProp }) {
  const [classrooms, setClassrooms] = useState(classroomsProp || []);
  const [loading, setLoading] = useState(!classroomsProp);
  const [searchQuery, setSearchQuery] = useState('');
  const [allStudents, setAllStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [classroomMap, setClassroomMap] = useState({}); // classroomId -> classroom name
  const [expandedClassroomId, setExpandedClassroomId] = useState(null);
  const [programLookup, setProgramLookup] = useState({}); // classroomId -> programId
  const isClassroomAdmin = userRole === 'classroomadmin';

  // Sync classrooms from prop when provided (lifted fetch from App.jsx)
  useEffect(() => {
    if (classroomsProp) { setClassrooms(classroomsProp); setLoading(false); }
  }, [classroomsProp]);

  useEffect(() => {
    // Skip own fetch if classrooms were provided via prop
    if (classroomsProp) return;

    let isMounted = true;
    const cacheKey = buildCacheKey(currentUser?.uid, userRole, manageableClassrooms);
    const cached = readCachedClassrooms(cacheKey);

    if (cached) {
      setClassrooms(cached.classrooms || []);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const fetchClassrooms = async () => {
      try {
        let classroomsToShow = [];

        if (userRole === 'teacher') {
          const allClassroomsSnap = await getDocs(query(collection(db, 'classrooms')));
          const allClassrooms = allClassroomsSnap.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
          }));
          
          classroomsToShow = allClassrooms
            .filter(classroom => (classroom.status || 'active') !== 'archived')
            .filter(classroom => {
              return classroom.teacherIds && classroom.teacherIds.includes(currentUser.uid);
            });
        } else if (isClassroomAdmin) {
          if (manageableClassrooms.length === 0) {
            classroomsToShow = [];
          } else {
            const ids = manageableClassrooms.filter(Boolean);
            const batchSize = 10;
            const batches = [];
            for (let i = 0; i < ids.length; i += batchSize) {
              batches.push(ids.slice(i, i + batchSize));
            }
            const results = [];
            for (const batch of batches) {
              const q = query(
                collection(db, 'classrooms'),
                where(documentId(), 'in', batch),
                where('status', '==', 'active')
              );
              const snap = await getDocs(q);
              results.push(...snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
            }
            const deduped = {};
            results.forEach((c) => {
              if (c?.id) deduped[c.id] = c;
            });
            classroomsToShow = Object.values(deduped);
          }
        } else {
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

        writeCachedClassrooms(cacheKey, {
          classrooms: classroomsToShow,
        });
      } catch {
        /* ignored */
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
  }, [currentUser?.uid, userRole, manageableClassrooms]);

  useEffect(() => {
    let isMounted = true;

    const fetchPrograms = async () => {
      try {
        const programsSnap = await getDocs(collection(db, 'programs'));
        if (!isMounted) return;

        const classroomProgramMap = {};

        programsSnap.forEach((programDoc) => {
          const data = programDoc.data() || {};
          const programId = programDoc.id;
          const classroomPaths = Array.isArray(data.classrooms) ? data.classrooms : [];
          classroomPaths.forEach((path) => {
            const normalizedId = normalizeClassroomId(path);
            if (normalizedId) {
              classroomProgramMap[normalizedId] = programId;
            }
          });
        });

        setProgramLookup(classroomProgramMap);
      } catch {
        /* ignored */
      }
    };

    fetchPrograms();

    return () => {
      isMounted = false;
    };
  }, []);

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
          if ((data.status || 'active') !== 'active') return;
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
        } else if (isClassroomAdmin) {
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
          } catch {
            /* ignored */
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
      } catch {
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
  }, [classrooms, userRole, isClassroomAdmin, loading]);

  const trimmedSearchQuery = searchQuery.trim();

  const sortedClassrooms = useMemo(() => {
    return [...classrooms].sort((a, b) =>
      (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' })
    );
  }, [classrooms]);

  const classroomResults = useMemo(() => {
    if (!trimmedSearchQuery) return sortedClassrooms;
    const q = trimmedSearchQuery.toLowerCase();
    return sortedClassrooms.filter((cls) => (cls?.name || '').toLowerCase().includes(q));
  }, [sortedClassrooms, trimmedSearchQuery]);

  const classroomProgramLookup = useMemo(() => {
    const mapping = { ...programLookup };
    sortedClassrooms.forEach((cls) => {
      const cid = normalizeClassroomId(cls.id);
      if (!cid) return;
      const programId = cls.programId || mapping[cid];
      if (programId) {
        mapping[cid] = programId;
      } else if (!mapping[cid]) {
        mapping[cid] = 'unassigned';
      }
    });
    return mapping;
  }, [sortedClassrooms, programLookup]);

  const groupedClassrooms = useMemo(() => {
    const groups = {};
    const seenPrograms = new Set();

    sortedClassrooms.forEach((cls) => {
      const cid = normalizeClassroomId(cls.id);
      const programId = classroomProgramLookup[cid] || 'unassigned';
      if (!groups[programId]) groups[programId] = [];
      groups[programId].push(cls);
      seenPrograms.add(programId);
    });

    const orderedPrograms = Array.from(seenPrograms).sort((a, b) =>
      getProgramLabel(a).localeCompare(getProgramLabel(b), undefined, { sensitivity: 'base' })
    );

    return { groups, order: orderedPrograms };
  }, [sortedClassrooms, classroomProgramLookup]);

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
    if (!trimmedSearchQuery) return allStudents;
    const q = trimmedSearchQuery.toLowerCase();
    const filtered = allStudents.filter((stu) => {
      const name = getStudentName(stu).toLowerCase();
      return name.includes(q);
    });
    return filtered.sort((a, b) =>
      getStudentName(a).localeCompare(getStudentName(b), undefined, { sensitivity: 'base' })
    );
  }, [allStudents, trimmedSearchQuery]);

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
    trackEvent('student_card_click', { source: 'classroom_list_dropdown' });
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

  const renderCard = (classroom, index) => {
    const normalizedId = normalizeClassroomId(classroom.id);
    const hasHex = classroom.color;
    const fallback = CLASSROOM_PALETTES[index % CLASSROOM_PALETTES.length];
    const iconColor = hasHex ? classroom.color : fallback[0];
    const iconBgColor = hasHex ? `${classroom.color}18` : fallback[1];
    // Prefer pre-grouped students; fall back to on-the-fly filter if the map is empty.
    const classroomStudents =
      studentsByClassroom[normalizedId] && studentsByClassroom[normalizedId].length
        ? studentsByClassroom[normalizedId]
        : allStudents.filter((s) => {
            const cid = s.normalizedClassroomId || normalizeClassroomId(s.classroomId);
            return cid === normalizedId;
          });
    const isExpanded = expandedClassroomId === classroom.id;
    const studentTotal = classroom.studentCount ?? classroomStudents.length ?? 0;
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
          sx={{
            p: 0,
            cursor: 'pointer',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            '&:focus-visible': { outline: 'none' },
            '&:active': { backgroundColor: 'transparent' },
          }}
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
                <Box sx={{
                  width: 48, height: 48, borderRadius: '50%',
                  backgroundColor: iconBgColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <MiniTangram size={26} color={iconColor} />
                </Box>
                <Box>
                  <Typography variant="h6" component="h3" sx={{ color: 'var(--color-text)', fontWeight: 600 }}>
                    {classroom.name || 'Untitled classroom'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Group size={16} style={{ color: 'var(--color-text-soft)' }} />
                    <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>
                      {studentTotal} students
                    </Typography>
                  </Box>
                </Box>
              </Box>
              <ArrowForward style={{ color: 'var(--color-text-faint)' }} />
            </Box>
            <Button
              size="small"
              variant="outlined"
              endIcon={isExpanded ? <ExpandLess /> : <ExpandMore />}
              onClick={(event) => handleToggleStudents(event, classroom.id)}
              disableRipple
              disableFocusRipple
              disableTouchRipple
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
              <Search size={20} />
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
                  sx={SECTION_DIVIDER_SX}
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
                  sx={SECTION_DIVIDER_SX}
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
              backgroundColor: 'var(--color-bg)',
              border: '2px dashed var(--grey-300)'
            }}>
              <School size={48} style={{ color: 'var(--color-text-faint)', marginBottom: 16 }} />
              <Typography variant="h6" sx={{ color: 'var(--grey-600)', mb: 1 }}>
                {userRole === 'teacher' ? 'No classrooms assigned' : 'No classrooms found'}
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>
                {userRole === 'teacher' 
                  ? 'Contact your administrator to get assigned to classrooms.'
                  : 'No classrooms have been created yet.'
                }
              </Typography>
            </Card>
          ) : (
            <>
              {groupedClassrooms.order.map((programId) => (
                <Box key={programId} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Divider textAlign="left" sx={SECTION_DIVIDER_SX}>
                    {getProgramLabel(programId)}
                  </Divider>
                  {(groupedClassrooms.groups[programId] || []).map(renderCard)}
                </Box>
              ))}
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
        backgroundColor: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
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
          <Person size={compact ? 14 : 16} style={{ color: 'var(--color-primary)' }} />
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
            <School size={14} style={{ color: 'var(--color-text-soft)' }} />
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
