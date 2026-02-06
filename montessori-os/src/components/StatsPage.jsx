import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Button,
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
  ArrowBack
} from '@mui/icons-material';
import { collection, collectionGroup, query, getDocs, orderBy, where, documentId } from 'firebase/firestore';
import { db } from '../firebase';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import PerformanceSummaryCard from './PerformanceSummaryCard';
import { isAdminRole } from '../utils/roleUtils';
// Granular cache system - each data type cached separately (role scoping applies in-memory)
const CACHE_KEY_PREFIX = 'statsPageCache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (1 day)

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

const StatsPage = ({ user, role, manageableClassrooms = [], onBack, onNavigateToStudent, onNavigateToBaseballCard }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [timePeriod, setTimePeriod] = useState('1W');
  const [classroomTimePeriod, setClassroomTimePeriod] = useState('1W');
  const [teacherTimePeriod, setTeacherTimePeriod] = useState('1W');
  const [selectedTeacherClassroomId, setSelectedTeacherClassroomId] = useState('');
  const [stats, setStats] = useState({
    totalObservations: 0,
    thisWeek: 0,
    lastWeek: 0,
    thisWeekChange: 0,
    voiceNotes: 0,
    textNotes: 0,
    lessonNotes: 0,
    voiceLanguageDistribution: [],
    topStudents: [],
    weeklyActivity: [],
    teacherStats: [],
    classroomStats: [],
    allObservations: [],
    loading: true
  });

  // Data lists
  const [classrooms, setClassrooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [roleScopedStudents, setRoleScopedStudents] = useState([]);
  const [roleScopedObservations, setRoleScopedObservations] = useState([]);
  const [mounted, setMounted] = useState(false);
  
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

  const singleBranchId = useMemo(() => {
    if (!isClassroomAdmin) return null;
    const branchIds = Array.from(new Set(
      (classrooms || []).map(c => c?.branchId).filter(Boolean)
    ));
    return branchIds.length === 1 ? branchIds[0] : null;
  }, [classrooms, isClassroomAdmin]);

  const hideBranchSelector = Boolean(isClassroomAdmin && singleBranchId);

  // Base cache key (user/role context) - stable across tabs
  const baseCacheKey = useMemo(() => buildBaseCacheKey(
    user?.uid,
    role,
    manageableClassrooms
  ), [user?.uid, role, manageableClassrooms]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (hideBranchSelector && singleBranchId && selectedBranchId !== singleBranchId) {
      setSelectedBranchId(singleBranchId);
    }
  }, [hideBranchSelector, singleBranchId, selectedBranchId]);

  useEffect(() => {
    if (!selectedTeacherClassroomId) return;
    const exists = (classrooms || []).some((classroom) => classroom.id === selectedTeacherClassroomId);
    if (!exists) {
      setSelectedTeacherClassroomId('');
    }
  }, [classrooms, selectedTeacherClassroomId]);

  // Helper function to fetch data for a specific tab
  const fetchTabData = async (tabIndex) => {
    // Guard: classroom admins must have scoped classrooms; otherwise stop and show error
    if (isClassroomAdmin && scopedClassrooms.length === 0) {
      setScopeError('Your classroom access is missing. Please contact a super admin to add manageable classrooms.');
      setClassrooms([]);
      setTeachers([]);
      setStudents([]);
      setStats(prev => ({ ...prev, loading: false }));
      return;
    } else {
      setScopeError('');
    }

    // Determine what data this tab needs
    const needsObservations = tabIndex === 0 || tabIndex === 1 || tabIndex === 2 || tabIndex === 3; // All tabs need observations
    const needsClassrooms = true; // Required for role scoping and teacher grouping
    const needsTeachers = true;
    const needsStudents = true;
    const needsBranches = isAdmin;

    // Check cache for each data type independently
    let cachedObservations = needsObservations ? getCachedData(baseCacheKey, 'observations') : null;
    let cachedStats = needsObservations ? getCachedData(baseCacheKey, 'stats') : null;
    const cachedClassrooms = needsClassrooms ? getCachedData(baseCacheKey, 'classrooms') : null;
    const cachedTeachers = needsTeachers ? getCachedData(baseCacheKey, 'teachers') : null;
    const cachedStudents = needsStudents ? getCachedData(baseCacheKey, 'students') : null;
    const cachedBranches = needsBranches ? getCachedData(baseCacheKey, 'branches') : null;

    // Invalidate cached stats if they predate the teacher observation/lesson split
    if (
      needsTeachers &&
      cachedStats &&
      Array.isArray(cachedStats.teacherStats) &&
      cachedStats.teacherStats.some(teacher =>
        teacher.last14DaysObservationNotes === undefined ||
        teacher.last14DaysLessonNotes === undefined
      )
    ) {
      cachedStats = null;
    }

    // If we have cached students but cached observations is an empty list, it's very likely a stale cache
    // created during a previous index/permission failure. Invalidate observations+stats cache and refetch.
    if (
      needsObservations &&
      Array.isArray(cachedStudents) && cachedStudents.length > 0 &&
      Array.isArray(cachedObservations) && cachedObservations.length === 0
    ) {
      try {
        const obsKey = buildDataTypeCacheKey(baseCacheKey, 'observations');
        const statsKey = buildDataTypeCacheKey(baseCacheKey, 'stats');
        window.localStorage.removeItem(obsKey);
        window.localStorage.removeItem(statsKey);
      } catch (_) {
        // ignore
      }
      cachedObservations = null;
      cachedStats = null;
    }

    const canUseCachedStats = !!cachedStats;

    // If we have all cached data needed for this tab, use it
    const hasAllCachedData = 
      (!needsObservations || (cachedObservations && canUseCachedStats)) &&
      (!needsClassrooms || cachedClassrooms) &&
      (!needsTeachers || cachedTeachers) &&
      (!needsStudents || cachedStudents) &&
      (!needsBranches || cachedBranches);

    if (hasAllCachedData) {
      // Use cached data - set state immediately
      if (canUseCachedStats) {
        const observations = Array.isArray(cachedObservations) ? cachedObservations : [];
        const normalizedTeacherStats = (cachedStats?.teacherStats || []).map((teacher) => {
          const observationNotes = teacher.last14DaysObservationNotes ?? (
            (teacher.last14DaysVoice || 0) + (teacher.last14DaysText || 0)
          );
          const lessonNotes = teacher.last14DaysLessonNotes ?? 0;
          return {
            ...teacher,
            last14DaysObservationNotes: observationNotes,
            last14DaysLessonNotes: lessonNotes
          };
        });
        setStats({
          ...cachedStats,
          teacherStats: normalizedTeacherStats,
          allObservations: observations,
          loading: false
        });
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
      if (canUseCachedStats) {
        setTabLoadingStates(prev => ({ ...prev, [tabIndex]: false }));
        return;
      }
      // Otherwise, continue to fetchData to recalculate stats from cached observations
    }

    const fetchData = async () => {
      try {
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
        if (needsBranches && !cachedBranches) {
          try {
            const branchesQuery = query(collection(db, 'branches'));
            const branchesSnap = await getDocs(branchesQuery);
            branchesData = branchesSnap.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                name: data.name || doc.id.toUpperCase(),
                classrooms: data.classrooms || [],
                ...data
              };
            });
            branchesData.sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
              }
              return (a.name || a.id).localeCompare(b.name || b.id);
            });
            setBranches(branchesData);
            if (isAdmin && selectedBranchId === null && branchesData.length > 0) {
              setSelectedBranchId(branchesData[0].id);
            }
          } catch (error) {
            console.error('Branches query failed:', error);
            console.error('Error details:', error.message, error.code);
            setBranches([]);
          }
        }
        const isActiveClassroom = (classroom) => (classroom?.status || 'active') === 'active';

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
                where(documentId(), 'in', batch)
              );
              const classroomsSnap = await getDocs(classroomsQuery);
              classroomsSnap.docs.forEach(doc => {
                classroomsData.push({ id: doc.id, ...doc.data() });
              });
            }
            classroomsData = classroomsData.filter(isActiveClassroom);
          } else {
            const classroomConstraints = [where('status', '==', 'active')];
            const classroomsQuery = query(collection(db, 'classrooms'), ...classroomConstraints);
            const classroomsSnap = await getDocs(classroomsQuery);
            classroomsData = classroomsSnap.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            classroomsData = classroomsData.filter(isActiveClassroom);
            if (classroomsData.length === 0) {
              const fallbackSnap = await getDocs(collection(db, 'classrooms'));
              classroomsData = fallbackSnap.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(isActiveClassroom);
            }
          }
          } catch (error) {
            console.error('Classrooms query failed:', error);
            classroomsData = [];
          }
        }
        
        // Fetch all users (teachers, superadmins, classroomadmins) - only if needed for this tab and not cached
        if (needsTeachers && !cachedTeachers) {
          try {
          // First try to get all users to see if the collection is accessible
          const allUsersQuery = query(collection(db, 'users'));
          const allUsersSnap = await getDocs(allUsersQuery);
          
          // Include all users (teachers, superadmins, classroomadmins)
          const allUsers = allUsersSnap.docs.filter(doc => {
            const userRole = doc.data().role;
            return userRole === 'teacher' || userRole === 'superadmin' || userRole === 'classroomadmin';
          });
          
          teachersData = allUsers.map(doc => ({
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

        const roleScopedObservations = filteredObservations;
        setRoleScopedObservations(roleScopedObservations);
        setRoleScopedStudents(filteredStudentsData);
        
        setClassrooms(filteredClassroomsData);
        setTeachers(filteredTeachersData);
        setStudents(filteredStudentsData);

        // Calculate weekly stats
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const fortyTwoDaysAgo = new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000);

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

        // Calculate note types (mutually exclusive to prevent double counting)
        const isLessonNote = (obs) => obs?.type === 'lesson' || !!obs?.lessonTitle;
        const isVoiceNote = (obs) =>
          !isLessonNote(obs) &&
          (obs?.tags?.type === 'voice' ||
            obs?.type === 'voice' ||
            obs?.tags?.includes?.('voice') ||
            !!obs?.duration);
        const isTextNote = (obs) =>
          !isLessonNote(obs) &&
          !isVoiceNote(obs) &&
          (obs?.tags?.type === 'text' ||
            obs?.type === 'text' ||
            obs?.tags?.includes?.('text') ||
            (!obs?.duration && !!obs?.text));

        const lessonNotes = filteredObservations.filter(isLessonNote);
        const voiceNotes = filteredObservations.filter(isVoiceNote);
        const textNotes = filteredObservations.filter(isTextNote);

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
          const thisWeekLessonNotes = thisWeekObs.filter(isLessonNote).length;
          const thisWeekObservationNotes = thisWeekObs.length - thisWeekLessonNotes;
          
          return {
            id: classroom.id,
            name: classroom.name,
            branchId: classroom.branchId, // Include branchId for filtering
            studentCount: classroomStudents.length,
            totalObservations: classroomObservations.length,
            thisWeekObservations: thisWeekObs.length,
            thisWeekLessonNotes,
            thisWeekObservationNotes,
            avgPerStudent: classroomStudents.length > 0 ? 
              (thisWeekObs.length / classroomStudents.length) : 0,
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

          const last14LessonNotes = last14DaysObs.filter(isLessonNote).length;
          const last14Observations = last14DaysObs.filter(obs => !isLessonNote(obs)).length;
          
          return {
            id: teacher.id,
            name: teacher.displayName || teacher.email,
            email: teacher.email,
            status: teacher.status,
            totalObservations: teacherObservations.length,
            thisWeekObservations: thisWeekObs.length,
            last14DaysObservations: last14DaysObs.length,
            last14DaysObservationNotes: last14Observations,
            last14DaysLessonNotes: last14LessonNotes
          };
        });

        // Calculate student performance
        const studentStats = {};
        
        // Active students only (default missing status -> active)
        const activeStudentsData = (Array.isArray(studentsData) ? studentsData : [])
          .filter((student) => (student?.status || 'active') === 'active');

        // Initialize ALL active students with 0 counts (including those with no observations)
        activeStudentsData.forEach(student => {
          studentStats[student.id] = { 
            id: student.id,
            name: student.displayName || student.name || 'Unknown Student',
            classroomId: student.classroomId,
            count: 0,
            thisWeekCount: 0,
            last42DaysCount: 0
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
            if (obsDate >= fortyTwoDaysAgo) {
              studentStats[obs.studentId].last42DaysCount++;
            }
          }
        });

        // For admins, show ALL students. For teachers, this will be filtered by their classrooms
        const topStudents = Object.values(studentStats)
          .sort((a, b) => b.thisWeekCount - a.thisWeekCount);

        // 42-day performance buckets
        const performance42DaySummary = (() => {
          const values = Object.values(studentStats);
          const totals = {
            excellent: 0, // 12+
            sufficient: 0, // 8-11
            needsSupport: 0, // 4-7
            immediateAttention: 0, // 0-3
            studentCount: values.length,
            averageNotes: 0,
            totalNotes: 0,
          };
          if (values.length === 0) return totals;

          for (const s of values) {
            const n = Number.isFinite(s?.last42DaysCount) ? s.last42DaysCount : 0;
            totals.totalNotes += n;
            if (n >= 12) totals.excellent += 1;
            else if (n >= 8) totals.sufficient += 1;
            else if (n >= 4) totals.needsSupport += 1;
            else totals.immediateAttention += 1;
          }
          totals.averageNotes = totals.totalNotes / totals.studentCount;
          return totals;
        })();

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
          lessonNotes: lessonNotes.length,
          topStudents,
          performance42DaySummary,
          weeklyActivity,
          teacherStats,
          classroomStats,
          allObservations: filteredObservations,
          voiceLanguageDistribution,
          loading: false
        };
        
        const statsCachePayload = { ...statsPayload };
        delete statsCachePayload.allObservations;
        setStats(statsPayload);
        
        // Cache each data type separately (cache role-scoped observations, stats only for full-scope views)
        if (needsObservations && !cachedObservations) {
          setCachedData(baseCacheKey, 'observations', roleScopedObservations);
        }
        if (needsObservations && !cachedStats) {
          setCachedData(baseCacheKey, 'stats', statsCachePayload);
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
        setTabLoadingStates(prev => ({ ...prev, [tabIndex]: false }));
      }
    };

    fetchData();
  };

  // Load Overview tab data immediately (default tab) - this loads observations for charts
  useEffect(() => {
    fetchTabData(0);
  }, [user, role, baseCacheKey, isClassroomAdmin, scopedClassrooms.join('|')]);

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

  // Helper function to get observation date with fallback
  const getObservationDateFast = useCallback((obs) => {
    if (obs?.observedAt?.toDate) return obs.observedAt.toDate();
    if (obs?.createdAt?.toDate) return obs.createdAt.toDate();
    if (obs?.observedAt?.seconds) return new Date(obs.observedAt.seconds * 1000);
    if (obs?.createdAt?.seconds) return new Date(obs.createdAt.seconds * 1000);
    return new Date(0);
  }, []);

  const isLessonNoteFast = useCallback((obs) => obs?.type === 'lesson' || !!obs?.lessonTitle, []);

  const computePerformanceSummary = (studentsList = [], observationsList = []) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000);
    const activeStudents = (Array.isArray(studentsList) ? studentsList : [])
      .filter((student) => (student?.status || 'active') === 'active');

    const studentIds = new Set(activeStudents.map((student) => student.id).filter(Boolean));
    const countsByStudent = Object.fromEntries(activeStudents.map((student) => [student.id, 0]));

    (Array.isArray(observationsList) ? observationsList : []).forEach((obs) => {
      const studentId = obs?.studentId;
      if (!studentId || !studentIds.has(studentId)) return;
      const obsDate = getObservationDateFast(obs);
      if (obsDate < cutoff) return;
      countsByStudent[studentId] += 1;
    });

    const totals = {
      excellent: 0,
      sufficient: 0,
      needsSupport: 0,
      immediateAttention: 0,
      studentCount: activeStudents.length,
      averageNotes: 0,
      totalNotes: 0
    };

    if (activeStudents.length > 0) {
      Object.values(countsByStudent).forEach((count) => {
        const n = Number.isFinite(count) ? count : 0;
        totals.totalNotes += n;
        if (n >= 12) totals.excellent += 1;
        else if (n >= 8) totals.sufficient += 1;
        else if (n >= 4) totals.needsSupport += 1;
        else totals.immediateAttention += 1;
      });
      totals.averageNotes = totals.totalNotes / totals.studentCount;
    }

    return totals;
  };

  const performanceSummaryForCard = useMemo(
    () => computePerformanceSummary(roleScopedStudents, roleScopedObservations),
    [roleScopedStudents, roleScopedObservations]
  );

  const classroomStatsForPeriod = useMemo(() => {
    const days = classroomTimePeriod === '1M' ? 30 : 7;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const classroomByStudent = new Map();
    (students || []).forEach((student) => {
      if (student?.id && student?.classroomId) {
        classroomByStudent.set(student.id, student.classroomId);
      }
    });

    const countsByClassroom = new Map();
    const ensureCounts = (classroomId) => {
      if (!countsByClassroom.has(classroomId)) {
        countsByClassroom.set(classroomId, { observationNotes: 0, lessonNotes: 0 });
      }
      return countsByClassroom.get(classroomId);
    };

    (stats?.allObservations || []).forEach((obs) => {
      const obsDate = getObservationDateFast(obs);
      if (obsDate < cutoff) return;
      const classroomId = obs?.classroomId || classroomByStudent.get(obs?.studentId);
      if (!classroomId) return;
      const counts = ensureCounts(classroomId);
      if (isLessonNoteFast(obs)) {
        counts.lessonNotes += 1;
      } else {
        counts.observationNotes += 1;
      }
    });

    return (classrooms || []).map((classroom) => {
      const counts = countsByClassroom.get(classroom.id) || { observationNotes: 0, lessonNotes: 0 };
      return {
        id: classroom.id,
        name: classroom.name,
        branchId: classroom.branchId,
        thisWeekObservationNotes: counts.observationNotes,
        thisWeekLessonNotes: counts.lessonNotes
      };
    });
  }, [classroomTimePeriod, stats?.allObservations, students, classrooms, getObservationDateFast, isLessonNoteFast]);

  // Filter observations by time period for pie chart
  const filteredObservationsForPie = useMemo(() => {
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
    return list.filter(o => getObservationDateFast(o) >= start);
  }, [stats?.allObservations, timePeriod]);

  // Memoize pie chart data to prevent re-renders when time period changes
  const pieChartData = useMemo(() => {
    // Calculate note types from filtered observations (mutually exclusive)
    const isLessonNote = (obs) => obs?.type === 'lesson' || !!obs?.lessonTitle;
    const isVoiceNote = (obs) =>
      !isLessonNote(obs) &&
      (obs?.tags?.type === 'voice' ||
        obs?.type === 'voice' ||
        obs?.tags?.includes?.('voice') ||
        !!obs?.duration);
    const isTextNote = (obs) =>
      !isLessonNote(obs) &&
      !isVoiceNote(obs) &&
      (obs?.tags?.type === 'text' ||
        obs?.type === 'text' ||
        obs?.tags?.includes?.('text') ||
        (!obs?.duration && !!obs?.text));

    const lessonNotes = filteredObservationsForPie.filter(isLessonNote);
    const voiceNotes = filteredObservationsForPie.filter(isVoiceNote);
    const textNotes = filteredObservationsForPie.filter(isTextNote);

    return [
      { name: 'Voice', value: voiceNotes.length, color: '#3b82f6' },
      { name: 'Text', value: textNotes.length, color: '#f59e0b' },
      { name: 'Lesson', value: lessonNotes.length, color: '#059669' }
    ];
  }, [filteredObservationsForPie]);

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

  const handleClassroomTimePeriodChange = (event, newPeriod) => {
    if (newPeriod !== null) {
      setClassroomTimePeriod(newPeriod);
    }
  };

  const handleTeacherTimePeriodChange = (event, newPeriod) => {
    if (newPeriod !== null) {
      setTeacherTimePeriod(newPeriod);
    }
  };

  const handleTeacherClassroomChange = (event) => {
    setSelectedTeacherClassroomId(event.target.value);
  };

  // Compute Activity Trend count based on selected timePeriod

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

  const getTeacherClassroomIds = useCallback(
    (teacherId) => Array.from(teacherToClassroomIds.get(teacherId) || new Set()),
    [teacherToClassroomIds]
  );

  const selectedTeacherClassroom = useMemo(
    () => (classrooms || []).find((classroom) => classroom.id === selectedTeacherClassroomId) || null,
    [classrooms, selectedTeacherClassroomId]
  );

  const teachersForSelectedClassroom = useMemo(() => {
    if (!selectedTeacherClassroomId) return [];
    const classroom = (classrooms || []).find((c) => c.id === selectedTeacherClassroomId);
    if (!classroom) return [];

    const teacherIds = Array.isArray(classroom.teacherIds) ? classroom.teacherIds : [];
    const uniqueTeacherIds = Array.from(new Set(teacherIds));
    const teacherBaseById = new Map();

    (teachers || []).forEach((teacher) => {
      if (!teacher?.id) return;
      teacherBaseById.set(teacher.id, {
        id: teacher.id,
        name: teacher.displayName || teacher.email || 'Unknown Teacher',
        email: teacher.email,
        status: teacher.status
      });
    });

    (stats?.teacherStats || []).forEach((teacher) => {
      if (!teacher?.id) return;
      const existing = teacherBaseById.get(teacher.id);
      teacherBaseById.set(teacher.id, {
        id: teacher.id,
        name: teacher.name || teacher.displayName || teacher.email || existing?.name || 'Unknown Teacher',
        email: teacher.email || existing?.email,
        status: teacher.status || existing?.status
      });
    });

    const days = teacherTimePeriod === '1M' ? 30 : 7;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const classroomByStudent = new Map();

    (students || []).forEach((student) => {
      if (student?.id && student?.classroomId) {
        classroomByStudent.set(student.id, student.classroomId);
      }
    });

    const countsByTeacher = new Map();
    const otherNotesByTeacher = new Map();
    const ensureCounts = (teacherId) => {
      if (!countsByTeacher.has(teacherId)) {
        countsByTeacher.set(teacherId, { observationNotes: 0, lessonNotes: 0, total: 0 });
      }
      return countsByTeacher.get(teacherId);
    };
    const ensureOtherNotes = (teacherId) => {
      if (!otherNotesByTeacher.has(teacherId)) {
        otherNotesByTeacher.set(teacherId, 0);
      }
      return otherNotesByTeacher.get(teacherId);
    };

    (stats?.allObservations || []).forEach((obs) => {
      const obsDate = getObservationDateFast(obs);
      if (obsDate < cutoff) return;
      const classroomId = obs?.classroomId || classroomByStudent.get(obs?.studentId);
      if (!classroomId) return;
      const teacherId = obs?.createdBy;
      if (!teacherId) return;
      if (classroomId === selectedTeacherClassroomId) {
        const counts = ensureCounts(teacherId);
        counts.total += 1;
        if (isLessonNoteFast(obs)) {
          counts.lessonNotes += 1;
        } else {
          counts.observationNotes += 1;
        }
      } else {
        otherNotesByTeacher.set(teacherId, ensureOtherNotes(teacherId) + 1);
      }
    });

    const list = uniqueTeacherIds.map((teacherId) => {
      const base = teacherBaseById.get(teacherId) || { id: teacherId, name: 'Unknown Teacher' };
      const counts = countsByTeacher.get(teacherId) || { observationNotes: 0, lessonNotes: 0, total: 0 };
      const otherClassroomCount = getTeacherClassroomIds(teacherId)
        .filter((classroomId) => classroomId && classroomId !== selectedTeacherClassroomId).length;
      const otherClassroomNotes = otherNotesByTeacher.get(teacherId) || 0;

      return {
        ...base,
        periodObservations: counts.total,
        periodObservationNotes: counts.observationNotes,
        periodLessonNotes: counts.lessonNotes,
        otherClassroomCount,
        otherClassroomNotes
      };
    });

    list.sort((a, b) => {
      if (b.periodObservations !== a.periodObservations) {
        return b.periodObservations - a.periodObservations;
      }
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    });

    return list;
  }, [
    selectedTeacherClassroomId,
    classrooms,
    teachers,
    stats?.teacherStats,
    stats?.allObservations,
    students,
    teacherTimePeriod,
    getObservationDateFast,
    isLessonNoteFast,
    getTeacherClassroomIds
  ]);

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

  // Removed TabNavigationGrid (replaced with compact Tabs header)



  const ClassroomComparisonChart = () => {
    const filteredClassroomStats = useMemo(() => {
      if (isAdmin && selectedBranchId) {
        const selectedBranch = branches.find(b => b.id === selectedBranchId);
        if (selectedBranch && Array.isArray(selectedBranch.classrooms) && selectedBranch.classrooms.length > 0) {
          const branchClassroomIds = selectedBranch.classrooms.map(cid => {
            const parts = String(cid).split('/');
            return parts[parts.length - 1];
          });
          return classroomStatsForPeriod.filter(classroom =>
            branchClassroomIds.includes(classroom.id)
          );
        }
        return classroomStatsForPeriod.filter(classroom => classroom.branchId === selectedBranchId);
      }
      return classroomStatsForPeriod;
    }, [classroomStatsForPeriod, selectedBranchId, isAdmin, branches]);

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
      Observations: classroom.thisWeekObservationNotes ?? classroom.thisWeekObservations ?? 0,
      'Lesson Notes': classroom.thisWeekLessonNotes ?? 0
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
      <Box sx={{ width: '100%', minWidth: 0 }}>
        <Box sx={{ height: 300, width: '100%', minWidth: 0, minHeight: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsBarChart data={data} margin={{ top: 16, right: 20, left: 0, bottom: 36 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="name" 
              tick={{ fontSize: 12, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              angle={-45}
              textAnchor="end"
              height={70}
              tickMargin={6}
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
                  const observationsValue = payload.find(item => item.dataKey === 'Observations')?.value ?? 0;
                  const lessonNotesValue = payload.find(item => item.dataKey === 'Lesson Notes')?.value ?? 0;
                  const notesCount = observationsValue + lessonNotesValue;
                  return (
                    <Box sx={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: 2,
                      p: 1.5,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                      <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                        {label}
                      </Typography>
                      <Typography sx={{ fontSize: '16px', fontWeight: 'bold', color: '#4f46e5', mt: 0.5 }}>
                        {notesCount} {notesCount === 1 ? 'note' : 'notes'}
                      </Typography>
                      <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                        <Typography sx={{ fontSize: '12px', color: '#4f46e5' }}>
                          Observations: {observationsValue}
                        </Typography>
                        <Typography sx={{ fontSize: '12px', color: '#059669' }}>
                          Lesson Notes: {lessonNotesValue}
                        </Typography>
                      </Box>
                    </Box>
                  );
                }
                return null;
              }}
            />
              <Bar dataKey="Observations" stackId="notes" fill="#4f46e5" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Lesson Notes" stackId="notes" fill="#059669" radius={[0, 0, 0, 0]} />
            </RechartsBarChart>
          </ResponsiveContainer>
        </Box>
        <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'center' }}>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              alignItems: 'center',
              px: 1.5,
              py: 0.5,
              borderRadius: 999,
              border: '1px solid #e2e8f0',
              backgroundColor: 'white'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#4f46e5' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Observations
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#059669' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                Lesson Notes
              </Typography>
            </Box>
          </Box>
        </Box>
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

  const classroomPeriodLabel = classroomTimePeriod === '1M' ? 'Notes This Month' : 'Notes This Week';
  const teacherPeriodLabel = teacherTimePeriod === '1M' ? 'Last 30 days' : 'Last 7 days';

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
      gap: 0,
      pb: 4,
      width: '100%',
      minWidth: 0
    }}>
      {/* Header removed (filters deprecated) */}

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
          <Box sx={{ width: '100%', minWidth: 0 }}>
            {/* Overview Tab */}
            {activeTab === 0 && (
            <Box sx={{ width: '100%', minWidth: 0 }}>
              {/* Time Period Picker */}
              <Box sx={{ mb: 3, width: '100%', minWidth: 0 }}>
                
                <ToggleButtonGroup
                  value={timePeriod}
                  exclusive
                  onChange={handleTimePeriodChange}
                  size="small"
                  fullWidth
                  sx={{
                    '& .MuiToggleButton-root': {
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 2,
                      py: 1,
                      borderColor: '#e2e8f0',
                      flex: 1,
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

              {/* Activity Trend Chart */}
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
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      Activity Trend
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main', mt: 0.5 }}>
                      {activityCount} notes created
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {timePeriod === '1D' ? 'Last 24 Hours' : 
                     timePeriod === '1W' ? 'Last 7 Days' :
                     timePeriod === '1M' ? 'Last 4 Weeks' :
                     timePeriod === '3M' ? 'Last 3 Months' :
                     timePeriod === '6M' ? 'Last 6 Months' :
                     timePeriod === '1Y' ? 'Last 12 Months' : 'Weekly'}
                  </Typography>
                </Box>
                
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
                      Note Distribution
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {timePeriod === '1D' ? 'Last 24 Hours' : 
                       timePeriod === '1W' ? 'Last 7 Days' :
                       timePeriod === '1M' ? 'Last 4 Weeks' :
                       timePeriod === '3M' ? 'Last 3 Months' :
                       timePeriod === '6M' ? 'Last 6 Months' :
                       timePeriod === '1Y' ? 'Last 12 Months' : 'All Time'}
                    </Typography>
                  </Box>
                  
                  {/* Donut Chart */}
                  {mounted ? (
                    <Box sx={{ height: 250, width: '100%', minWidth: 0, minHeight: 250, position: 'relative' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={90}
                            paddingAngle={3}
                            dataKey="value"
                            label={false}
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
                      {/* Center text overlay */}
                      <Box
                        sx={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          textAlign: 'center',
                          pointerEvents: 'none',
                          zIndex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            fontSize: '11px',
                            fontWeight: 400,
                            color: '#94a3b8',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            mb: 1
                          }}
                        >
                          Total notes
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '32px',
                            fontWeight: 400,
                            color: '#0f172a',
                            lineHeight: 1,
                            fontFamily: 'Inter, system-ui, sans-serif'
                          }}
                        >
                          {pieChartData.reduce((sum, x) => sum + (Number(x?.value) || 0), 0).toLocaleString()}
                        </Typography>
                      </Box>
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
                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
                          {(() => {
                            const total = pieChartData.reduce((sum, x) => sum + (Number(x?.value) || 0), 0);
                            if (!total) return '0%';
                            const pct = (Number(item?.value) || 0) / total;
                            return `${Math.round(pct * 100)}%`;
                          })()}
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
              <Box sx={{ mb: 2, maxWidth: 320, minWidth: 220 }}>
                <ToggleButtonGroup
                  value={classroomTimePeriod}
                  exclusive
                  onChange={handleClassroomTimePeriodChange}
                  size="small"
                  fullWidth
                  sx={{
                    '& .MuiToggleButton-root': {
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 2,
                      py: 0.75,
                      borderColor: '#e2e8f0',
                      flex: 1,
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
                  <ToggleButton value="1W">Last 7 days</ToggleButton>
                  <ToggleButton value="1M">Last 30 days</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              {isAdmin && !hideBranchSelector && (
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
              
              {classroomStatsForPeriod.length > 0 ? (
                <Box sx={{ width: '100%', minWidth: 0 }}>
                  {/* Classroom Comparison Chart */}
                  <Box sx={{ mb: 3, width: '100%', minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                      {role === 'teacher' ? `My Classrooms · ${classroomPeriodLabel}` : classroomPeriodLabel}
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
              <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
                <Box sx={{ maxWidth: 320, minWidth: 220, flex: '1 1 220px' }}>
                  <ToggleButtonGroup
                    value={teacherTimePeriod}
                    exclusive
                    onChange={handleTeacherTimePeriodChange}
                    size="small"
                    fullWidth
                    sx={{
                      '& .MuiToggleButton-root': {
                        textTransform: 'none',
                        fontWeight: 600,
                        px: 2,
                        py: 0.75,
                        borderColor: '#e2e8f0',
                        flex: 1,
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
                    <ToggleButton value="1W">Last 7 days</ToggleButton>
                    <ToggleButton value="1M">Last 30 days</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                <FormControl size="small" sx={{ minWidth: 240, flex: '1 1 240px' }}>
                  <InputLabel id="teacher-classroom-select-label">Select a classroom</InputLabel>
                  <Select
                    labelId="teacher-classroom-select-label"
                    value={selectedTeacherClassroomId}
                    label="Select a classroom"
                    onChange={handleTeacherClassroomChange}
                  >
                    <MenuItem value="" disabled>
                      Select a classroom
                    </MenuItem>
                    {(classrooms || []).map((classroom) => (
                      <MenuItem key={classroom.id} value={classroom.id}>
                        {classroom.name || classroom.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              {!selectedTeacherClassroomId ? (
                <Alert severity="info">Select a classroom to view teachers.</Alert>
              ) : (
                <Box>
                  {teachersForSelectedClassroom.length > 0 ? (
                    <Stack spacing={1.5}>
                      {teachersForSelectedClassroom.map((teacher) => (
                        <Box
                          key={teacher.id}
                          sx={{
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
                              label={`Total: ${teacher.periodObservations ?? 0}`}
                              color={(teacher.periodObservations ?? 0) === 0 ? 'error' : 'primary'}
                              variant={(teacher.periodObservations ?? 0) === 0 ? 'filled' : 'outlined'}
                            />
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Chip size="small" variant="outlined" color="success" label={`Observations: ${teacher.periodObservationNotes ?? 0}`} />
                            <Chip size="small" variant="outlined" color="info" label={`Lessons: ${teacher.periodLessonNotes ?? 0}`} />
                          </Box>

                          {teacher.otherClassroomCount > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              Also contributed <Box component="span" sx={{ fontWeight: 600 }}>{teacher.otherClassroomNotes ?? 0}</Box> {teacher.otherClassroomNotes === 1 ? 'note' : 'notes'} to <Box component="span" sx={{ fontWeight: 600 }}>{teacher.otherClassroomCount}</Box> other classroom{teacher.otherClassroomCount === 1 ? '' : 's'}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  ) : (
                    <Alert severity="info">No teachers assigned to this classroom.</Alert>
                  )}
                </Box>
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

              <PerformanceSummaryCard
                summary={performanceSummaryForCard}
                sx={{ mb: 3 }}
              />
              
              {stats.topStudents.length > 0 ? (
                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    Top Students This Week
                  </Typography>
                  <Stack spacing={1.5}>
                    {stats.topStudents.slice(0, 10).map((student) => (
                      <Box
                        key={student.id}
                        sx={{
                          p: 2,
                          backgroundColor: 'white',
                          borderRadius: 2,
                          border: '1px solid #e2e8f0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 2,
                          flexWrap: 'wrap'
                        }}
                      >
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {student.name}
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                            <Chip size="small" label={`This week: ${student.thisWeekCount || 0}`} />
                            <Chip size="small" label={`Total: ${student.count || 0}`} />
                          </Stack>
                        </Box>
                        {onNavigateToStudent && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => onNavigateToStudent(student)}
                            sx={{ textTransform: 'none', fontWeight: 600 }}
                          >
                            View Dashboard
                          </Button>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </Box>
                  ) : (
                    <Alert severity="info">
                      No student data available.
                    </Alert>
                  )}
                    </Box>
                  )
                )}
            </Box>
        </CardContent>
      </Card>


    </Box>
  );
};

export default StatsPage; 
