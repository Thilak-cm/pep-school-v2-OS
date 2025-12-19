import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
  Tooltip,
  Select,
  FormControl,
  InputLabel,
  MenuItem
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
  Download,
  Refresh,
  Visibility,
  VisibilityOff,
  Clear
} from '@mui/icons-material';
import { collection, collectionGroup, query, getDocs, orderBy, getDoc, doc, where, limit, documentId, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import { fuzzySearchClassrooms, fuzzySearchTeachers, fuzzySearchStudents } from '../utils/fuzzySearch';
import { isAdminRole } from '../utils/roleUtils';
import { 
  PERFORMANCE_TARGETS, 
  calculateStudentPerformance, 
  calculateTeacherPerformance, 
  calculateClassroomPerformance,
  isHighPerformer,
  isMediumPerformer,
  isLowPerformer
} from '../config/performanceTargets';

// Granular cache system - each data type cached separately
const CACHE_KEY_PREFIX = 'statsPageCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (1 day)

const getFilterKeySegment = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return 'all';
  const ids = items
    .map(item => item?.id)
    .filter(Boolean)
    .sort();
  return ids.length ? ids.join('|') : 'all';
};

// Build base cache key for user/role context
const buildBaseCacheKey = (userId, role, manageableClassrooms = []) => {
  const userKey = userId || 'anonymous';
  const roleKey = role || 'unknown';
  const classroomScopeKey = Array.isArray(manageableClassrooms) && manageableClassrooms.length
    ? manageableClassrooms.slice().sort().join('|')
    : 'all-classrooms';
  return `${CACHE_KEY_PREFIX}:${userKey}:${roleKey}:${classroomScopeKey}`;
};

// Build cache key for specific data type
const buildDataTypeCacheKey = (baseKey, dataType) => {
  return `${baseKey}:${dataType}`;
};

// Cache data types: 'observations', 'classrooms', 'teachers', 'students', 'branches', 'stats'
const getCachedData = (key, dataType) => {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const cacheKey = buildDataTypeCacheKey(key, dataType);
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.timestamp || parsed.payload === undefined) return null;
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      window.localStorage.removeItem(cacheKey);
      return null;
    }
    
    // For arrays, check if it's actually empty (not just cached empty state)
    // For objects, check if it has meaningful data
    const payload = parsed.payload;
    if (Array.isArray(payload) && payload.length === 0) {
      // Empty array might be valid (no data), but if it's observations and we have 0, 
      // it might be stale. However, we'll trust it for now since 0 observations is valid.
      return payload;
    }
    
    return payload;
  } catch (error) {
    console.error(`Failed to read ${dataType} cache`, error);
    return null;
  }
};

const setCachedData = (key, dataType, payload) => {
  if (typeof window === 'undefined' || !key) return;
  try {
    const cacheKey = buildDataTypeCacheKey(key, dataType);
    const value = JSON.stringify({ timestamp: Date.now(), payload });
    window.localStorage.setItem(cacheKey, value);
  } catch (error) {
    // In some environments (incognito, low quota) writes can fail; skip caching quietly.
    if (error && (error.name === 'QuotaExceededError' || error.code === 22)) {
      try {
        // Try to clear old cache entries to make room
        const baseKey = key.split(':').slice(0, 3).join(':');
        Object.keys(window.localStorage).forEach(k => {
          if (k.startsWith(baseKey)) {
            window.localStorage.removeItem(k);
          }
        });
      } catch (_) {
        // Ignore secondary failures
      }
      console.warn('Stats cache disabled: storage quota exceeded');
      return;
    }
    console.error(`Failed to write ${dataType} cache`, error);
  }
};

