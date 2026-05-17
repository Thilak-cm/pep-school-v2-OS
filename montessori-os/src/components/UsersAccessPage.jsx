import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, TextField, Button, Grid, Alert, CircularProgress, Chip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, Card, CardContent, CardActionArea, Avatar,
  List, ListItemButton, ListItemAvatar, ListItemText, IconButton, Checkbox, ListItemIcon, ListItem,
  Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import { ArrowLeft as ArrowBack, UserPlus as PersonAdd, GraduationCap as School, UserCog as ManageAccounts, Users as Groups, Trash2 as Delete, Pencil as Edit, ChevronDown as ExpandMore } from '../icons';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import { formatDate } from '../utils/dateFormat';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  runTransaction,
  Timestamp,
  serverTimestamp,
  writeBatch,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  deleteField,
  documentId
} from 'firebase/firestore';
import { increment } from 'firebase/firestore';
import { reportCaughtError } from '../utils/reportCaughtError.js';
import { filterTeachersForAdmin, isUserInScope, extractTeacherIdsFromClassrooms, filterStudentsForAdmin, isStudentInScope } from '../utils/scopeUtils.js';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatDisplayName = (user) => {
  if (user.firstName || user.lastName) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
  }
  if (user.email) return user.email.split('@')[0];
  if (user.displayName) return user.displayName;
  if (user.studentID) return user.studentID;
  return user.id || 'User';
};

const getInitials = (name) => {
  return (name || 'U').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
};

const getFullName = (user) => {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || formatDisplayName(user);
};

// Mirror server-side email sanitization for pending doc IDs
const sanitizeEmailForDocId = (email) => String(email || '').toLowerCase().replace(/[^a-z0-9]/g, '_');

// ============================================================================
// CONSTANTS
// ============================================================================

const MOBILE_CONTAINER_SX = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const TAB_SX = {
  minHeight: 48,
  '& .MuiTab-root': { textTransform: 'none', minHeight: 48, fontWeight: 600 },
  '& .MuiTabs-indicator': { height: 3, borderRadius: 2, backgroundColor: 'var(--color-primary)' }
};

// ============================================================================
// COMPONENT
// ============================================================================