const StatsPage = ({ user, role, manageableClassrooms = [], onBack }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [timePeriod, setTimePeriod] = useState('1W');
  const [stats, setStats] = useState({
    totalObservations: 0,
    thisWeek: 0,
    lastWeek: 0,
    thisWeekChange: 0,
    voiceNotes: 0,
    textNotes: 0,
    voiceLanguageDistribution: [],
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

  // Student search state
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  // Teacher search state
  const [teacherSearchQuery, setTeacherSearchQuery] = useState('');
  // Teachers tab local filters (like Manage Users)
  const [teacherStatusFilter, setTeacherStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [teacherOnlyNoClassrooms, setTeacherOnlyNoClassrooms] = useState(false);
  const [teacherClassroomFilterOpen, setTeacherClassroomFilterOpen] = useState(false);
  const [selectedTeacherClassroomFilterIds, setSelectedTeacherClassroomFilterIds] = useState([]);
  const [teachersToShow, setTeachersToShow] = useState(5); // Pagination: show 5 initially
  const [mounted, setMounted] = useState(false);
  
  // Branch filter state (admin only)
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [scopeError, setScopeError] = useState('');
  
  // Track which tabs have loaded their data (lazy loading)
  const [loadedTabs, setLoadedTabs] = useState(new Set([0])); // Overview tab (0) loads immediately
  const [tabLoadingStates, setTabLoadingStates] = useState({
    0: false, // Overview
    1: false, // Classrooms
    2: false, // Teachers
    3: false  // Students
  });
  
  const isAdmin = isAdminRole(role);
  const isClassroomAdmin = role === 'classroomadmin';
  const scopedClassrooms = isClassroomAdmin ? (Array.isArray(manageableClassrooms) ? manageableClassrooms.filter(Boolean) : []) : [];
  
  // Base cache key (user/role context) - doesn't change with filters
  const baseCacheKey = useMemo(() => buildBaseCacheKey(
    user?.uid,
    role,
    manageableClassrooms
  ), [user?.uid, role, manageableClassrooms]);
  
  // Filter-based cache key for observations (changes with filters)
  const observationsCacheKey = useMemo(() => {
    const filterKey = `${getFilterKeySegment(selectedClassrooms)}:${getFilterKeySegment(selectedTeachers)}:${getFilterKeySegment(selectedStudents)}`;
    return `${baseCacheKey}:obs:${filterKey}`;
  }, [baseCacheKey, selectedClassrooms, selectedTeachers, selectedStudents]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Helper function to fetch data for a specific tab
  const fetchTabData = async (tabIndex) => {
    // Guard: classroom admins must have scoped classrooms; otherwise stop and show error
    if (isClassroomAdmin && scopedClassrooms.length === 0) {
      setScopeError('Your classroom access is missing. Please contact a super admin to add manageable classrooms.');
      setClassrooms([]);
      setTeachers([]);
      setStudents([]);
      setStats(prev => ({ ...prev, loading: false }));
      setFilterLoading(false);
      return;
    } else {
      setScopeError('');
    }

    // Determine what data this tab needs
    const needsObservations = tabIndex === 0 || tabIndex === 1 || tabIndex === 2 || tabIndex === 3; // All tabs need observations
    const needsClassrooms = tabIndex === 0 || tabIndex === 1; // Overview and Classrooms tabs
    const needsTeachers = tabIndex === 0 || tabIndex === 2; // Overview and Teachers tabs
    const needsStudents = tabIndex === 0 || tabIndex === 1 || tabIndex === 3; // Overview, Classrooms, Students tabs
    const needsBranches = isAdmin; // Only admins need branches

    // Check cache for each data type independently
    const cachedObservations = needsObservations ? getCachedData(observationsCacheKey, 'observations') : null;
    const cachedStats = needsObservations ? getCachedData(observationsCacheKey, 'stats') : null;
    const cachedClassrooms = needsClassrooms ? getCachedData(baseCacheKey, 'classrooms') : null;
    const cachedTeachers = needsTeachers ? getCachedData(baseCacheKey, 'teachers') : null;
    const cachedStudents = needsStudents ? getCachedData(baseCacheKey, 'students') : null;
    const cachedBranches = needsBranches ? getCachedData(baseCacheKey, 'branches') : null;

    // If we have all cached data needed for this tab, use it
    const hasAllCachedData = 
      (!needsObservations || (cachedObservations && cachedStats)) &&
      (!needsClassrooms || cachedClassrooms) &&
      (!needsTeachers || cachedTeachers) &&
      (!needsStudents || cachedStudents) &&
      (!needsBranches || cachedBranches);

    if (hasAllCachedData) {
      // Use cached data - set state immediately
      if (cachedStats) {
        setStats({ ...cachedStats, loading: false });
      } else if (cachedObservations) {
        // If we have observations but no stats, we need to recalculate stats
        // This shouldn't happen normally, but handle it gracefully
        // Fall through to fetchData to recalculate
      } else {
        // No cached data at all, proceed to fetch
      }
      
      // Set other cached data
      if (cachedClassrooms) {
        setClassrooms(cachedClassrooms);
      }
      if (cachedTeachers) {
        setTeachers(cachedTeachers);
      }
      if (cachedStudents) {
        setStudents(cachedStudents);
      }
      if (cachedBranches) {
        setBranches(cachedBranches);
        if (isAdmin && selectedBranchId === null && cachedBranches.length > 0) {
          setSelectedBranchId(cachedBranches[0].id);
        }
      }
      
      // If we have all cached data including stats, we're done
      if (cachedStats) {
        setTabLoadingStates(prev => ({ ...prev, [tabIndex]: false }));
        setFilterLoading(false);
        return;
      }
      // Otherwise, continue to fetchData to recalculate stats from cached observations
    }

    const fetchData = async () => {
      try {
        setFilterLoading(true);
        setTabLoadingStates(prev => ({ ...prev, [tabIndex]: true }));
        if (tabIndex === 0) {
          setStats(prev => ({ ...prev, loading: true }));
        }
        
        // Initialize data variables - use cached data if available, otherwise fetch
        let classroomsData = cachedClassrooms || [];
        let teachersData = cachedTeachers || [];
        let studentsData = cachedStudents || [];
        let branchesData = cachedBranches || [];
        let allObservations = cachedObservations ? [...cachedObservations] : []; // Copy cached array
        
        // Set cached data to state immediately if available (for UI responsiveness)
        if (cachedClassrooms) setClassrooms(cachedClassrooms);
        if (cachedTeachers) setTeachers(cachedTeachers);
        if (cachedStudents) setStudents(cachedStudents);
        if (cachedBranches) {
          setBranches(cachedBranches);
          if (isAdmin && selectedBranchId === null && cachedBranches.length > 0) {
            setSelectedBranchId(cachedBranches[0].id);
          }
        }
        
        // Fetch branches (for admin branch filter) - only if not cached
        if (isAdmin && !cachedBranches) {
          try {
            const branchesQuery = query(collection(db, 'branches'));
            const branchesSnap = await getDocs(branchesQuery);
            branchesData = branchesSnap.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                name: data.name || doc.id.toUpperCase(),
                classrooms: data.classrooms || [], // Array of classroom IDs
                ...data
              };
            });
            // Sort branches by name or order
            branchesData.sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
              }
              return (a.name || a.id).localeCompare(b.name || b.id);
            });
            setBranches(branchesData);
            // Set default selected branch to first one if not set
            if (selectedBranchId === null && branchesData.length > 0) {
              setSelectedBranchId(branchesData[0].id);
            }
          } catch (error) {
            console.error('Branches query failed:', error);
            console.error('Error details:', error.message, error.code);
            setBranches([]);
          }
        }
        
        // Fetch classrooms - only if needed for this tab and not cached
        if (needsClassrooms && !cachedClassrooms) {
          try {
          if (isClassroomAdmin) {
            const ids = scopedClassrooms;
            const batchSize = 10;
            for (let i = 0; i < ids.length; i += batchSize) {
              const batch = ids.slice(i, i + batchSize);
              const classroomsQuery = query(
                collection(db, 'classrooms'),
                where(documentId(), 'in', batch),
                where('status', '==', 'active')
              );
              const classroomsSnap = await getDocs(classroomsQuery);
              classroomsSnap.docs.forEach(doc => {
                classroomsData.push({ id: doc.id, ...doc.data() });
              });
            }
          } else {
            const classroomConstraints = [where('status', '==', 'active')];
            const classroomsQuery = query(collection(db, 'classrooms'), ...classroomConstraints);
            const classroomsSnap = await getDocs(classroomsQuery);
            classroomsData = classroomsSnap.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
          }
          } catch (error) {
            console.error('Classrooms query failed:', error);
            classroomsData = [];
          }
        }
        
        // Fetch teachers (users with teacher role) - only if needed for this tab and not cached
        if (needsTeachers && !cachedTeachers) {
          try {
          // First try to get all users to see if the collection is accessible
          const allUsersQuery = query(collection(db, 'users'));
          const allUsersSnap = await getDocs(allUsersQuery);
          
          // Now filter for teachers client-side
          const teacherUsers = allUsersSnap.docs.filter(doc => doc.data().role === 'teacher');
          
          teachersData = teacherUsers.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          } catch (error) {
            console.error('Teachers query failed:', error);
            teachersData = [];
          }
        }
        
        // Fetch students - only if needed for this tab and not cached
        if (needsStudents && !cachedStudents) {
          try {
          if (isClassroomAdmin) {
            const allowedClassroomIds = classroomsData.map(c => c.id);
            studentsData = [];
            const batchSize = 10;
            for (let i = 0; i < allowedClassroomIds.length; i += batchSize) {
              const batch = allowedClassroomIds.slice(i, i + batchSize);
              const studentsQuery = query(collection(db, 'students'), where('classroomId', 'in', batch));
              const studentsSnap = await getDocs(studentsQuery);
              studentsSnap.docs.forEach(doc => {
                studentsData.push({ id: doc.id, ...doc.data() });
              });
            }
          } else {
            const studentsQuery = query(collection(db, 'students'));
            const studentsSnap = await getDocs(studentsQuery);
            studentsData = studentsSnap.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
          }
          } catch (error) {
            console.error('Students query failed:', error);
            studentsData = [];
          }
        }
        
        // Fetch observations using collection group query - only if needed for this tab and not cached
        if (needsObservations && !cachedObservations) {
          try {
            if (isClassroomAdmin) {
            const allowedStudentIds = studentsData.map(s => s.id);
            const batchSize = 10;
            for (let i = 0; i < allowedStudentIds.length; i += batchSize) {
              const batch = allowedStudentIds.slice(i, i + batchSize);
              if (batch.length === 0) continue;
              const observationsQuery = query(
                collectionGroup(db, 'observations'), 
                where('studentId', 'in', batch)
              );
              const observationsSnap = await getDocs(observationsQuery);
              observationsSnap.docs.forEach(doc => {
                const data = doc.data();
                allObservations.push({
                  id: doc.id,
                  ...data
                });
              });
            }
            } else {
              // For super admins: Fetch all observations for complete stats
              const observationsQuery = query(
                collectionGroup(db, 'observations'),
                orderBy('observedAt', 'desc')
              );
              const observationsSnap = await getDocs(observationsQuery);
              allObservations = observationsSnap.docs.map(doc => {
                const data = doc.data();
                return {
                  id: doc.id,
                  ...data
                };
              });
            }
          } catch (error) {
            console.error('Collection group query failed:', error);
            // If it's an index error, show helpful message but don't break the page
            if (error.code === 'failed-precondition' && error.message?.includes('index')) {
              console.warn('Firestore index required. Please deploy indexes: firebase deploy --only firestore:indexes');
              // Set empty array so page still loads with other data
              allObservations = [];
            } else {
              allObservations = [];
            }
          }
        }
        
        // Sort by observedAt client-side (only if we just fetched, cache is already sorted)
        if (allObservations.length > 0 && !cachedObservations) {
          allObservations.sort((a, b) => {
            const aDate = a.observedAt?.toDate ? a.observedAt.toDate() : 
                     a.createdAt?.toDate ? a.createdAt.toDate() : 
                     new Date(a.observedAt?.seconds * 1000) || new Date(a.createdAt?.seconds * 1000) || new Date(0);
            const bDate = b.observedAt?.toDate ? b.observedAt.toDate() : 
                     b.createdAt?.toDate ? b.createdAt.toDate() : 
                     new Date(b.observedAt?.seconds * 1000) || new Date(b.createdAt?.seconds * 1000) || new Date(0);
            return bDate - aDate;
          });
        }

        // Apply filters
        let filteredObservations = allObservations;
        let filteredClassroomsData = classroomsData;
        let filteredTeachersData = teachersData;
        let filteredStudentsData = studentsData;
        
        // Classroom admins: hard-scope to their classrooms (defensive even though queries are scoped)
        if (isClassroomAdmin) {
          const allowedClassroomIds = new Set(classroomsData.map(c => c.id));
          const allowedStudentIds = new Set(studentsData.map(s => s.id));
          filteredClassroomsData = classroomsData.filter(c => allowedClassroomIds.has(c.id));
          filteredStudentsData = studentsData.filter(student => allowedClassroomIds.has(student.classroomId));
          filteredObservations = filteredObservations.filter(obs => {
            const classroomOk = obs.classroomId ? allowedClassroomIds.has(obs.classroomId) : false;
            const studentOk = obs.studentId ? allowedStudentIds.has(obs.studentId) : false;
            return classroomOk || studentOk;
          });
          const allowedTeacherIds = new Set();
          classroomsData.forEach(c => {
            (c.teacherIds || []).forEach(tid => allowedTeacherIds.add(tid));
          });
          filteredTeachersData = teachersData.filter(t => allowedTeacherIds.has(t.id));
        }
        
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
          filteredClassroomsData = teacherClassrooms;
          
          const teacherStudents = studentsData.filter(student => 
            teacherClassroomIds.includes(student.classroomId)
          );
          filteredStudentsData = teacherStudents;
          
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
          filteredTeachersData = teacherClassroomTeachers;
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

        setClassrooms(filteredClassroomsData);
        setTeachers(filteredTeachersData);
        setStudents(filteredStudentsData);

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

        // Voice language distribution removed
        const voiceLanguageDistribution = [];

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
            branchId: classroom.branchId, // Include branchId for filtering
            studentCount: classroomStudents.length,
            totalObservations: classroomObservations.length,
            thisWeekObservations: thisWeekObs.length,
            avgPerStudent: classroomStudents.length > 0 ? 
              (thisWeekObs.length / classroomStudents.length) : 0,
            target: PERFORMANCE_TARGETS.CLASSROOM.NOTES_PER_STUDENT_PER_WEEK,
            performance: calculateClassroomPerformance(thisWeekObs.length, classroomStudents.length)
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
          const last14DaysObs = teacherObservations.filter(obs => {
            const obsDate = getObservationDate(obs);
            return obsDate >= twoWeeksAgo;
          });

          // Voice/Text split for last 14 days
          const isVoice = (obs) => (
            obs?.tags?.type === 'voice' ||
            obs?.type === 'voice' ||
            (typeof obs?.tags?.includes === 'function' && obs.tags.includes('voice')) ||
            !!obs?.duration
          );
          const isText = (obs) => (
            obs?.tags?.type === 'text' ||
            obs?.type === 'text' ||
            (typeof obs?.tags?.includes === 'function' && obs.tags.includes('text')) ||
            (!obs?.duration && !!obs?.text)
          );
          const last14Voice = last14DaysObs.filter(isVoice).length;
          const last14Text = last14DaysObs.filter(isText).length;
          
          return {
            id: teacher.id,
            name: teacher.displayName || teacher.email,
            email: teacher.email,
            status: teacher.status,
            totalObservations: teacherObservations.length,
            thisWeekObservations: thisWeekObs.length,
            last14DaysObservations: last14DaysObs.length,
            last14DaysVoice: last14Voice,
            last14DaysText: last14Text,
            target: PERFORMANCE_TARGETS.TEACHER.NOTES_PER_WEEK,
            performance: calculateTeacherPerformance(thisWeekObs.length)
          };
        });

        // Calculate student performance
        const studentStats = {};
        
        // Initialize ALL students with 0 counts (including those with no observations)
        studentsData.forEach(student => {
          studentStats[student.id] = { 
            id: student.id,
            name: student.displayName || student.name || 'Unknown Student',
            classroomId: student.classroomId,
            count: 0,
            thisWeekCount: 0
          };
        });
        
        // Now add observation counts for students who have them
        filteredObservations.forEach(obs => {
          if (obs.studentId && studentStats[obs.studentId]) {
            studentStats[obs.studentId].count++;
            
            const obsDate = getObservationDate(obs);
            if (obsDate >= weekAgo) {
              studentStats[obs.studentId].thisWeekCount++;
            }
          }
        });

        // For admins, show ALL students. For teachers, this will be filtered by their classrooms
        const topStudents = Object.values(studentStats)
          .sort((a, b) => b.thisWeekCount - a.thisWeekCount);

        const strugglingStudents = Object.values(studentStats)
          .filter(student => student.thisWeekCount < PERFORMANCE_TARGETS.STUDENT.STRUGGLING_THRESHOLD)
          .sort((a, b) => a.thisWeekCount - b.thisWeekCount);

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

        const statsPayload = {
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
          voiceLanguageDistribution,
          loading: false
        };
        
        setStats(statsPayload);
        
        // Cache each data type separately (only cache what we fetched, not what was already cached)
        if (needsObservations && !cachedObservations) {
          setCachedData(observationsCacheKey, 'observations', filteredObservations);
          setCachedData(observationsCacheKey, 'stats', statsPayload);
        }
        if (needsClassrooms && !cachedClassrooms && filteredClassroomsData.length > 0) {
          setCachedData(baseCacheKey, 'classrooms', filteredClassroomsData);
        }
        if (needsTeachers && !cachedTeachers && filteredTeachersData.length > 0) {
          setCachedData(baseCacheKey, 'teachers', filteredTeachersData);
        }
        if (needsStudents && !cachedStudents && filteredStudentsData.length > 0) {
          setCachedData(baseCacheKey, 'students', filteredStudentsData);
        }
        if (needsBranches && !cachedBranches && branchesData.length > 0) {
          setCachedData(baseCacheKey, 'branches', branchesData);
        }

      } catch (error) {
        console.error('Error fetching stats:', error);
        if (tabIndex === 0) {
          setStats(prev => ({ ...prev, loading: false }));
        }
      } finally {
        setFilterLoading(false);
        setTabLoadingStates(prev => ({ ...prev, [tabIndex]: false }));
      }
    };

    fetchData();
  };

  // Load Overview tab data immediately (default tab) - this loads observations for charts
  useEffect(() => {
    fetchTabData(0);
  }, [selectedClassrooms, selectedTeachers, selectedStudents, user, role, baseCacheKey, observationsCacheKey, isClassroomAdmin, scopedClassrooms.join('|')]);

  const handleTabChange = async (event, newValue) => {
    // Teachers can't access certain tabs
    if (role === 'teacher') {
      if (newValue === 2 || newValue === 3) { // Hide Teachers and Students tabs for teachers
        return;
      }
    }
    setActiveTab(newValue);
    
    // Lazy load: If this tab hasn't been loaded yet, fetch its data
    if (!loadedTabs.has(newValue)) {
      setLoadedTabs(prev => new Set([...prev, newValue]));
      setTabLoadingStates(prev => ({ ...prev, [newValue]: true }));
      await fetchTabData(newValue);
    }
  };

  // Memoize pie chart data to prevent re-renders when time period changes
  const pieChartData = useMemo(() => [
    { name: 'Voice Notes', value: stats.voiceNotes, color: '#3b82f6' },
    { name: 'Text Notes', value: stats.textNotes, color: '#f59e0b' }
  ], [stats.voiceNotes, stats.textNotes]);

  // Custom label to show % inside each pie slice - memoized to prevent flickering
  const renderNoteDistributionLabel = React.useCallback(({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent
  }) => {
    if (!percent || percent <= 0) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const label = `${Math.round(percent * 100)}%`;
    return (
      <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" style={{ fontWeight: 700 }}>
        {label}
      </text>
    );
  }, []);

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

  // Compute Activity Trend count based on selected timePeriod
  const getObservationDateFast = (obs) => {
    if (obs?.observedAt?.toDate) return obs.observedAt.toDate();
    if (obs?.createdAt?.toDate) return obs.createdAt.toDate();
    if (obs?.observedAt?.seconds) return new Date(obs.observedAt.seconds * 1000);
    if (obs?.createdAt?.seconds) return new Date(obs.createdAt.seconds * 1000);
    return new Date(0);
  };

  const activityCount = useMemo(() => {
    const list = stats?.allObservations || [];
    const now = new Date();
    let days = 7; // default 1W
    switch (timePeriod) {
      case '1D': days = 1; break;
      case '1W': days = 7; break;
      case '1M': days = 30; break;
      case '3M': days = 90; break;
      case '6M': days = 180; break;
      case '1Y': days = 365; break;
      default: days = 7;
    }
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return list.filter(o => getObservationDateFast(o) >= start).length;
  }, [stats?.allObservations, timePeriod]);

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

  // Helpers for Teachers tab: sort by first name and filter by search
  const getFirstName = (name, email) => {
    const source = name || email || '';
    const base = source.includes('@') ? source.split('@')[0] : source;
    const token = String(base).trim().split(/[\s._-]+/)[0] || '';
    return token.toLowerCase();
  };

  // Map teacherId -> classroomIds using loaded classrooms
  const teacherToClassroomIds = useMemo(() => {
    const map = new Map();
    (classrooms || []).forEach(c => {
      const tids = c?.teacherIds || [];
      tids.forEach(tid => {
        if (!map.has(tid)) map.set(tid, new Set());
        map.get(tid).add(c.id);
      });
    });
    return map;
  }, [classrooms]);

  const getTeacherClassroomIds = (teacherId) => Array.from(teacherToClassroomIds.get(teacherId) || new Set());

  const sortedTeacherStats = useMemo(() => {
    const list = stats?.teacherStats || [];
    return [...list].sort((a, b) =>
      getFirstName(a.name, a.email).localeCompare(getFirstName(b.name, b.email))
    );
  }, [stats?.teacherStats]);

  const filteredTeacherStats = useMemo(() => {
    const q = teacherSearchQuery?.trim();
    let base = sortedTeacherStats;
    if (q) {
      base = fuzzySearchTeachers(base, q);
    }
    // Status filter
    base = base.filter(t => {
      const status = (t.status || 'active');
      if (teacherStatusFilter === 'active') return status === 'active';
      if (teacherStatusFilter === 'inactive') return status !== 'active';
      return true;
    });
    // Classroom filters
    base = base.filter(t => {
      const assigned = getTeacherClassroomIds(t.id);
      if (teacherOnlyNoClassrooms) return assigned.length === 0;
      if (selectedTeacherClassroomFilterIds.length > 0) {
        return assigned.some(cid => selectedTeacherClassroomFilterIds.includes(cid));
      }
      return true;
    });
    // Keep alphabetical order
    return [...base].sort((a, b) =>
      getFirstName(a.name, a.email).localeCompare(getFirstName(b.name, b.email))
    );
  }, [sortedTeacherStats, teacherSearchQuery, teacherStatusFilter, teacherOnlyNoClassrooms, selectedTeacherClassroomFilterIds, teacherToClassroomIds]);

  // Reset pagination when filters change
  useEffect(() => {
    setTeachersToShow(5);
  }, [teacherSearchQuery, teacherStatusFilter, teacherOnlyNoClassrooms, selectedTeacherClassroomFilterIds]);

  const hasActiveFilters = () => {
    return selectedClassrooms.length > 0 || selectedTeachers.length > 0 || selectedStudents.length > 0;
  };

  // Hard-stop UI if classroom scoping is missing
  if (scopeError) {
    return (
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {onBack && (
          <Button startIcon={<ArrowBack />} onClick={onBack} sx={{ alignSelf: 'flex-start' }}>
            Back
          </Button>
        )}
        <Alert severity="error">{scopeError}</Alert>
      </Box>
    );
  }



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

  // Removed TabNavigationGrid (replaced with compact Tabs header)



  const ClassroomComparisonChart = () => {
    // Filter classroom stats by selected branch (admin only)
    const filteredClassroomStats = useMemo(() => {
      if (isAdmin && selectedBranchId) {
        // Find the selected branch to get its classrooms array
        const selectedBranch = branches.find(b => b.id === selectedBranchId);
        if (selectedBranch && selectedBranch.classrooms && selectedBranch.classrooms.length > 0) {
          // Filter by classroom IDs from branch document
          const branchClassroomIds = selectedBranch.classrooms.map(cid => {
            // Handle both full paths (e.g., "classrooms/allstars") and just IDs (e.g., "allstars")
            const parts = String(cid).split('/');
            return parts[parts.length - 1];
          });
          return stats.classroomStats.filter(classroom => 
            branchClassroomIds.includes(classroom.id)
          );
        }
        // Fallback: if branch doesn't have classrooms array, use branchId
        return stats.classroomStats.filter(classroom => classroom.branchId === selectedBranchId);
      }
      // For teachers, return all their accessible classrooms (already filtered)
      return stats.classroomStats;
    }, [stats.classroomStats, selectedBranchId, role, branches]);

    if (!mounted) {
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
            Coach Pepper is sketching this chart…
          </Typography>
        </Box>
      );
    }

    if (filteredClassroomStats.length === 0) {
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

    const data = filteredClassroomStats.map(classroom => ({
      name: classroom.name,
      'This Week': classroom.thisWeekObservations,
      percentage: classroom.performance,
      target: classroom.studentCount * classroom.target
    }));

    // Don't render chart until mounted AND has data
    if (!mounted || data.length === 0) {
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: 300,
          backgroundColor: 'grey.50',
          borderRadius: 2
        }}>
          <Typography variant="body2" color="text.secondary">
            {!mounted ? 'Loading chart...' : 'No classroom data available'}
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ height: 300, width: '100%', minWidth: 0, minHeight: 300, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsBarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              angle={-45}
              textAnchor="end"
              height={80}
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
                  const notesCount = payload[0].value;
                  const percentage = payload[0].payload.percentage;
                  const target = payload[0].payload.target;
                  return (
                    <Box sx={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: 2,
                      p: 1.5,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                      <Typography sx={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', mb: 0.5 }}>
                        {label}
                      </Typography>
                      <Typography sx={{ fontSize: '16px', fontWeight: 'bold', color: '#4f46e5', mb: 0.5 }}>
                        {notesCount} {notesCount === 1 ? 'note' : 'notes'}
                      </Typography>
                      <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                        {percentage.toFixed(1)}% of target ({notesCount}/{Math.round(target)})
                      </Typography>
                    </Box>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="This Week" fill="#4f46e5" radius={[4, 4, 0, 0]}             />
          </RechartsBarChart>
        </ResponsiveContainer>
      </Box>
    );
  };

  const generateActivityData = (observations, period) => {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const hourMs = 60 * 60 * 1000;
    const data = [];

    // Helper function to get observation date with fallback
    const getObservationDate = (obs) => {
      if (obs.observedAt?.toDate) return obs.observedAt.toDate();
      if (obs.createdAt?.toDate) return obs.createdAt.toDate();
      if (obs.observedAt?.seconds) return new Date(obs.observedAt.seconds * 1000);
      if (obs.createdAt?.seconds) return new Date(obs.createdAt.seconds * 1000);
      return new Date(0); // fallback
    };

    const startOfDay = (d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };

    switch (period) {
      case '1D': {
        // Last 24 hours in 4-hour trailing windows ending at now
        for (let i = 5; i >= 0; i--) {
          const end = new Date(now.getTime() - i * 4 * hourMs);
          const start = new Date(end.getTime() - 4 * hourMs);

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
      }

      case '1W': {
        // Last 7 days aligned to local midnights; last bucket includes today so far
        const end0 = new Date(startOfDay(now).getTime() + dayMs); // tomorrow 00:00
        for (let i = 6; i >= 0; i--) {
          const start = new Date(end0.getTime() - (i + 1) * dayMs);
          const end = new Date(end0.getTime() - i * dayMs);

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
      }

      case '1M': {
        // Last 4 rolling weeks, aligned to local midnight; last bucket includes today so far
        const end0 = new Date(startOfDay(now).getTime() + dayMs); // tomorrow 00:00
        for (let i = 3; i >= 0; i--) {
          const weekStart = new Date(end0.getTime() - (i + 1) * 7 * dayMs);
          const weekEnd = new Date(end0.getTime() - i * 7 * dayMs);

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
      }
        
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
    
    if (!mounted) {
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
            Coach Pepper is crunching the numbers…
          </Typography>
        </Box>
      );
    }
    
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

    // Don't render chart until mounted AND container has dimensions
    if (!mounted || activityData.length === 0) {
      return (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: 250,
          backgroundColor: 'grey.50',
          borderRadius: 2
        }}>
          <Typography variant="body2" color="text.secondary">
            {!mounted ? 'Loading chart...' : 'No trend data available for ' + timePeriod}
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ height: 250, width: '100%', minWidth: 0, minHeight: 250, position: 'relative' }}>
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
                        {payload[0].value} {payload[0].value === 1 ? 'note' : 'notes'}
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
        py: 8,
        gap: 2,
        flexDirection: 'column'
      }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Coach Pepper is tallying the stats...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 3,
      pb: 4,
      width: '100%',
      minWidth: 0
    }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
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

      {/* Statistics Content */}
      <Card sx={{ 
        borderRadius: 3,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        width: '100%',
        minWidth: 0
      }}>
        {/* Replace tabs with grid navigation */}
        <CardContent sx={{ p: 3, width: '100%', minWidth: 0 }}>
          {/* Compact Tabs Header */}
          <Box sx={{ 
            backgroundColor: 'white',
            borderRadius: 1,
            overflow: 'hidden',
            position: 'sticky',
            top: 0,
            zIndex: 1,
            borderBottom: '1px solid #e2e8f0',
            mb: 2
          }}>
            <Tabs 
              value={activeTab} 
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{
                '& .MuiTab-root': {
                  minHeight: 44,
                  textTransform: 'none',
                  fontWeight: 600
                },
                '& .MuiTabs-scrollButtons': {
                  '&.Mui-disabled': {
                    opacity: 0.3
                  }
                }
              }}
            >
              <Tab icon={<BarChart />} label="Overview" iconPosition="start" />
              <Tab icon={<School />} label="Classrooms" iconPosition="start" />
              {role !== 'teacher' && (
                <Tab icon={<People />} label="Teachers" iconPosition="start" />
              )}
              {role !== 'teacher' && (
                <Tab icon={<People />} label="Students" iconPosition="start" />
              )}
            </Tabs>
          </Box>
          
          {/* Divider removed to reduce visual clutter */}

          {/* Content based on active tab */}
          
          {/* Performance target header removed */}
          
          {/* Overview Tab */}
          {activeTab === 0 && (
            <Box sx={{ width: '100%', minWidth: 0 }}>
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
                    {activityCount}
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
                mb: 3,
                width: '100%',
                minWidth: 0
              }}>
                <ActivityTrendChart />
              </Box>

              {/* Note Distribution Card */}
              
                <Box sx={{ 
                  backgroundColor: 'white',
                  borderRadius: 2,
                  p: 3,
                  border: '1px solid #e2e8f0',
                  mb: 3,
                  width: '100%',
                  minWidth: 0
                }}>
                  {/* Header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      All Time Note Distribution
                    </Typography>
                  </Box>
                  
                  {/* Pie Chart */}
                  {mounted ? (
                    <Box sx={{ height: 250, width: '100%', minWidth: 0, minHeight: 250, position: 'relative' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={0}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            label={renderNoteDistributionLabel}
                            labelLine={false}
                            isAnimationActive={false}
                          >
                            {pieChartData.map((entry) => (
                              <Cell 
                                key={`cell-${entry.name}-${entry.value}`}
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
                  ) : (
                    <Box sx={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      height: 200,
                      backgroundColor: 'grey.50',
                      borderRadius: 2
                    }}>
                      <Typography variant="body2" color="text.secondary">
                        Coach Pepper is painting the breakdown…
                      </Typography>
                    </Box>
                  )}
                  
                  {/* Simple Legend */}
                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 4 }}>
                    {pieChartData.map((item, index) => (
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

              {/* Voice Note Language Distribution removed */}
            </Box>
          )}

          {/* Classrooms Tab */}
          {activeTab === 1 && (
            tabLoadingStates[1] ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                  Loading classrooms data...
                </Typography>
              </Box>
            ) : (
            <Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {role === 'teacher' ? 'My Classrooms' : 'Classroom Performance'}
              </Typography>
              {/* Branch Selector (Admin Only) - Dropdown */}
                {isAdmin && (
                  <Box sx={{ mb: 3 }}>
                    {branches.length > 0 ? (
                      <FormControl 
                        size="small" 
                        sx={{ 
                          minWidth: 220,
                          '& .MuiInputLabel-root': {
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: 'text.secondary'
                          },
                          '& .MuiOutlinedInput-root': {
                            fontSize: '0.9375rem',
                            fontWeight: 600,
                            backgroundColor: 'white',
                            '& .MuiSelect-select': {
                              py: 1.25,
                              px: 1.5
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                              borderColor: 'primary.main'
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                              borderColor: 'primary.main',
                              borderWidth: 2
                            }
                          }
                        }}
                      >
                        <InputLabel id="branch-select-label">Select Branch</InputLabel>
                        <Select
                          labelId="branch-select-label"
                          value={selectedBranchId || ''}
                          label="Select Branch"
                          onChange={(e) => setSelectedBranchId(e.target.value)}
                          MenuProps={{
                            PaperProps: {
                              sx: {
                                mt: 1,
                                borderRadius: 2,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                '& .MuiMenuItem-root': {
                                  fontSize: '0.9375rem',
                                  fontWeight: 500,
                                  py: 1.25,
                                  px: 1.5,
                                  '&:hover': {
                                    backgroundColor: 'primary.50'
                                  },
                                  '&.Mui-selected': {
                                    backgroundColor: 'primary.100',
                                    fontWeight: 600,
                                    '&:hover': {
                                      backgroundColor: 'primary.100'
                                    }
                                  }
                                }
                              }
                            }
                          }}
                        >
                          {branches.map((branch) => (
                            <MenuItem key={branch.id} value={branch.id}>
                              {branch.name || branch.id.toUpperCase()}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                        Coach Pepper is sorting through branches...
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
              
              {stats.classroomStats.length > 0 ? (
                <Box sx={{ width: '100%', minWidth: 0 }}>
                  {/* Classroom Comparison Chart */}
                  <Box sx={{ mb: 3, width: '100%', minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                      {role === 'teacher' ? 'My Classrooms This Week' : 'Notes This Week'}
                    </Typography>
                    <ClassroomComparisonChart />
                  </Box>
                </Box>
              ) : (
                <Alert severity="info">
                  No classroom data available.
                </Alert>
              )}
            </Box>
            )
          )}

          {/* Teachers Tab */}
          {activeTab === 2 && (
            tabLoadingStates[2] ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                  Loading teachers data...
                </Typography>
              </Box>
            ) : (
            <Box>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Teacher Performance
              </Typography>
              
              {stats.teacherStats.length > 0 ? (
                <Box>
                  {/* Search Bar */}
                  <Box sx={{ mb: 3 }}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Search teachers by name..."
                      value={teacherSearchQuery}
                      onChange={(e) => setTeacherSearchQuery(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <Box sx={{ color: 'text.secondary', mr: 1 }}>
                            <People sx={{ fontSize: 20 }} />
                          </Box>
                        ),
                        endAdornment: (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {teacherSearchQuery && (
                              <IconButton
                                size="small"
                                onClick={() => setTeacherSearchQuery('')}
                                sx={{ p: 0.5 }}
                                aria-label="Clear search"
                              >
                                <Clear sx={{ fontSize: 16 }} />
                              </IconButton>
                            )}
                          </Box>
                        )
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                          backgroundColor: 'white',
                          '&:hover': {
                            backgroundColor: 'grey.50'
                          }
                        }
                      }}
                    />
                  </Box>
                  {/* Filters (like Manage Users) */}
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                    <Chip label="All" size="small" clickable onClick={() => setTeacherStatusFilter('all')} color={teacherStatusFilter==='all'?'primary':'default'} variant={teacherStatusFilter==='all'?'filled':'outlined'} />
                    <Chip label="Active" size="small" clickable onClick={() => setTeacherStatusFilter('active')} color={teacherStatusFilter==='active'?'primary':'default'} variant={teacherStatusFilter==='active'?'filled':'outlined'} />
                    <Chip label="Inactive" size="small" clickable onClick={() => setTeacherStatusFilter('inactive')} color={teacherStatusFilter==='inactive'?'primary':'default'} variant={teacherStatusFilter==='inactive'?'filled':'outlined'} />
                    <Chip label="No Classrooms" size="small" clickable onClick={() => setTeacherOnlyNoClassrooms(v=>!v)} color={teacherOnlyNoClassrooms?'primary':'default'} variant={teacherOnlyNoClassrooms?'filled':'outlined'} />
                    <Chip
                      label={selectedTeacherClassroomFilterIds.length > 0 ? `Classrooms (${selectedTeacherClassroomFilterIds.length})` : 'Classrooms'}
                      size="small"
                      clickable
                      onClick={() => setTeacherClassroomFilterOpen(true)}
                      color={selectedTeacherClassroomFilterIds.length>0?'primary':'default'}
                      variant={selectedTeacherClassroomFilterIds.length>0?'filled':'outlined'}
                      disabled={teacherOnlyNoClassrooms}
                    />
                  </Box>
                  {/* Teacher List (14-day activity) */}
                  <Box sx={{ mb: 3 }}>
                    {filteredTeacherStats.slice(0, teachersToShow).map((teacher) => (
                      <Box
                        key={teacher.id}
                        sx={{
                          mb: 1.5,
                          p: 2,
                          backgroundColor: 'white',
                          borderRadius: 2,
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {teacher.name}
                            </Typography>
                            {teacher.status && teacher.status !== 'active' && (
                              <Chip size="small" color="warning" variant="outlined" label="Inactive" />
                            )}
                          </Box>
                          <Chip
                            size="small"
                            label={`${teacher.last14DaysObservations} ${teacher.last14DaysObservations === 1 ? 'note' : 'notes'} in 14d`}
                            color={teacher.last14DaysObservations === 0 ? 'error' : 'primary'}
                            variant={teacher.last14DaysObservations === 0 ? 'filled' : 'outlined'}
                          />
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Chip size="small" variant="outlined" color="success" label={`Voice: ${teacher.last14DaysVoice}`} />
                          <Chip size="small" variant="outlined" color="info" label={`Text: ${teacher.last14DaysText}`} />
                        </Box>
                      </Box>
                    ))}
                    {/* Show "View 5 more teachers" button if there are more teachers to show */}
                    {filteredTeacherStats.length > teachersToShow && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                        <Button
                          variant="outlined"
                          onClick={() => setTeachersToShow(prev => prev + 5)}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            px: 3,
                            py: 1,
                            borderRadius: 2,
                            borderColor: 'primary.main',
                            color: 'primary.main',
                            '&:hover': {
                              borderColor: 'primary.dark',
                              backgroundColor: 'primary.50'
                            }
                          }}
                        >
                          View 5 more teachers
                        </Button>
                      </Box>
                    )}
                  </Box>
                  {/* Classroom Filter dialog */}
                  <Dialog open={teacherClassroomFilterOpen} onClose={() => setTeacherClassroomFilterOpen(false)}>
                    <DialogTitle component="div">
                      <Typography component="h2" variant="h6">Filter by Classrooms</Typography>
                    </DialogTitle>
                    <DialogContent>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                        {classrooms.map(c => (
                          <Chip
                            key={c.id}
                            label={c.name || c.id}
                            onClick={() => setSelectedTeacherClassroomFilterIds(prev => prev.includes(c.id) ? prev.filter(x=>x!==c.id) : [...prev, c.id])}
                            color={selectedTeacherClassroomFilterIds.includes(c.id) ? 'primary' : 'default'}
                            variant={selectedTeacherClassroomFilterIds.includes(c.id) ? 'filled' : 'outlined'}
                            clickable
                            size="small"
                          />
                        ))}
                      </Box>
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={() => setSelectedTeacherClassroomFilterIds([])}>Clear</Button>
                      <Button variant="contained" onClick={() => setTeacherClassroomFilterOpen(false)}>Apply</Button>
                    </DialogActions>
                  </Dialog>
                  
                </Box>
              ) : (
                <Alert severity="info">
                  No teacher data available.
                </Alert>
              )}
            </Box>
            )
          )}

          {/* Students Tab */}
          {activeTab === 3 && (
            tabLoadingStates[3] ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                  Loading students data...
                </Typography>
              </Box>
            ) : (
            <Box>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Student Performance
              </Typography>
              
              {stats.topStudents.length > 0 ? (
                <Box>
                  {/* Performance Summary */}
                  <Box sx={{ 
                    p: 2, 
                    backgroundColor: '#f8fafc', 
                    borderRadius: 2, 
                    border: '1px solid #e2e8f0',
                    mb: 3
                  }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary' }}>
                      Performance Summary
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Top Performers</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                          {stats.topStudents.filter(s => isHighPerformer(calculateStudentPerformance(s.thisWeekCount))).length} students
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">On Track</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'warning.main' }}>
                          {stats.topStudents.filter(s => isMediumPerformer(calculateStudentPerformance(s.thisWeekCount))).length} students
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Needs Support</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                          {stats.topStudents.filter(s => isLowPerformer(calculateStudentPerformance(s.thisWeekCount))).length} students
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Average Notes</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {stats.topStudents.length > 0 ? 
                            (stats.topStudents.reduce((sum, s) => sum + s.thisWeekCount, 0) / stats.topStudents.length).toFixed(1) : '0.0'}
                        </Typography>
                      </Box>
                    </Box>
                    

                  </Box>

                  {/* Search Bar */}
                  <Box sx={{ mb: 3 }}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Search students by name..."
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <Box sx={{ color: 'text.secondary', mr: 1 }}>
                            <People sx={{ fontSize: 20 }} />
                          </Box>
                        ),
                        endAdornment: (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {studentSearchQuery && (
                              <IconButton
                                size="small"
                                onClick={() => setStudentSearchQuery('')}
                                sx={{ p: 0.5 }}
                                aria-label="Clear search"
                              >
                                <Clear sx={{ fontSize: 16 }} />
                              </IconButton>
                            )}
                          </Box>
                        )
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 2,
                          backgroundColor: 'white',
                          '&:hover': {
                            backgroundColor: 'grey.50'
                          }
                        }
                      }}
                    />
                  </Box>

                  {/* Student Cards with Horizontal Bars */}
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'text.secondary' }}>
                      Pick a student to view detailed stats
                    </Typography>
                    
                    {/* Show placeholder when no search query, actual students when searching */}
                    {!studentSearchQuery.trim() ? (
                      // Placeholder card when no search
                      <Box sx={{ 
                        p: 3, 
                        backgroundColor: 'grey.50', 
                        borderRadius: 2, 
                        border: '1px dashed #cbd5e1',
                        textAlign: 'center'
                      }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Search for a student above to view their performance
                        </Typography>
                        <Box sx={{ 
                          position: 'relative', 
                          height: 12, 
                          backgroundColor: '#e2e8f0', 
                          borderRadius: 6,
                          overflow: 'hidden'
                        }}>
                          <Box sx={{
                            height: '100%',
                            width: '0%',
                            backgroundColor: '#9ca3af',
                            borderRadius: 6
                          }} />
                        </Box>

                      </Box>
                    ) : (
                      // Show actual students when searching
                      (() => {
                        const displayStudents = fuzzySearchStudents(stats.topStudents, studentSearchQuery.trim());
                        
                        if (displayStudents.length === 0) {
                          return (
                            <Box sx={{ 
                              textAlign: 'center', 
                              py: 4, 
                              color: 'text.secondary',
                              backgroundColor: 'grey.50',
                              borderRadius: 2
                            }}>
                              <Typography variant="body2">
                                No students found matching your search.
                              </Typography>
                            </Box>
                          );
                        }
                        
                        return displayStudents.map((student, index) => {
                          const target = PERFORMANCE_TARGETS.STUDENT.NOTES_PER_WEEK;
                          const percentage = calculateStudentPerformance(student.thisWeekCount);
                          const isTopPerformer = student.thisWeekCount >= PERFORMANCE_TARGETS.STUDENT.NOTES_PER_WEEK;
                          const isSelected = selectedStudent?.id === student.id;
                          
                          return (
                            <Box key={student.id} sx={{ 
                              mb: 1.5, 
                              p: 2, 
                              backgroundColor: isSelected ? 'primary.50' : 'white', 
                              borderRadius: 2, 
                              border: isSelected ? '2px solid' : '1px solid',
                              borderColor: isSelected ? 'primary.main' : '#e2e8f0',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                backgroundColor: isSelected ? 'primary.50' : 'grey.50',
                                transform: 'translateY(-1px)',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                              }
                            }}
                            onClick={() => setSelectedStudent(isSelected ? null : student)}
                            >
                              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    fontWeight: 600,
                                    minWidth: 120,
                                    color: isTopPerformer ? 'success.main' : 'text.primary'
                                  }}
                                >
                                  {student.name}
                                </Typography>
                                <Typography 
                                  variant="body2" 
                                  color="text.secondary" 
                                  sx={{ minWidth: 80, textAlign: 'right', mr: 2 }}
                                >
                                  {student.thisWeekCount} notes
                                </Typography>
                              </Box>
                              
                              {/* Horizontal Progress Bar */}
                              <Box sx={{ 
                                position: 'relative', 
                                height: 12, 
                                backgroundColor: '#f1f5f9', 
                                borderRadius: 6,
                                overflow: 'hidden'
                              }}>
                                <Box sx={{
                                  height: '100%',
                                  width: `${percentage}%`,
                                  backgroundColor: percentage >= 100 ? '#10b981' : 
                                                 isHighPerformer(percentage) ? '#f59e0b' : '#ef4444',
                                  borderRadius: 6,
                                  transition: 'width 0.3s ease',
                                  position: 'relative'
                                }}>
                                  {/* Target line indicator */}
                                  {percentage < 100 && (
                                    <Box sx={{
                                      position: 'absolute',
                                      right: 0,
                                      top: 0,
                                      height: '100%',
                                      width: '2px',
                                      backgroundColor: 'white',
                                      boxShadow: '0 0 4px rgba(0,0,0,0.3)'
                                    }} />
                                  )}
                                </Box>
                                
                                {/* Target marker */}
                                <Box sx={{
                                  position: 'absolute',
                                  left: `${Math.min((PERFORMANCE_TARGETS.STUDENT.NOTES_PER_WEEK / Math.max(...stats.topStudents.map(s => s.thisWeekCount))) * 100, 100)}%`,
                                  top: 0,
                                  height: '100%',
                                  width: '2px',
                                  backgroundColor: '#64748b',
                                  opacity: 0.6
                                }} />
                              </Box>
                              

                            </Box>
                          );
                        });
                      })()
                    )}
                  </Box>

                  {/* Selected Student Detailed Stats */}
                  {selectedStudent && (
                    <Box sx={{ 
                      p: 3, 
                      backgroundColor: 'primary.50', 
                      borderRadius: 2, 
                      border: '1px solid',
                      borderColor: 'primary.200'
                    }}>
                      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: 'primary.main' }}>
                        {selectedStudent.name} - Detailed Stats
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main' }}>
                            {selectedStudent.thisWeekCount}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Notes This Week
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                            {selectedStudent.count}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Total Notes
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ mt: 2, textAlign: 'center' }}>
                        <Button 
                          size="small" 
                          onClick={() => setSelectedStudent(null)}
                          variant="outlined"
                        >
                          Close Details
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              ) : (
                <Alert severity="info">
                  No student data available.
                </Alert>
              )}
            </Box>
            )
          )}
        </CardContent>
      </Card>


    </Box>
  );
};

export default StatsPage; 