const UsersAccessPage = ({ onBack, currentUser, userRole, manageableClassrooms = [], view: externalView, onViewChange, onNavigateGraduate, initialStudentId, onInitialStudentHandled }) => {
  const notify = useNotify();

  // Page IA: cards home, add users, manage users
  const [view, setView] = useState(externalView || 'home');
  const [manageTab, setManageTab] = useState('teachers');

  // Role selection for Add tab
  const [role, setRole] = useState('teacher');
  const [selectedAdminClassrooms, setSelectedAdminClassrooms] = useState([]);

  // Admin/Teacher form (Add tab)
  const [userForm, setUserForm] = useState({ email: '', firstName: '', lastName: '' });
  const [selectedClassrooms, setSelectedClassrooms] = useState([]);

  // Student form
  const [studentForm, setStudentForm] = useState({
    firstName: '', lastName: '', classroomId: '', branchId: '', dob: '', guardianName: '', guardianRelationship: '', guardianPhone: ''
  });

  // Shared state
  const [classrooms, setClassrooms] = useState([]);
  const [branches, setBranches] = useState([]);
  const [_branchesLoading, setBranchesLoading] = useState(true);
  const [teachers, setTeachers] = useState([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [onlyNoClassrooms, setOnlyNoClassrooms] = useState(false);
  const [classroomFilterOpen, setClassroomFilterOpen] = useState(false);
  const [selectedClassroomFilterIds, setSelectedClassroomFilterIds] = useState([]);
  
  // Admins
  const [admins, setAdmins] = useState([]);
  const [superAdmins, setSuperAdmins] = useState([]);
  
  // Students
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState('all');
  const [studentClassroomFilterOpen, setStudentClassroomFilterOpen] = useState(false);
  const [selectedStudentClassroomFilterIds, setSelectedStudentClassroomFilterIds] = useState([]);

  // Display-level pagination limits per tab
  const [displayLimits, setDisplayLimits] = useState({ teachers: 10, classroomadmins: 10, superadmins: 10, students: 10 });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [_success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [userLoading, setUserLoading] = useState(true);
  const [classroomDialogOpen, setClassroomDialogOpen] = useState(false);
  const [classroomDialogTarget, setClassroomDialogTarget] = useState(null);
  const [classroomDialogSelection, setClassroomDialogSelection] = useState([]);
  const [classroomDialogSaving, setClassroomDialogSaving] = useState(false);
  const [classroomDialogError, setClassroomDialogError] = useState('');
  const [classroomDialogMode, setClassroomDialogMode] = useState('edit'); // 'edit' | 'promote'
  
  // Callables
  const createAuthUserAndProfile = httpsCallable(cloudFunctions, 'createAuthUserAndProfile');

  const isSuperAdminUser = userRole === 'superadmin';
  const isClassroomAdminUser = userRole === 'classroomadmin';
  const hasUserManagementAccess = isSuperAdminUser || isClassroomAdminUser;
  const canManageAdmins = isSuperAdminUser;
  const canViewAdmins = isSuperAdminUser || isClassroomAdminUser;

  // Sync external view prop with internal state
  useEffect(() => {
    if (externalView && externalView !== view) {
      setView(externalView);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalView]);

  // Admin gate + classrooms
  useEffect(() => {
    if (!hasUserManagementAccess) {
      setError('Access denied. Only admins can access this page.');
      setUserLoading(false);
      return;
    }
    if (isClassroomAdminUser && manageableClassrooms.length === 0) {
      setError('Classroom access is missing. Please ask a super admin to add manageable classrooms to your account.');
      setUserLoading(false);
      return;
    }
    setUserLoading(false);
    fetchClassrooms();
    fetchBranches();
  }, [hasUserManagementAccess, isClassroomAdminUser, manageableClassrooms]);

  useEffect(() => {
    if (!canViewAdmins && manageTab === 'classroomadmins') {
      setManageTab('teachers');
    }
    if (!canManageAdmins && manageTab === 'superadmins') {
      setManageTab('teachers');
    }
  }, [canViewAdmins, canManageAdmins, manageTab]);

  useEffect(() => {
    if (!canManageAdmins && role === 'classroomadmin') {
      setRole('teacher');
    }
  }, [canManageAdmins, role]);

  useEffect(() => {
    if (role !== 'classroomadmin' && selectedAdminClassrooms.length > 0) {
      setSelectedAdminClassrooms([]);
    }
  }, [role, selectedAdminClassrooms.length]);

  // Lazily fetch data when entering Manage view
  // classrooms.length is a dep so scoped teacher fetch re-triggers when classrooms load
  useEffect(() => {
    if (!hasUserManagementAccess) return;
    if (view === 'manage') {
      if (manageTab === 'teachers' && teachers.length === 0) fetchTeachers();
      if (manageTab === 'classroomadmins' && canViewAdmins && admins.length === 0) fetchAdmins();
      if (manageTab === 'superadmins' && canManageAdmins && superAdmins.length === 0) fetchSuperAdmins();
      if (manageTab === 'students' && students.length === 0) fetchStudents();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, manageTab, hasUserManagementAccess, canManageAdmins, canViewAdmins, teachers.length, admins.length, superAdmins.length, students.length, classrooms.length]);

  // When initialStudentId is set, jump straight to manage/students view
  useEffect(() => {
    if (!initialStudentId) return;
    setView('manage');
    setManageTab('students');
  }, [initialStudentId]);

  // Reset display limits when teacher filters change
  useEffect(() => {
    setDisplayLimits(prev => ({ ...prev, teachers: 10 }));
  }, [teacherSearch, statusFilter, onlyNoClassrooms, selectedClassroomFilterIds]);

  // Reset display limits when student filters change
  useEffect(() => {
    setDisplayLimits(prev => ({ ...prev, students: 10 }));
  }, [studentSearch, studentStatusFilter, selectedStudentClassroomFilterIds]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      let list = [];
      if (isClassroomAdminUser) {
        const ids = manageableClassrooms.filter(Boolean);
        const batchSize = 10;
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          const snap = await getDocs(query(
            collection(db, 'classrooms'),
            where(documentId(), 'in', batch),
            where('status', '==', 'active')
          ));
          list.push(...snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })));
        }
      } else {
        const snap = await getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active')));
        list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      }
      list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      setClassrooms(list.map(c => ({ 
        id: c.id, 
        name: c.name || c.id, 
        studentCount: c.studentCount || 0, 
        teacherIds: c.teacherIds || [],
        branchId: c.branchId || null
      })));
    } catch (_e) {
      setError('Failed to fetch classrooms');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      setBranchesLoading(true);
      const branchesQuery = query(collection(db, 'branches'));
      const branchesSnap = await getDocs(branchesQuery);
      const branchesList = branchesSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id, // Use doc ID as the value
          name: data.name || doc.id.charAt(0).toUpperCase() + doc.id.slice(1),
          ...data
        };
      });
      // Sort branches by order if available, otherwise by name
      branchesList.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        return (a.name || a.id).localeCompare(b.name || b.id);
      });
      setBranches(branchesList);
    } catch (_e) {
      setError('Failed to fetch branches');
    } finally {
      setBranchesLoading(false);
    }
  };

  const fetchUsersByRole = async (roleName) => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', roleName));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => (a.firstName || a.email || a.id).localeCompare(b.firstName || b.email || b.id));
      return list;
    } catch (_e) {
      setError(`Failed to fetch ${roleName}s`);
      return [];
    }
  };

  const fetchTeachers = async () => {
    if (isClassroomAdminUser) {
      // Scope query: only fetch teachers assigned to managed classrooms
      const teacherIds = extractTeacherIdsFromClassrooms(classrooms);
      if (teacherIds.length === 0) {
        setTeachers([]);
        return;
      }
      try {
        const batchSize = 10;
        const list = [];
        for (let i = 0; i < teacherIds.length; i += batchSize) {
          const batch = teacherIds.slice(i, i + batchSize);
          const snap = await getDocs(query(
            collection(db, 'users'),
            where(documentId(), 'in', batch),
            where('role', '==', 'teacher')
          ));
          list.push(...snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })));
        }
        list.sort((a, b) => (a.firstName || a.email || a.id).localeCompare(b.firstName || b.email || b.id));
        setTeachers(list);
      } catch (_e) {
        setError('Failed to fetch teachers');
      }
    } else {
      const list = await fetchUsersByRole('teacher');
      setTeachers(list);
    }
  };

  const fetchAdmins = async () => {
    if (isClassroomAdminUser) {
      // Scope query: only fetch classroom admins whose manageableClassrooms
      // overlap with the current admin's manageableClassrooms
      const programIds = manageableClassrooms.filter(Boolean);
      if (programIds.length === 0) {
        setAdmins([]);
        return;
      }
      try {
        const batchSize = 10; // Firestore array-contains-any limit
        const seen = new Set();
        const list = [];
        for (let i = 0; i < programIds.length; i += batchSize) {
          const batch = programIds.slice(i, i + batchSize);
          const snap = await getDocs(query(
            collection(db, 'users'),
            where('role', '==', 'classroomadmin'),
            where('manageableClassrooms', 'array-contains-any', batch)
          ));
          snap.docs.forEach(d => {
            if (!seen.has(d.id)) {
              seen.add(d.id);
              list.push({ id: d.id, ...(d.data() || {}) });
            }
          });
        }
        list.sort((a, b) => (a.firstName || a.email || a.id).localeCompare(b.firstName || b.email || b.id));
        setAdmins(list);
      } catch (_e) {
        setError('Failed to fetch classroom admins');
      }
    } else {
      const list = await fetchUsersByRole('classroomadmin');
      setAdmins(list);
    }
  };

  const fetchSuperAdmins = async () => {
    const list = await fetchUsersByRole('superadmin');
    setSuperAdmins(list);
  };

  const fetchStudents = async () => {
    try {
      let list;
      if (isClassroomAdminUser && manageableClassrooms.length > 0) {
        // Scope to manageable classrooms (batch in groups of 10 for Firestore 'in' limit)
        const batches = [];
        for (let i = 0; i < manageableClassrooms.length; i += 10) {
          batches.push(manageableClassrooms.slice(i, i + 10));
        }
        const results = await Promise.all(
          batches.map(batch =>
            getDocs(query(collection(db, 'students'), where('classroomId', 'in', batch)))
          )
        );
        list = results.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })));
      } else {
        const snap = await getDocs(collection(db, 'students'));
        list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      }
      list.sort((a, b) => {
        const an = (a.firstName || a.displayName || a.studentID || a.id);
        const bn = (b.firstName || b.displayName || b.studentID || b.id);
        return String(an).localeCompare(String(bn));
      });
      setStudents(list);
    } catch (_e) {
      setError('Failed to fetch students');
    }
  };

  // ============================================================================
  // DERIVED DATA
  // ============================================================================

  const teacherToClassroomIds = useMemo(() => {
    const mapping = new Map();
    classrooms.forEach(c => {
      (c.teacherIds || []).forEach(tid => {
        if (!mapping.has(tid)) mapping.set(tid, new Set());
        mapping.get(tid).add(c.id);
      });
    });
    return mapping;
  }, [classrooms]);

  const getTeacherClassroomIds = useCallback((teacherId) => Array.from(teacherToClassroomIds.get(teacherId) || new Set()), [teacherToClassroomIds]);

  // Group classrooms by branch for easier visual digestion
  const classroomsByBranch = useMemo(() => {
    const grouped = new Map();
    
    // Add classrooms with branches
    classrooms.forEach(cls => {
      const branchId = cls.branchId || 'no-branch';
      if (!grouped.has(branchId)) {
        grouped.set(branchId, []);
      }
      grouped.get(branchId).push(cls);
    });
    
    // Sort classrooms within each branch
    grouped.forEach((classrooms, _branchId) => {
      classrooms.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    });
    
    // Convert to array with branch info
    return Array.from(grouped.entries()).map(([branchId, classrooms]) => {
      const branch = branches.find(b => b.id === branchId);
      return {
        branchId,
        branchName: branch ? branch.name : (branchId === 'no-branch' ? 'Unassigned' : branchId),
        classrooms
      };
    }).sort((a, b) => {
      // Sort branches: "Unassigned" last, others by name
      if (a.branchId === 'no-branch') return 1;
      if (b.branchId === 'no-branch') return -1;
      return a.branchName.localeCompare(b.branchName);
    });
  }, [classrooms, branches]);

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validate = () => {
    const errors = {};
    if (role === 'classroomadmin' || role === 'teacher') {
      if (!userForm.email) errors.email = 'Email is required';
      else {
        const emailLower = userForm.email.toLowerCase();
        const allowedDomains = ['@pepschoolv2.com', '@ribbons.education', '@accelschool.in'];
        if (!allowedDomains.some(domain => emailLower.endsWith(domain))) {
          errors.email = 'Email must be from @pepschoolv2.com, @ribbons.education, or @accelschool.in';
        }
      }
      if (!userForm.firstName) errors.firstName = 'First name is required';
      if (role === 'teacher' && selectedClassrooms.length === 0) errors.classrooms = 'Select at least one classroom';
      if (role === 'classroomadmin' && selectedAdminClassrooms.length === 0) errors.classrooms = 'Select at least one classroom';
    } else {
      if (!studentForm.firstName) errors.stuFirstName = 'First name is required';
      if (!studentForm.classroomId) errors.classroomId = 'Select a classroom';
      if (!studentForm.dob) {
        errors.stuDob = 'Date of Birth is required';
      } else {
        const dobDate = new Date(studentForm.dob);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const minDate = new Date(today);
        minDate.setFullYear(today.getFullYear() - 120);
        
        if (dobDate > today) {
          errors.stuDob = 'Date of Birth cannot be in the future';
        } else if (dobDate < minDate) {
          errors.stuDob = 'Date of Birth is too far in the past';
        }
      }
      const guardianFields = [studentForm.guardianName, studentForm.guardianRelationship, studentForm.guardianPhone];
      const hasAny = guardianFields.some(Boolean);
      const all = guardianFields.every(v => (v || '').trim() !== '');
      if (hasAny && !all) errors.guardian = 'Provide all guardian fields or clear all';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ============================================================================
  // DIALOG STATE
  // ============================================================================

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmContent, setConfirmContent] = useState({ title: '', body: '', onConfirm: null });
  const openConfirm = (title, body, onConfirm) => {
    setConfirmContent({ title, body, onConfirm });
    setConfirmOpen(true);
  };

  const [manageOpen, setManageOpen] = useState(false);
  const [manageTeacher, setManageTeacher] = useState(null);
  const [manageSelectedIds, setManageSelectedIds] = useState([]);
  const [manageSaving, setManageSaving] = useState(false);

  const [demoteOpen, setDemoteOpen] = useState(false);
  const [demoteTarget, setDemoteTarget] = useState(null);
  const [demoteSelectedIds, setDemoteSelectedIds] = useState([]);
  const [demoteSaving, setDemoteSaving] = useState(false);
  const [demoteError, setDemoteError] = useState('');

  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const _openInfo = (title, message = 'Property edit functionality coming soon!') => {
    setInfoTitle(title);
    setInfoMessage(message);
    setInfoOpen(true);
  };

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionUser, setActionUser] = useState(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteDeleting, setDeleteDeleting] = useState(false);

  // Student metadata dialog state
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentEditMode, setStudentEditMode] = useState(false);
  const [editedStudentData, setEditedStudentData] = useState({ firstName: '', lastName: '', status: 'active', dob: '' });
  const [studentSaving, setStudentSaving] = useState(false);

  // ============================================================================
  // DIALOG HANDLERS
  // ============================================================================

  const openActionDialog = (type, user) => {
    setActionUser({ type, user });
    setActionDialogOpen(true);
  };

  const closeActionDialog = () => {
    setActionDialogOpen(false);
    setActionUser(null);
  };

  const openClassroomDialog = (adminUser, mode = 'edit') => {
    setClassroomDialogTarget(adminUser);
    setClassroomDialogSelection(Array.isArray(adminUser?.manageableClassrooms) ? adminUser.manageableClassrooms : []);
    setClassroomDialogMode(mode);
    setClassroomDialogError('');
    setClassroomDialogOpen(true);
  };

  const closeClassroomDialog = () => {
    if (classroomDialogSaving) return;
    setClassroomDialogOpen(false);
    setClassroomDialogTarget(null);
    setClassroomDialogSelection([]);
    setClassroomDialogError('');
    setClassroomDialogMode('edit');
  };

  const openDeleteConfirm = (type, user) => {
    setDeleteTarget({ type, user });
    setDeleteConfirmOpen(true);
    closeActionDialog();
  };

  const openManage = (teacher) => {
    setManageTeacher(teacher);
    setManageSelectedIds(getTeacherClassroomIds(teacher.id));
    setManageOpen(true);
  };

  const openDemoteDialog = (adminUser) => {
    setDemoteTarget(adminUser);
    setDemoteSelectedIds(getTeacherClassroomIds(adminUser.id));
    setDemoteError('');
    setDemoteOpen(true);
  };

  const closeDemoteDialog = () => {
    if (demoteSaving) return;
    setDemoteOpen(false);
    setDemoteTarget(null);
    setDemoteSelectedIds([]);
    setDemoteError('');
  };

  // ============================================================================
  // STUDENT DIALOG HANDLERS
  // ============================================================================

  const openStudentDialog = (student) => {
    setSelectedStudent(student);
    // Convert dateOfBirth Timestamp to date string format for editing
    let dobString = '';
    if (student.dateOfBirth && student.dateOfBirth.toDate) {
      const dobDate = student.dateOfBirth.toDate();
      dobString = dobDate.toISOString().split('T')[0];
    }
    setEditedStudentData({
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      status: student.status || 'active',
      dob: dobString
    });
    setStudentEditMode(false);
    setValidationErrors({});
    setStudentDialogOpen(true);
  };

  // Auto-open a student dialog when initialStudentId is provided
  useEffect(() => {
    if (!initialStudentId || students.length === 0) return;
    const target = students.find(s => s.id === initialStudentId);
    if (target) {
      // Inline dialog-open logic to avoid stale closure from openStudentDialog
      setSelectedStudent(target);
      let dobString = '';
      if (target.dateOfBirth && target.dateOfBirth.toDate) {
        const dobDate = target.dateOfBirth.toDate();
        dobString = dobDate.toISOString().split('T')[0];
      }
      setEditedStudentData({
        firstName: target.firstName || '',
        lastName: target.lastName || '',
        status: target.status || 'active',
        dob: dobString
      });
      setStudentEditMode(true);
      setValidationErrors({});
      setStudentDialogOpen(true);
      onInitialStudentHandled?.();
    } else {
      notify('Student not found — try searching manually', { variant: 'warning' });
      onInitialStudentHandled?.();
    }
  // students.length is an intentional proxy for the students array
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStudentId, students.length, notify, onInitialStudentHandled]);

  const closeStudentDialog = () => {
    if (studentSaving) return;
    setStudentDialogOpen(false);
    setSelectedStudent(null);
    setStudentEditMode(false);
    setEditedStudentData({ firstName: '', lastName: '', status: 'active', dob: '' });
  };

  const handleStudentEditCancel = () => {
    // Reset edited data to original student values
    if (selectedStudent) {
      let dobString = '';
      if (selectedStudent.dateOfBirth && selectedStudent.dateOfBirth.toDate) {
        const dobDate = selectedStudent.dateOfBirth.toDate();
        dobString = dobDate.toISOString().split('T')[0];
      }
      setEditedStudentData({
        firstName: selectedStudent.firstName || '',
        lastName: selectedStudent.lastName || '',
        status: selectedStudent.status || 'active',
        dob: dobString
      });
    }
    setStudentEditMode(false);
    // Clear validation errors
    setValidationErrors({});
  };

  const handleStudentEditSave = async () => {
    if (!selectedStudent) return;

    // Scope guard: classroom admins can only edit students in their classrooms
    if (isClassroomAdminUser && !isStudentInScope(selectedStudent, manageableClassrooms)) {
      notify.error('You can only edit students in your assigned classrooms');
      return;
    }

    // Validate edited data
    const errors = {};
    if (!editedStudentData.firstName?.trim()) {
      errors.firstName = 'First name is required';
    }
    if (editedStudentData.dob) {
      const dobDate = new Date(editedStudentData.dob);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const minDate = new Date(today);
      minDate.setFullYear(today.getFullYear() - 120);
      
      if (dobDate > today) {
        errors.dob = 'Date of Birth cannot be in the future';
      } else if (dobDate < minDate) {
        errors.dob = 'Date of Birth is too far in the past';
      }
    }
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    try {
      setStudentSaving(true);
      const studentRef = doc(db, 'students', selectedStudent.id);
      const updatePayload = {
        firstName: editedStudentData.firstName.trim(),
        lastName: (editedStudentData.lastName || '').trim(),
        displayName: `${editedStudentData.firstName.trim()} ${(editedStudentData.lastName || '').trim()}`.trim(),
        status: editedStudentData.status,
        isActive: editedStudentData.status === 'active',
        updatedAt: serverTimestamp(),
      };

      // Handle DOB - convert string to Timestamp if provided
      if (editedStudentData.dob) {
        updatePayload.dateOfBirth = Timestamp.fromDate(new Date(editedStudentData.dob));
      } else {
        // If DOB is cleared, we'll keep the existing one (don't update it)
        // But if we want to allow clearing, we could use deleteField() here
      }

      await updateDoc(studentRef, updatePayload);
      
      // Refresh students list
      await fetchStudents();
      
      // Update selectedStudent with new data
      setSelectedStudent({
        ...selectedStudent,
        ...updatePayload,
        dateOfBirth: editedStudentData.dob ? Timestamp.fromDate(new Date(editedStudentData.dob)) : selectedStudent.dateOfBirth
      });
      
      setStudentEditMode(false);
      notify.success('Student updated successfully');
    } catch (error) {
      notify.error('Failed to update student: ' + (error.message || 'Unknown error'));
    } finally {
      setStudentSaving(false);
    }
  };

  // ============================================================================
  // DELETE HANDLER
  // ============================================================================

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { type, user } = deleteTarget;

    if (user.id === currentUser?.uid) {
      notify.error('You cannot delete your own account');
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      return;
    }

    // AC3: Classroom admins can only delete teachers in their scope
    if (isClassroomAdminUser && type === 'teacher' && !isUserInScope(user.id, classrooms, manageableClassrooms)) {
      notify.error('You can only manage teachers in your assigned classrooms');
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      return;
    }

    // Classroom admins can only delete students in their classrooms
    if (isClassroomAdminUser && type === 'student' && !isStudentInScope(user, manageableClassrooms)) {
      notify.error('You can only delete students in your assigned classrooms');
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      return;
    }

    // Only superadmins can delete admin users
    if ((type === 'classroomadmin' || type === 'superadmin') && !canManageAdmins) {
      notify.error('Only super admins can delete admin users');
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      return;
    }

    try {
      setDeleteDeleting(true);
      const batch = writeBatch(db);

      if (type === 'teacher') {
        const assignedClassrooms = getTeacherClassroomIds(user.id);
        assignedClassrooms.forEach(cid => {
          batch.update(doc(db, 'classrooms', cid), { 
            teacherIds: arrayRemove(user.id),
            updatedAt: serverTimestamp()
          });
        });
        batch.delete(doc(db, 'users', user.id));
        await batch.commit();
        
        setClassrooms(prev => prev.map(c => ({
          ...c,
          teacherIds: (c.teacherIds || []).filter(tid => tid !== user.id)
        })));
        setTeachers(prev => prev.filter(t => t.id !== user.id));
        notify.success('Teacher deleted successfully');
      } else if (type === 'classroomadmin') {
        await deleteDoc(doc(db, 'users', user.id));
        setAdmins(prev => prev.filter(a => a.id !== user.id));
        notify.success('Classroom Admin deleted successfully');
      } else if (type === 'superadmin') {
        await deleteDoc(doc(db, 'users', user.id));
        setSuperAdmins(prev => prev.filter(a => a.id !== user.id));
        notify.success('Super Admin deleted successfully');
      } else if (type === 'student') {
        if (user.classroomId) {
          batch.update(doc(db, 'classrooms', user.classroomId), {
            studentCount: increment(-1),
            updatedAt: serverTimestamp()
          });
        }
        batch.delete(doc(db, 'students', user.id));
        await batch.commit();
        
        if (user.classroomId) {
          setClassrooms(prev => prev.map(c => 
            c.id === user.classroomId 
              ? { ...c, studentCount: Math.max(0, (c.studentCount || 0) - 1) }
              : c
          ));
        }
        setStudents(prev => prev.filter(s => s.id !== user.id));
        notify.success('Student deleted successfully');
      }

      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      notify.error('Failed to delete user: ' + (error.message || 'Unknown error'));
    } finally {
      setDeleteDeleting(false);
    }
  };

  // ============================================================================
  // MANAGE ACCESS HANDLERS
  // ============================================================================

  const toggleManageClassroom = (id) => {
    setManageSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleDemoteClassroom = (id) => {
    setDemoteSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setDemoteError('');
  };

  const updateClassroomsState = (toAdd, toRemove, teacherId) => {
    return (prev) => prev.map(c => {
      if (toAdd.includes(c.id)) {
        return { ...c, teacherIds: Array.from(new Set([...(c.teacherIds || []), teacherId])) };
      }
      if (toRemove.includes(c.id)) {
        return { ...c, teacherIds: (c.teacherIds || []).filter(tid => tid !== teacherId) };
      }
      return c;
    });
  };

  const saveManage = async () => {
    if (!manageTeacher || (manageTeacher.status || 'active') !== 'active') return;

    // AC3: Classroom admins can only manage teachers in their scope
    if (isClassroomAdminUser && !isUserInScope(manageTeacher.id, classrooms, manageableClassrooms)) {
      notify.error('You can only manage teachers in your assigned classrooms');
      setManageOpen(false);
      return;
    }

    const currentIds = new Set(getTeacherClassroomIds(manageTeacher.id));
    const nextIds = new Set(manageSelectedIds);
    const toAdd = [...nextIds].filter(x => !currentIds.has(x));
    const toRemove = [...currentIds].filter(x => !nextIds.has(x));

    if (toAdd.length === 0 && toRemove.length === 0) {
      setManageOpen(false);
      return;
    }

    try {
      setManageSaving(true);
      const batch = writeBatch(db);
      toAdd.forEach(cid => {
        batch.update(doc(db, 'classrooms', cid), { teacherIds: arrayUnion(manageTeacher.id) });
      });
      toRemove.forEach(cid => {
        batch.update(doc(db, 'classrooms', cid), { teacherIds: arrayRemove(manageTeacher.id) });
      });
      await batch.commit();
      
      setClassrooms(updateClassroomsState(toAdd, toRemove, manageTeacher.id));
      
      const teacherId = manageTeacher.id;
      const added = [...toAdd];
      const removed = [...toRemove];
      
      notify.success('Access updated', {
        id: `manage-access-${teacherId}`,
        onUndo: async () => {
          try {
            const reverse = writeBatch(db);
            added.forEach(cid => reverse.update(doc(db, 'classrooms', cid), { teacherIds: arrayRemove(teacherId) }));
            removed.forEach(cid => reverse.update(doc(db, 'classrooms', cid), { teacherIds: arrayUnion(teacherId) }));
            await reverse.commit();
            setClassrooms(updateClassroomsState(removed, added, teacherId));
          } catch (_err) {
            notify.error('Failed to undo access changes');
          }
        }
      });
      setManageOpen(false);
    } catch (_e) {
      notify.error('Failed to update access');
    } finally {
      setManageSaving(false);
    }
  };

  const handleDemoteSave = async () => {
    if (!demoteTarget) return;
    if (demoteSelectedIds.length === 0) {
      setDemoteError('Select at least one classroom');
      return;
    }

    const currentIds = new Set(getTeacherClassroomIds(demoteTarget.id));
    const nextIds = new Set(demoteSelectedIds);
    const toAdd = [...nextIds].filter(x => !currentIds.has(x));
    const toRemove = [...currentIds].filter(x => !nextIds.has(x));

    try {
      setDemoteSaving(true);
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', demoteTarget.id);
      batch.set(userRef, {
        role: 'teacher',
        manageableClassrooms: deleteField(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      toAdd.forEach(cid => {
        batch.update(doc(db, 'classrooms', cid), { teacherIds: arrayUnion(demoteTarget.id) });
      });
      toRemove.forEach(cid => {
        batch.update(doc(db, 'classrooms', cid), { teacherIds: arrayRemove(demoteTarget.id) });
      });

      await batch.commit();
      setClassrooms(updateClassroomsState(toAdd, toRemove, demoteTarget.id));
      notify.success('Classroom admin demoted to teacher access');
      setDemoteOpen(false);
      setDemoteTarget(null);
      setDemoteSelectedIds([]);
      setDemoteError('');
      await Promise.all([fetchTeachers(), fetchAdmins()]);
    } catch (error) {
      notify.error(error?.message || 'Failed to demote classroom admin');
    } finally {
      setDemoteSaving(false);
    }
  };

  // ============================================================================
  // STUDENT ID HELPERS
  // ============================================================================

  const classroomCodeFromId = (id) => {
    const letters = (id || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
    return (letters.slice(0, 3) || 'STD').padEnd(3, 'X').slice(0, 3);
  };

  const extractIndexFromStudentId = (studentId, classroomCode, year) => {
    const re = new RegExp(`^${year}-${classroomCode}-([0-9]{3})$`);
    const m = String(studentId || '').match(re);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  };

  const computeNextIndexForClassroomYear = async (_classroomId, classroomCode, year) => {
    // Query by document ID prefix so we also see graduated/moved students
    // whose doc IDs still carry the old classroom code (e.g. 2026-PER-031).
    const prefix = `${year}-${classroomCode}-`;
    const q = query(
      collection(db, 'students'),
      where(documentId(), '>=', prefix),
      where(documentId(), '<', prefix + '\uf8ff')
    );
    const snap = await getDocs(q);
    let maxIndex = 0;
    snap.forEach(d => {
      const data = d.data() || {};
      const candidate = data.studentID || d.id;
      const idx = extractIndexFromStudentId(candidate, classroomCode, year);
      if (idx && idx > maxIndex) maxIndex = idx;
    });
    return maxIndex + 1;
  };

  const formatStudentId = (year, code, idx) => `${year}-${code}-${String(idx).padStart(3, '0')}`;

  // ============================================================================
  // FORM HANDLERS
  // ============================================================================

  const handleClassroomToggle = (id) => {
    setSelectedClassrooms(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    if (validationErrors.classrooms) {
      setValidationErrors(prev => ({ ...prev, classrooms: '' }));
    }
  };

  const handleAdminClassroomToggle = (id) => {
    setSelectedAdminClassrooms(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    if (validationErrors.classrooms) {
      setValidationErrors(prev => ({ ...prev, classrooms: '' }));
    }
  };

  const handleClassroomDialogToggle = (id) => {
    setClassroomDialogSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    if (classroomDialogError) {
      setClassroomDialogError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    
    try {
      setSubmitting(true);
      setError('');
      
      if (role === 'classroomadmin' || role === 'teacher') {
        await handleUserSubmit();
      } else {
        await handleStudentSubmit();
      }
    } catch (err) {
      setError(err?.message || 'Operation failed');
      notify.error(err?.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUserSubmit = async () => {
    if (role === 'classroomadmin' && !canManageAdmins) {
      notify.error('Only super admins can create classroom admins');
      return;
    }
    const res = await createAuthUserAndProfile({
      email: userForm.email.trim(),
      firstName: userForm.firstName.trim(),
      lastName: (userForm.lastName || '').trim(),
      role,
      selectedClassrooms: role === 'teacher' ? selectedClassrooms : [],
      updateIfExists: false,
      manageableClassrooms: role === 'classroomadmin' ? selectedAdminClassrooms : undefined,
    });
    
    const data = res.data || {};
    if (data.exists) {
      openConfirm(
        'Email already exists',
        `A user with ${userForm.email} already exists${data.existingRole ? ` (role: ${data.existingRole})` : ''}. Update their profile and assignments?`,
        async () => {
          await createAuthUserAndProfile({
            email: userForm.email.trim(),
            firstName: userForm.firstName.trim(),
            lastName: (userForm.lastName || '').trim(),
            role,
            selectedClassrooms: role === 'teacher' ? selectedClassrooms : [],
            updateIfExists: true,
            manageableClassrooms: role === 'classroomadmin' ? selectedAdminClassrooms : undefined,
          });
          notify.success('User updated');
          resetUserForm();
          setConfirmOpen(false);
          setSuccess(true);
          try {
            if (role === 'teacher') await fetchTeachers();
            if (role === 'teacher') await fetchClassrooms();
            if (role === 'classroomadmin') await fetchAdmins();
          } catch { /* ignored */ }
        }
      );
    } else if (data.ok) {
      notify.success('User created');
      if (role === 'teacher' && selectedClassrooms.length > 0) {
        const pendingId = data.pendingId || `pending_${sanitizeEmailForDocId(userForm.email)}`;
        setClassrooms(updateClassroomsState(selectedClassrooms, [], pendingId));
      }
      resetUserForm();
      setSuccess(true);
      try {
        if (role === 'teacher') await fetchTeachers();
        if (role === 'teacher') await fetchClassrooms();
        if (role === 'classroomadmin') await fetchAdmins();
      } catch { /* ignored */ }
    } else {
      throw new Error('Failed to create user');
    }
  };

  const handleStudentSubmit = async () => {
    const normalized = `${studentForm.firstName}`.trim().toLowerCase() + ' ' + `${studentForm.lastName || ''}`.trim().toLowerCase();
    const q = query(collection(db, 'students'), where('classroomId', '==', studentForm.classroomId));
    const snap = await getDocs(q);
    const matches = [];
    snap.forEach(d => {
      const data = d.data() || {};
      const comp = `${(data.firstName||'').trim().toLowerCase()} ${(data.lastName||'').trim().toLowerCase()}`.trim();
      if (comp === normalized.trim()) matches.push(d.id);
    });

    const proceed = async () => {
      const code = classroomCodeFromId(studentForm.classroomId);
      const year = String(new Date().getFullYear());
      const MAX_RETRIES = 5;
      let startIdx = await computeNextIndexForClassroomYear(studentForm.classroomId, code, year);

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const idx = startIdx + attempt;
        const sid = formatStudentId(year, code, idx);
        const ref = doc(db, 'students', sid);
        try {
          await runTransaction(db, async (tx) => {
            const s = await tx.get(ref);
            if (s.exists()) throw new Error('exists');
            const payload = {
              studentID: sid,
              firstName: studentForm.firstName.trim(),
              lastName: (studentForm.lastName || '').trim(),
              displayName: `${studentForm.firstName} ${studentForm.lastName || ''}`.trim(),
              classroomId: studentForm.classroomId,
              branchId: studentForm.branchId,
              status: 'active',
              isActive: true,
              dateOfBirth: Timestamp.fromDate(new Date(studentForm.dob)),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              createdBy: currentUser?.email || 'ui',
            };
            const hasGuardian = [studentForm.guardianName, studentForm.guardianRelationship, studentForm.guardianPhone]
              .every(v => (v||'').trim() !== '');
            if (hasGuardian) {
              payload.guardianName = studentForm.guardianName.trim();
              payload.guardianRelationship = studentForm.guardianRelationship.trim();
              payload.guardianPhone = studentForm.guardianPhone.trim();
            }
            tx.set(ref, payload);
            // Create initial placement doc so graduation and timeline work from day one
            const today = new Date();
            const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const placementRef = doc(db, 'students', sid, 'placements', `${startDate}__${studentForm.classroomId}`);
            tx.set(placementRef, {
              classroomId: studentForm.classroomId,
              startDate,
              endDate: null,
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            const classroomRef = doc(db, 'classrooms', studentForm.classroomId);
            tx.set(classroomRef, { studentCount: increment(1), updatedAt: serverTimestamp() }, { merge: true });
          });
          // Transaction succeeded — break out of the retry loop
          break;
        } catch (err) {
          if (err?.message === 'exists' && attempt < MAX_RETRIES - 1) continue;
          throw err;
        }
      }
      
      notify.success(`Student ${studentForm.firstName} ${studentForm.lastName || ''} has been added to the roster!`);
      const addedClassroomId = studentForm.classroomId;
      setClassrooms(prev => prev.map(c => 
        c.id === addedClassroomId ? { ...c, studentCount: (c.studentCount || 0) + 1 } : c
      ));
      resetStudentForm();
      setSuccess(true);
    };

    if (matches.length > 0) {
      openConfirm(
        'Possible duplicate',
        `Found ${matches.length} student(s) with the same name in this classroom. Proceed?`,
        async () => { await proceed(); setConfirmOpen(false); }
      );
    } else {
      await proceed();
    }
  };

  const handleClassroomDialogSave = async () => {
    if (!classroomDialogTarget) return;
    if (classroomDialogSelection.length === 0) {
      setClassroomDialogError('Select at least one classroom');
      return;
    }
    try {
      setClassroomDialogSaving(true);
      if (classroomDialogMode === 'promote') {
        // AC4: Route promote through server-side validation
        // Fall back to displayName parts when firstName is missing (migrated users)
        const nameParts = (classroomDialogTarget.displayName || '').split(' ');
        const firstName = classroomDialogTarget.firstName || nameParts[0] || classroomDialogTarget.email?.split('@')[0] || '';
        const lastName = classroomDialogTarget.lastName || nameParts.slice(1).join(' ') || '';
        await createAuthUserAndProfile({
          email: classroomDialogTarget.email,
          firstName,
          lastName,
          role: 'classroomadmin',
          manageableClassrooms: classroomDialogSelection,
          updateIfExists: true,
        });
        notify.success('Teacher promoted to classroom admin');
        setClassroomDialogOpen(false);
        setClassroomDialogTarget(null);
        setClassroomDialogSelection([]);
        try {
          await fetchTeachers();
        } catch (_) {
          reportCaughtError(_, 'UsersAccessPage', 'swallow-only try/catch at promote-refresh-teachers');
        }
        try {
          await fetchAdmins();
        } catch (_) {
          reportCaughtError(_, 'UsersAccessPage', 'swallow-only try/catch at promote-refresh-admins');
        }
      } else {
        // Fall back to displayName parts when firstName is missing (migrated users)
        const editNameParts = (classroomDialogTarget.displayName || '').split(' ');
        const editFirstName = classroomDialogTarget.firstName || editNameParts[0] || classroomDialogTarget.email?.split('@')[0] || '';
        const editLastName = classroomDialogTarget.lastName || editNameParts.slice(1).join(' ') || '';
        await createAuthUserAndProfile({
          email: classroomDialogTarget.email,
          firstName: editFirstName,
          lastName: editLastName,
          role: 'classroomadmin',
          manageableClassrooms: classroomDialogSelection,
          updateIfExists: true,
        });
        notify.success('Classroom access updated');
        setClassroomDialogOpen(false);
        setClassroomDialogTarget(null);
        setClassroomDialogSelection([]);
        await fetchAdmins();
      }
    } catch (err) {
      notify.error(err?.message || 'Failed to update classroom access');
    } finally {
      setClassroomDialogSaving(false);
    }
  };

  const resetUserForm = () => {
    setUserForm({ email: '', firstName: '', lastName: '' });
    setSelectedClassrooms([]);
    setSelectedAdminClassrooms([]);
  };

  const resetStudentForm = () => {
    setStudentForm({ firstName: '', lastName: '', classroomId: '', branchId: '', dob: '', guardianName: '', guardianRelationship: '', guardianPhone: '' });
  };

  // ============================================================================
  // FILTER LOGIC
  // ============================================================================

  const filterTeachers = useMemo(() => {
    // AC1: Classroom admins only see teachers in their manageable classrooms
    const scopedTeachers = isClassroomAdminUser
      ? filterTeachersForAdmin(teachers, classrooms, manageableClassrooms)
      : teachers;

    return scopedTeachers.filter(t => {
      const q = teacherSearch.trim().toLowerCase();
      if (q) {
        const name = `${t.firstName || ''} ${t.lastName || ''}`.trim().toLowerCase();
        const local = (t.email || '').split('@')[0].toLowerCase();
        if (!name.includes(q) && !local.includes(q) && !(t.email || '').toLowerCase().includes(q)) {
          return false;
        }
      }

      const status = (t.status || 'active');
      if (statusFilter === 'active' && status !== 'active') return false;
      if (statusFilter === 'inactive' && status === 'active') return false;

      const assigned = getTeacherClassroomIds(t.id);
      if (onlyNoClassrooms && assigned.length > 0) return false;
      if (selectedClassroomFilterIds.length > 0 && !assigned.some(cid => selectedClassroomFilterIds.includes(cid))) {
        return false;
      }

      return true;
    });
  }, [teachers, classrooms, manageableClassrooms, isClassroomAdminUser, teacherSearch, statusFilter, onlyNoClassrooms, selectedClassroomFilterIds, getTeacherClassroomIds]);

  const filterStudents = useMemo(() => {
    // Scope to manageable classrooms for classroom admins (defense-in-depth alongside fetchStudents scoping)
    const scoped = isClassroomAdminUser ? filterStudentsForAdmin(students, manageableClassrooms) : students;

    return scoped.filter(s => {
      const q = studentSearch.trim().toLowerCase();
      if (q) {
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim().toLowerCase();
        if (!name.includes(q) && !(s.displayName || '').toLowerCase().includes(q) && !(s.studentID || s.id || '').toLowerCase().includes(q)) {
          return false;
        }
      }

      const isActive = (s.status ? s.status === 'active' : (typeof s.isActive === 'boolean' ? s.isActive : true));
      if (studentStatusFilter === 'active' && !isActive) return false;
      if (studentStatusFilter === 'inactive' && isActive) return false;

      if (selectedStudentClassroomFilterIds.length > 0 && !selectedStudentClassroomFilterIds.includes(s.classroomId)) {
        return false;
      }

      return true;
    });
  }, [students, studentSearch, studentStatusFilter, selectedStudentClassroomFilterIds, isClassroomAdminUser, manageableClassrooms]);

  // ============================================================================
  // SUB-COMPONENTS
  // ============================================================================

  const getClassroomLabel = (classroomId) => {
    const found = classrooms.find(c => c.id === classroomId);
    return (found && found.name) ? found.name : classroomId;
  };

  const RoleTabs = ({ value, onChange, canManageAdmins }) => {
    const items = [
      { key: 'teacher', label: 'Teacher', icon: <School size={20} /> },
      ...(canManageAdmins ? [{ key: 'classroomadmin', label: 'Classroom Admin', icon: <ManageAccounts size={20} /> }] : []),
      { key: 'student', label: 'Student', icon: <Groups size={20} /> },
    ];
    const index = Math.max(0, items.findIndex(i => i.key === value));
    return (
      <Box sx={{ backgroundColor: 'white', borderRadius: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid var(--color-border)' }}>
        <Tabs value={index} onChange={(e, newIndex) => onChange(items[newIndex]?.key || 'teacher')} variant="fullWidth" sx={TAB_SX}>
          {items.map((it) => (
            <Tab key={it.key} icon={it.icon} iconPosition="start" label={it.label} aria-label={it.label} />
          ))}
        </Tabs>
      </Box>
    );
  };

  const StatusFilterChips = ({ value, onChange, options = ['all', 'active', 'inactive'] }) => {
    return (
      <>
        {options.map(opt => (
          <Chip
            key={opt}
            label={opt.charAt(0).toUpperCase() + opt.slice(1)}
            size="small"
            clickable
            onClick={() => onChange(opt)}
            color={value === opt ? 'primary' : 'default'}
            variant={value === opt ? 'filled' : 'outlined'}
          />
        ))}
      </>
    );
  };

  const ClassroomFilterDialog = ({ open, onClose, selectedIds, onSelectionChange, title = 'Filter by Classrooms' }) => {
    return (
      <Dialog open={open} onClose={onClose}>
        <DialogTitle component="div"><Typography component="h2" variant="h6">{title}</Typography></DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
            {classrooms.map(c => (
              <Chip
                key={c.id}
                label={c.name || c.id}
                onClick={() => onSelectionChange(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                color={selectedIds.includes(c.id) ? 'primary' : 'default'}
                variant={selectedIds.includes(c.id) ? 'filled' : 'outlined'}
                clickable
                size="small"
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onSelectionChange([])}>Clear</Button>
          <Button variant="contained" onClick={onClose}>Apply</Button>
        </DialogActions>
      </Dialog>
    );
  };

  const UserListItem = ({ user, type, onClick, disabled = false, secondaryContent }) => {
    const displayName = formatDisplayName(user);
    const initials = getInitials(displayName);
    const isTeacher = type === 'teacher';
    
    return (
      <ListItemButton 
        onClick={onClick} 
        disabled={disabled} 
        alignItems="flex-start" 
        sx={{ 
          py: 1.25,
          borderRadius: 2,
          mb: 1.5,
          backgroundColor: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          border: '1px solid var(--color-border)',
          '&:hover': {
            backgroundColor: 'var(--color-bg)',
            boxShadow: '0 4px 12px rgba(79, 70, 229, 0.15)',
            borderColor: 'var(--color-primary)',
            transform: 'translateY(-1px)',
          },
          '&.Mui-disabled': {
            opacity: 0.6,
            backgroundColor: 'var(--color-bg)',
          },
          transition: 'all 0.2s ease-in-out',
        }}
      >
        <ListItemAvatar>
          {isTeacher ? (
            <Avatar 
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=4f46e5&color=ffffff&size=40&format=png`}
              sx={{ backgroundColor: 'var(--color-primary)', fontSize: '0.875rem', fontWeight: 600 }}
            >
              {initials}
            </Avatar>
          ) : (
            <Avatar sx={{ 
              backgroundColor: 'var(--color-primary)',
              color: 'white',
              fontWeight: 600,
              fontSize: '0.875rem'
            }}>
              {initials}
            </Avatar>
          )}
        </ListItemAvatar>
        <ListItemText
          primary={<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{displayName}</Typography>}
          secondary={secondaryContent}
          secondaryTypographyProps={{ component: 'div' }}
        />
      </ListItemButton>
    );
  };

  const LoadingSpinner = ({ size = 24, message = 'Coach Pepper is loading access data...' }) => (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 2, gap: 1.5, flexDirection: 'column' }}>
      <CircularProgress size={size} />
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );

  // ============================================================================
  // EARLY RETURNS
  // ============================================================================

  if (userLoading) {
    return (
      <Box sx={MOBILE_CONTAINER_SX}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
          <LoadingSpinner size={48} message="Coach Pepper is checking your admin access..." />
        </Box>
      </Box>
    );
  }

  if (!hasUserManagementAccess) {
    return (
      <Box sx={MOBILE_CONTAINER_SX}>
        <Box sx={{ p: 3 }}>
          <Alert severity="error" sx={{ mb: 2 }}>Access Denied</Alert>
          <Typography variant="body1" sx={{ mb: 3 }}>Only admins can access this page.</Typography>
          <Button variant="contained" startIcon={<ArrowBack />} onClick={() => onBack && onBack()} fullWidth>
            Back to Admin Panel
          </Button>
        </Box>
      </Box>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Box sx={MOBILE_CONTAINER_SX}>
      <Box sx={{ flex: 1, p:1, pb: 6, backgroundColor: 'var(--color-bg)' }}>
        {error && view !== 'home' && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
        )}

        {/* Home view */}
        {view === 'home' && (
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Card sx={{ borderRadius: 2 }}>
                <CardActionArea onClick={() => { setView('add'); onViewChange && onViewChange('add'); }} sx={{ p: 0 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ bgcolor: 'var(--color-primary)', width: 56, height: 56 }}><PersonAdd /></Avatar>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>Add Users</Typography>
                        <Typography variant="body2" color="text.secondary">Create classroom admins, teachers, or students</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Card sx={{ borderRadius: 2 }}>
                <CardActionArea
                  onClick={() => {
                    setView('manage');
                    onViewChange && onViewChange('manage');
                  }}
                  sx={{ p: 0 }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ bgcolor: 'var(--color-secondary)', width: 56, height: 56 }}><ManageAccounts /></Avatar>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>Manage Users</Typography>
                        <Typography variant="body2" color="text.secondary">Update teacher, classroom admin, or student info</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Card sx={{ borderRadius: 2 }}>
                <CardActionArea onClick={() => onNavigateGraduate && onNavigateGraduate()} sx={{ p: 0 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ bgcolor: 'var(--color-secondary-light)', width: 56, height: 56 }}><School /></Avatar>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>Graduate Students</Typography>
                        <Typography variant="body2" color="text.secondary">Move selected students to a new classroom with history</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Manage header with tabs */}
        {view === 'manage' && (
          <Box sx={{ backgroundColor: 'white', borderRadius: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid var(--color-border)', mb: 2 }}>
            <Tabs
              value={Math.max(0, ([
                'teachers',
                ...(canManageAdmins ? ['superadmins'] : []),
                ...(canViewAdmins ? ['classroomadmins'] : []),
                'students'
              ]).indexOf(manageTab))}
              onChange={(e, idx) => {
                const options = [
                  'teachers',
                  ...(canManageAdmins ? ['superadmins'] : []),
                  ...(canViewAdmins ? ['classroomadmins'] : []),
                  'students'
                ];
                setManageTab(options[idx] || 'teachers');
              }}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{
                ...TAB_SX,
                '& .MuiTabs-scrollButtons': {
                  '&.Mui-disabled': {
                    opacity: 0.3
                  }
                }
              }}
            >
              <Tab label="Teachers" />
              {canManageAdmins && <Tab label="Super Admins" />}
              {canViewAdmins && <Tab label="Classroom Admins" />}
              <Tab label="Students" />
            </Tabs>
          </Box>
        )}

        {/* Teachers tab */}
        {view === 'manage' && manageTab === 'teachers' && (
          <>
            <TextField
              value={teacherSearch}
              onChange={(e) => setTeacherSearch(e.target.value)}
              placeholder="Search teachers by name or email"
              size="small"
              fullWidth
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <StatusFilterChips value={statusFilter} onChange={setStatusFilter} />
              <Chip
                label="No Classrooms"
                size="small"
                clickable
                onClick={() => setOnlyNoClassrooms(v => !v)}
                color={onlyNoClassrooms ? 'primary' : 'default'}
                variant={onlyNoClassrooms ? 'filled' : 'outlined'}
              />
              <Chip
                label={selectedClassroomFilterIds.length > 0 ? `Classrooms (${selectedClassroomFilterIds.length})` : 'Classrooms'}
                size="small"
                clickable
                onClick={() => setClassroomFilterOpen(true)}
                color={selectedClassroomFilterIds.length > 0 ? 'primary' : 'default'}
                variant={selectedClassroomFilterIds.length > 0 ? 'filled' : 'outlined'}
                disabled={onlyNoClassrooms}
              />
            </Box>

            {loading ? <LoadingSpinner /> : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {filterTeachers.slice(0, displayLimits.teachers).map((t) => {
                  const assigned = getTeacherClassroomIds(t.id);
                  const inactive = (t.status && t.status !== 'active');
                  const chips = assigned.slice(0, 3).map(cid => {
                    const cls = classrooms.find(c => c.id === cid);
                    return <Chip key={cid} size="small" label={cls ? (cls.name || cls.id) : cid} sx={{ mr: 0.5, mb: 0.5 }} />;
                  });
                  const overflow = Math.max(0, assigned.length - 3);

                  return (
                    <UserListItem
                      key={t.id}
                      user={t}
                      type="teacher"
                      onClick={() => openActionDialog('teacher', t)}
                      disabled={inactive}
                      secondaryContent={
                        <>
                          <Typography variant="caption" color="text.secondary">{t.email}</Typography>
                          <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {assigned.length > 0 ? (
                              <>
                                {chips}
                                {overflow > 0 && <Chip size="small" label={`+${overflow} more`} sx={{ mr: 0.5, mb: 0.5 }} />}
                              </>
                            ) : (
                              <Typography variant="caption" color="text.secondary">No classrooms</Typography>
                            )}
                          </Box>
                          {inactive && <Chip size="small" color="warning" variant="outlined" label="Inactive" sx={{ mt: 0.5 }} />}
                        </>
                      }
                    />
                  );
                })}
                {filterTeachers.length > displayLimits.teachers && (
                  <Box sx={{ textAlign: 'center', pt: 1 }}>
                    <Button
                      variant="outlined"
                      onClick={() => setDisplayLimits(prev => ({ ...prev, teachers: prev.teachers + 10 }))}
                      startIcon={<ExpandMore />}
                      sx={{ textTransform: 'none' }}
                    >
                      Show 10 More
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            <ClassroomFilterDialog
              open={classroomFilterOpen}
              onClose={() => setClassroomFilterOpen(false)}
              selectedIds={selectedClassroomFilterIds}
              onSelectionChange={setSelectedClassroomFilterIds}
            />

            <Dialog open={manageOpen} onClose={() => setManageOpen(false)}>
              <DialogTitle component="div">
                <Typography component="h2" variant="h6">Manage Classroom Access</Typography>
                {manageTeacher && (
                  <Typography variant="body2" color="text.secondary">
                    {getFullName(manageTeacher)}
                  </Typography>
                )}
              </DialogTitle>
              <DialogContent>
                {manageTeacher && manageTeacher.status && manageTeacher.status !== 'active' && (
                  <Alert severity="warning" sx={{ mb: 2 }}>This teacher is inactive. Access changes are disabled.</Alert>
                )}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                  {classroomsByBranch.map(({ branchId, branchName, classrooms: branchClassrooms }) => (
                    <Box key={branchId}>
                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                        {branchName}
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {branchClassrooms.map(c => (
                          <Chip
                            key={c.id}
                            label={c.name || c.id}
                            onClick={() => toggleManageClassroom(c.id)}
                            color={manageSelectedIds.includes(c.id) ? 'primary' : 'default'}
                            variant={manageSelectedIds.includes(c.id) ? 'filled' : 'outlined'}
                            clickable
                            size="small"
                          />
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setManageOpen(false)}>Cancel</Button>
                <Button
                  variant="contained"
                  onClick={saveManage}
                  disabled={manageSaving || (manageTeacher && manageTeacher.status && manageTeacher.status !== 'active')}
                >
                  {manageSaving ? 'Saving...' : 'Save'}
                </Button>
              </DialogActions>
            </Dialog>
          </>
        )}

        {/* Super Admins tab */}
        {view === 'manage' && manageTab === 'superadmins' && canManageAdmins && (
          <>
            {loading ? <LoadingSpinner /> : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {superAdmins.slice(0, displayLimits.superadmins).map((a) => (
                  <UserListItem
                    key={a.id}
                    user={a}
                    type="superadmin"
                    onClick={() => openActionDialog('superadmin', a)}
                    secondaryContent={
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">{a.email}</Typography>
                        <Chip
                          size="small"
                          label="Super Admin"
                          sx={{
                            backgroundColor: 'var(--color-primary)',
                            color: 'white',
                            fontWeight: 500
                          }}
                        />
                      </Box>
                    }
                  />
                ))}
                {superAdmins.length > displayLimits.superadmins && (
                  <Box sx={{ textAlign: 'center', pt: 1 }}>
                    <Button
                      variant="outlined"
                      onClick={() => setDisplayLimits(prev => ({ ...prev, superadmins: prev.superadmins + 10 }))}
                      startIcon={<ExpandMore />}
                      sx={{ textTransform: 'none' }}
                    >
                      Show 10 More
                    </Button>
                  </Box>
                )}
              </Box>
            )}
          </>
        )}

        {/* Classroom Admins tab */}
        {view === 'manage' && manageTab === 'classroomadmins' && canViewAdmins && (
          <>
            {loading ? <LoadingSpinner /> : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {admins.slice(0, displayLimits.classroomadmins).map((a) => (
                  <UserListItem
                    key={a.id}
                    user={a}
                    type="classroomadmin"
                    onClick={canManageAdmins ? () => openActionDialog('classroomadmin', a) : undefined}
                    secondaryContent={
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">{a.email}</Typography>
                        {(a.manageableClassrooms || []).map((classroomId) => (
                          <Chip
                            key={classroomId}
                            size="small"
                            label={getClassroomLabel(classroomId)}
                            sx={{
                              backgroundColor: 'var(--color-surface)',
                              color: 'var(--grey-600)',
                              fontWeight: 500,
                              fontSize: '0.75rem'
                            }}
                          />
                        ))}
                      </Box>
                    }
                  />
                ))}
                {admins.length > displayLimits.classroomadmins && (
                  <Box sx={{ textAlign: 'center', pt: 1 }}>
                    <Button
                      variant="outlined"
                      onClick={() => setDisplayLimits(prev => ({ ...prev, classroomadmins: prev.classroomadmins + 10 }))}
                      startIcon={<ExpandMore />}
                      sx={{ textTransform: 'none' }}
                    >
                      Show 10 More
                    </Button>
                  </Box>
                )}
              </Box>
            )}
          </>
        )}

        {/* Students tab */}
        {view === 'manage' && manageTab === 'students' && (
          <>
            <TextField
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search students by name"
              size="small"
              fullWidth
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <StatusFilterChips value={studentStatusFilter} onChange={setStudentStatusFilter} />
              <Chip
                label={selectedStudentClassroomFilterIds.length > 0 ? `Classrooms (${selectedStudentClassroomFilterIds.length})` : 'Classrooms'}
                size="small"
                clickable
                onClick={() => setStudentClassroomFilterOpen(true)}
                color={selectedStudentClassroomFilterIds.length > 0 ? 'primary' : 'default'}
                variant={selectedStudentClassroomFilterIds.length > 0 ? 'filled' : 'outlined'}
              />
            </Box>

            {loading ? <LoadingSpinner /> : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {filterStudents.slice(0, displayLimits.students).map((s) => {
                  const cls = classrooms.find(c => c.id === s.classroomId);
                  const clsLabel = cls ? (cls.name || cls.id) : (s.classroomId || 'Unknown');
                  return (
                    <UserListItem
                      key={s.id}
                      user={s}
                      type="student"
                      onClick={() => openStudentDialog(s)}
                      secondaryContent={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                          <Chip
                            size="small"
                            label={clsLabel}
                            sx={{
                              backgroundColor: 'var(--color-surface)',
                              color: 'var(--grey-600)',
                              fontWeight: 500,
                              fontSize: '0.75rem'
                            }}
                          />
                        </Box>
                      }
                    />
                  );
                })}
                {filterStudents.length > displayLimits.students && (
                  <Box sx={{ textAlign: 'center', pt: 1 }}>
                    <Button
                      variant="outlined"
                      onClick={() => setDisplayLimits(prev => ({ ...prev, students: prev.students + 10 }))}
                      startIcon={<ExpandMore />}
                      sx={{ textTransform: 'none' }}
                    >
                      Show 10 More
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            <ClassroomFilterDialog
              open={studentClassroomFilterOpen}
              onClose={() => setStudentClassroomFilterOpen(false)}
              selectedIds={selectedStudentClassroomFilterIds}
              onSelectionChange={setSelectedStudentClassroomFilterIds}
            />
          </>
        )}

        {/* Add view */}
        {view === 'add' && (
          <Box>
            <Card
              sx={{
                borderRadius: 3,
                boxShadow: '0 18px 45px rgba(15,23,42,0.16)',
              }}
            >
              <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'var(--grey-900)' }}>
                    Add Users
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mt: 0.5 }}>
                    Create teachers, classroom admins, or students and assign them to classrooms.
                  </Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <form onSubmit={handleSubmit}>
                  <Grid container spacing={2}>
              <Grid item xs={12}>
                <RoleTabs value={role} onChange={setRole} canManageAdmins={canManageAdmins} />
              </Grid>

              {(role === 'classroomadmin' || role === 'teacher') && (
                <>
                  <Grid item xs={12}>
                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                      {role === 'classroomadmin' ? 'Classroom Admin Details' : 'Teacher Details'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Email"
                      placeholder="name@pepschoolv2.com, @ribbons.education, or @accelschool.in"
                      fullWidth
                      value={userForm.email}
                      onChange={(e) => setUserForm(p => ({ ...p, email: e.target.value }))}
                      error={!!validationErrors.email}
                      helperText={validationErrors.email}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="First Name"
                      fullWidth
                      value={userForm.firstName}
                      onChange={(e) => setUserForm(p => ({ ...p, firstName: e.target.value }))}
                      error={!!validationErrors.firstName}
                      helperText={validationErrors.firstName}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Last Name (optional)"
                      fullWidth
                      value={userForm.lastName}
                      onChange={(e) => setUserForm(p => ({ ...p, lastName: e.target.value }))}
                    />
                  </Grid>

                  {role === 'classroomadmin' && (
                    <Grid item xs={12}>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle1" sx={{ mb: 1 }}>Assign Classrooms</Typography>
                      <Box
                        sx={{
                          backgroundColor: 'white',
                          p: 0.75,
                          borderRadius: 1.5,
                          border: '1px solid var(--color-border)',
                          maxHeight: 184,
                          overflowY: 'auto'
                        }}
                      >
                        <List dense disablePadding>
                          {classrooms.map((cls) => (
                            <ListItem key={cls.id} disablePadding>
                              <ListItemButton
                                dense
                                onClick={() => handleAdminClassroomToggle(cls.id)}
                              >
                                <ListItemIcon sx={{ minWidth: 32 }}>
                                  <Checkbox
                                    edge="start"
                                    tabIndex={-1}
                                    disableRipple
                                    checked={selectedAdminClassrooms.includes(cls.id)}
                                  />
                                </ListItemIcon>
                                <ListItemText
                                  primary={cls.name}
                                  primaryTypographyProps={{ variant: 'body2' }}
                                />
                              </ListItemButton>
                            </ListItem>
                          ))}
                        </List>
                      </Box>
                      {validationErrors.classrooms && (
                        <Typography variant="caption" color="error">{validationErrors.classrooms}</Typography>
                      )}
                    </Grid>
                  )}

                  {role === 'teacher' && (
                    <Grid item xs={12}>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle1" sx={{ mb: 1 }}>Assign Classrooms</Typography>
                      {loading ? (
                        <LoadingSpinner />
                      ) : (
                        <>
                          <Box
                            sx={{
                              backgroundColor: 'white',
                              p: 0.75,
                              borderRadius: 1.5,
                              border: '1px solid var(--color-border)',
                              maxHeight: 184,
                              overflowY: 'auto'
                            }}
                          >
                            <List dense disablePadding>
                              {classrooms.map((c) => (
                                <ListItem key={c.id} disablePadding>
                                  <ListItemButton
                                    dense
                                    onClick={() => handleClassroomToggle(c.id)}
                                  >
                                    <ListItemIcon sx={{ minWidth: 32 }}>
                                      <Checkbox
                                        edge="start"
                                        tabIndex={-1}
                                        disableRipple
                                        checked={selectedClassrooms.includes(c.id)}
                                      />
                                    </ListItemIcon>
                                    <ListItemText
                                      primary={`${c.name} (${c.studentCount} students)`}
                                      primaryTypographyProps={{ variant: 'body2' }}
                                    />
                                  </ListItemButton>
                                </ListItem>
                              ))}
                            </List>
                          </Box>
                          {validationErrors.classrooms && (
                            <Typography variant="caption" color="error">{validationErrors.classrooms}</Typography>
                          )}
                        </>
                      )}
                    </Grid>
                  )}
                </>
              )}

              {role === 'student' && (
                <>
                  <Grid item xs={12}>
                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>Student Details</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="First Name"
                      fullWidth
                      value={studentForm.firstName}
                      onChange={(e) => setStudentForm(p => ({ ...p, firstName: e.target.value }))}
                      error={!!validationErrors.stuFirstName}
                      helperText={validationErrors.stuFirstName}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Last Name (optional)"
                      fullWidth
                      value={studentForm.lastName}
                      onChange={(e) => setStudentForm(p => ({ ...p, lastName: e.target.value }))}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Classroom</Typography>
                    <Box
                      sx={{
                        backgroundColor: 'white',
                        p: 0.75,
                        borderRadius: 1.5,
                        border: '1px solid var(--color-border)',
                        maxHeight: 184,
                        overflowY: 'auto'
                      }}
                    >
                      <List dense disablePadding>
                        {classrooms.map((c) => (
                          <ListItem key={c.id} disablePadding>
                            <ListItemButton
                              dense
                              onClick={() => setStudentForm((p) => ({ ...p, classroomId: c.id, branchId: c.branchId || '' }))}
                            >
                              <ListItemIcon sx={{ minWidth: 32 }}>
                                <Checkbox
                                  edge="start"
                                  tabIndex={-1}
                                  disableRipple
                                  checked={studentForm.classroomId === c.id}
                                />
                              </ListItemIcon>
                              <ListItemText
                                primary={`${c.name} (${c.studentCount} students)`}
                                primaryTypographyProps={{ variant: 'body2' }}
                              />
                            </ListItemButton>
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                    {validationErrors.classroomId && (
                      <Typography variant="caption" color="error">{validationErrors.classroomId}</Typography>
                    )}
                  </Grid>
                  {studentForm.classroomId && studentForm.branchId && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>Branch</Typography>
                      <Box
                        sx={{
                          backgroundColor: 'var(--color-bg)',
                          p: 1.5,
                          borderRadius: 1.5,
                          border: '1px solid var(--color-border)',
                        }}
                      >
                        <Typography variant="body2" color="text.secondary">
                          {(() => {
                            const branch = branches.find(b => b.id === studentForm.branchId);
                            return branch ? (branch.name || branch.id).toUpperCase() : studentForm.branchId.toUpperCase();
                          })()}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                  <Grid item xs={12}>
                    <TextField
                      type="date"
                      label="Date of Birth"
                      required
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      value={studentForm.dob}
                      onChange={(e) => setStudentForm(p => ({ ...p, dob: e.target.value }))}
                      error={!!validationErrors.stuDob}
                      helperText={validationErrors.stuDob}
                      inputProps={{ max: new Date().toISOString().split('T')[0] }}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Guardian (optional)</Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Name"
                      fullWidth
                      value={studentForm.guardianName}
                      onChange={(e) => setStudentForm(p => ({ ...p, guardianName: e.target.value }))}
                      error={!!validationErrors.guardian}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Relationship"
                      fullWidth
                      value={studentForm.guardianRelationship}
                      onChange={(e) => setStudentForm(p => ({ ...p, guardianRelationship: e.target.value }))}
                      error={!!validationErrors.guardian}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Phone"
                      fullWidth
                      value={studentForm.guardianPhone}
                      onChange={(e) => setStudentForm(p => ({ ...p, guardianPhone: e.target.value }))}
                      error={!!validationErrors.guardian}
                      helperText={validationErrors.guardian}
                    />
                  </Grid>
                </>
              )}

              <Grid item xs={12} sx={{ mt: 2 }}>
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  size="large"
                  disabled={submitting}
                  startIcon={<PersonAdd />}
                  sx={{ py: 1.5 }}
                >
                  {submitting ? 'Saving...' : (role === 'student' ? 'Create Student' : 'Create User Account')}
                </Button>
              </Grid>
            </Grid>
                </form>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>

      {/* Action dialog */}
      <Dialog open={actionDialogOpen} onClose={closeActionDialog}>
        <DialogTitle component="div">
          <Typography component="h2" variant="h6">
            {actionUser?.user ? formatDisplayName(actionUser.user) : 'User'}
          </Typography>
          {actionUser?.user?.email && (
            <Typography variant="body2" color="text.secondary">{actionUser.user.email}</Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {actionUser?.type === 'teacher' && (
              <Button
                variant="outlined"
                fullWidth
                startIcon={<ManageAccounts />}
                onClick={() => {
                  if (actionUser?.user) {
                    openManage(actionUser.user);
                    closeActionDialog();
                  }
                }}
                sx={{ py: 1.5 }}
              >
                Manage Classroom Access
              </Button>
            )}
            {canManageAdmins && actionUser?.type === 'teacher' && (
              <Button
                variant="outlined"
                fullWidth
                startIcon={<ManageAccounts />}
                onClick={() => {
                  if (actionUser?.user) {
                    openClassroomDialog(actionUser.user, 'promote');
                    closeActionDialog();
                  }
                }}
                sx={{ py: 1.5 }}
              >
                Promote to Classroom Admin
              </Button>
            )}
            {actionUser?.type === 'classroomadmin' && canManageAdmins && (
              <Button
                variant="outlined"
                fullWidth
                startIcon={<ManageAccounts />}
                onClick={() => {
                  if (actionUser?.user) {
                    openClassroomDialog(actionUser.user);
                    closeActionDialog();
                  }
                }}
                sx={{ py: 1.5 }}
              >
                Edit Classroom Access
              </Button>
            )}
            {actionUser?.type === 'classroomadmin' && canManageAdmins && (
              <Button
                variant="outlined"
                fullWidth
                startIcon={<ManageAccounts />}
                onClick={() => {
                  if (actionUser?.user) {
                    openDemoteDialog(actionUser.user);
                    closeActionDialog();
                  }
                }}
                sx={{ py: 1.5 }}
              >
                Demote to Teacher
              </Button>
            )}
            {/* Hide delete for admin types unless superadmin */}
            {(actionUser?.type === 'teacher' || actionUser?.type === 'student' || canManageAdmins) && (
              <Button
                variant="outlined"
                color="error"
                fullWidth
                startIcon={<Delete />}
                onClick={() => {
                  if (actionUser) {
                    openDeleteConfirm(actionUser.type, actionUser.user);
                  }
                }}
                sx={{ py: 1.5 }}
              >
                Delete User
              </Button>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeActionDialog}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={classroomDialogOpen} onClose={closeClassroomDialog}>
        <DialogTitle component="div">
          <Typography component="h2" variant="h6">
            {classroomDialogMode === 'promote' ? 'Promote to Classroom Admin' : 'Edit Classroom Access'}
          </Typography>
          {classroomDialogTarget?.email && (
            <Typography variant="body2" color="text.secondary">{classroomDialogTarget.email}</Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Select classrooms this admin can manage.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {classroomsByBranch.map(({ branchId, branchName, classrooms: branchClassrooms }) => (
              <Box key={branchId}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                  {branchName}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {branchClassrooms.map((cls) => (
                    <Chip
                      key={cls.id}
                      label={cls.name || cls.id}
                      onClick={() => handleClassroomDialogToggle(cls.id)}
                      color={classroomDialogSelection.includes(cls.id) ? 'primary' : 'default'}
                      variant={classroomDialogSelection.includes(cls.id) ? 'filled' : 'outlined'}
                      clickable
                      size="small"
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
          {classroomDialogError && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
              {classroomDialogError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeClassroomDialog} disabled={classroomDialogSaving}>Cancel</Button>
          <Button variant="contained" onClick={handleClassroomDialogSave} disabled={classroomDialogSaving}>
            {classroomDialogSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={demoteOpen} onClose={closeDemoteDialog}>
        <DialogTitle component="div">
          <Typography component="h2" variant="h6">Demote to Teacher</Typography>
          {demoteTarget && (
            <Typography variant="body2" color="text.secondary">
              {getFullName(demoteTarget)}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select classrooms this user should teach after demotion.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {classroomsByBranch.map(({ branchId, branchName, classrooms: branchClassrooms }) => (
              <Box key={branchId}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                  {branchName}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {branchClassrooms.map(c => (
                    <Chip
                      key={c.id}
                      label={c.name || c.id}
                      onClick={() => toggleDemoteClassroom(c.id)}
                      color={demoteSelectedIds.includes(c.id) ? 'primary' : 'default'}
                      variant={demoteSelectedIds.includes(c.id) ? 'filled' : 'outlined'}
                      clickable
                      size="small"
                      disabled={demoteSaving}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
          {demoteError && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
              {demoteError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDemoteDialog} disabled={demoteSaving}>Cancel</Button>
          <Button variant="contained" onClick={handleDemoteSave} disabled={demoteSaving}>
            {demoteSaving ? 'Saving...' : 'Convert to Teacher'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Info dialog */}
      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)}>
        <DialogTitle component="div"><Typography component="h2" variant="h6">{infoTitle}</Typography></DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mt: 1 }}>{infoMessage || 'Property edit functionality coming soon!'}</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setInfoOpen(false)}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle component="div"><Typography component="h2" variant="h6">{confirmContent.title}</Typography></DialogTitle>
        <DialogContent><Typography variant="body2" sx={{ mt: 1 }}>{confirmContent.body}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => confirmContent.onConfirm && confirmContent.onConfirm()}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => !deleteDeleting && setDeleteConfirmOpen(false)}>
        <DialogTitle component="div">
          <Typography component="h2" variant="h6">
            Delete {deleteTarget?.type === 'teacher' ? 'Teacher' : deleteTarget?.type === 'classroomadmin' ? 'Classroom Admin' : deleteTarget?.type === 'superadmin' ? 'Super Admin' : 'Student'}?
          </Typography>
        </DialogTitle>
        <DialogContent>
          {deleteTarget?.user && deleteTarget.user.id === currentUser?.uid && (
            <Alert severity="error" sx={{ mb: 2 }}>
              You cannot delete your own account. Please ask another admin to perform this action.
            </Alert>
          )}
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone. Are you sure you want to delete this user?
          </Alert>
          {deleteTarget?.user && (
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Name:</strong> {getFullName(deleteTarget.user)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Email:</strong> {deleteTarget.user.email || 'N/A'}
              </Typography>
              {deleteTarget.type === 'teacher' && (
                <Typography variant="body2" color="text.secondary">
                  This will remove the teacher from all assigned classrooms.
                </Typography>
              )}
              {deleteTarget.type === 'student' && deleteTarget.user.classroomId && (
                <Typography variant="body2" color="text.secondary">
                  This will remove the student from their classroom and decrement the student count.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)} disabled={deleteDeleting}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleteDeleting || (deleteTarget?.user?.id === currentUser?.uid)}
            startIcon={deleteDeleting ? <CircularProgress size={16} /> : <Delete />}
          >
            {deleteDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Student metadata dialog */}
      <Dialog open={studentDialogOpen} onClose={closeStudentDialog} maxWidth="sm" fullWidth>
        <DialogTitle component="div" sx={{ pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ 
              width: 56, 
              height: 56, 
              backgroundColor: 'var(--color-primary)',
              fontSize: '1.25rem',
              fontWeight: 600
            }}>
              {selectedStudent ? getInitials(getFullName(selectedStudent)) : ''}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography component="h2" variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                {selectedStudent ? getFullName(selectedStudent) : 'Student Details'}
              </Typography>
              <Chip 
                size="small" 
                label={getClassroomLabel(selectedStudent?.classroomId || '')} 
                sx={{ 
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--grey-600)',
                  fontWeight: 500
                }} 
              />
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedStudent && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
              {/* Editable fields */}
              {studentEditMode ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  <TextField
                    label="First Name"
                    fullWidth
                    value={editedStudentData.firstName}
                    onChange={(e) => setEditedStudentData(p => ({ ...p, firstName: e.target.value }))}
                    error={!!validationErrors.firstName}
                    helperText={validationErrors.firstName}
                  />
                  <TextField
                    label="Last Name"
                    fullWidth
                    value={editedStudentData.lastName}
                    onChange={(e) => setEditedStudentData(p => ({ ...p, lastName: e.target.value }))}
                  />
                  <FormControl fullWidth>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={editedStudentData.status}
                      label="Status"
                      onChange={(e) => setEditedStudentData(p => ({ ...p, status: e.target.value }))}
                    >
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="inactive">Inactive</MenuItem>
                      <MenuItem value="graduated">Graduated</MenuItem>
                      <MenuItem value="transferred">Transferred</MenuItem>
                      <MenuItem value="withdrawn">Withdrawn</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    type="date"
                    label="Date of Birth"
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    value={editedStudentData.dob}
                    onChange={(e) => setEditedStudentData(p => ({ ...p, dob: e.target.value }))}
                    error={!!validationErrors.dob}
                    helperText={validationErrors.dob}
                    placeholder="Select date of birth"
                    inputProps={{ max: new Date().toISOString().split('T')[0] }}
                  />
                </Box>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      First Name
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500, fontSize: '1rem' }}>
                      {selectedStudent.firstName || 'N/A'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Last Name
                    </Typography>
                    <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500, fontSize: '1rem' }}>
                      {selectedStudent.lastName || 'N/A'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Status
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <Chip 
                        size="small" 
                        label={selectedStudent.status || 'active'} 
                        color={selectedStudent.status === 'active' ? 'primary' : 'default'}
                        sx={{ fontWeight: 500 }}
                      />
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Date of Birth
                    </Typography>
                    {selectedStudent.dateOfBirth && selectedStudent.dateOfBirth.toDate ? (
                      <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500, fontSize: '1rem' }}>
                        {formatDate(selectedStudent.dateOfBirth, false)}
                      </Typography>
                    ) : (
                      <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                        Not set
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {studentEditMode ? (
            <>
              <Button onClick={handleStudentEditCancel} disabled={studentSaving}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleStudentEditSave}
                disabled={studentSaving}
                startIcon={studentSaving ? <CircularProgress size={16} /> : null}
              >
                {studentSaving ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <>
              {(!isClassroomAdminUser || isStudentInScope(selectedStudent, manageableClassrooms)) && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => {
                    if (selectedStudent) {
                      openDeleteConfirm('student', selectedStudent);
                      closeStudentDialog();
                    }
                  }}
                  startIcon={<Delete />}
                >
                  Delete
                </Button>
              )}
              <Button
                variant="contained"
                onClick={() => {
                  setValidationErrors({});
                  setStudentEditMode(true);
                }}
                startIcon={<Edit />}
              >
                Edit
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UsersAccessPage;
