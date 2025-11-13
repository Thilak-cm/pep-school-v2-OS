import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, TextField, Button, Grid, Alert, CircularProgress, Chip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, Card, CardContent, CardActionArea, Avatar,
  List, ListItemButton, ListItemAvatar, ListItemText
} from '@mui/material';
import { ArrowBack, PersonAdd, School, ManageAccounts, Groups, ChevronRight, Delete } from '@mui/icons-material';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  runTransaction,
  Timestamp,
  serverTimestamp,
  writeBatch,
  arrayUnion,
  arrayRemove,
  deleteDoc
} from 'firebase/firestore';
import { increment } from 'firebase/firestore';

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

// ============================================================================
// CONSTANTS
// ============================================================================

const MOBILE_CONTAINER_SX = {
  width: '100%',
  maxWidth: '375px',
  minHeight: '100vh',
  margin: '0 auto',
  backgroundColor: '#f8fafc',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden'
};

const TAB_SX = {
  minHeight: 48,
  '& .MuiTab-root': { textTransform: 'none', minHeight: 48, fontWeight: 600 },
  '& .MuiTabs-indicator': { height: 3, borderRadius: 2, backgroundColor: '#4f46e5' }
};

// ============================================================================
// COMPONENT
// ============================================================================

const UsersAccessPage = ({ onBack, currentUser, userRole, view: externalView, onViewChange }) => {
  const notify = useNotify();

  // Page IA: cards home, add users, manage users
  const [view, setView] = useState(externalView || 'home');
  const [manageTab, setManageTab] = useState('teachers');

  // Role selection for Add tab
  const [role, setRole] = useState('teacher');

  // Admin/Teacher form (Add tab)
  const [userForm, setUserForm] = useState({ email: '', firstName: '', lastName: '' });
  const [selectedClassrooms, setSelectedClassrooms] = useState([]);

  // Student form
  const [studentForm, setStudentForm] = useState({
    firstName: '', lastName: '', classroomId: '', dob: '', guardianName: '', guardianRelationship: '', guardianPhone: ''
  });

  // Shared state
  const [classrooms, setClassrooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [onlyNoClassrooms, setOnlyNoClassrooms] = useState(false);
  const [classroomFilterOpen, setClassroomFilterOpen] = useState(false);
  const [selectedClassroomFilterIds, setSelectedClassroomFilterIds] = useState([]);
  
  // Admins
  const [admins, setAdmins] = useState([]);
  
  // Students
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState('all');
  const [studentClassroomFilterOpen, setStudentClassroomFilterOpen] = useState(false);
  const [selectedStudentClassroomFilterIds, setSelectedStudentClassroomFilterIds] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [userLoading, setUserLoading] = useState(true);

  // Callables
  const createAuthUserAndProfile = httpsCallable(cloudFunctions, 'createAuthUserAndProfile');

  // Sync external view prop with internal state
  useEffect(() => {
    if (externalView && externalView !== view) {
      setView(externalView);
    }
  }, [externalView]);

  // Admin gate + classrooms
  useEffect(() => {
    if (userRole !== 'admin') {
      setError('Access denied. Only admins can access this page.');
      setUserLoading(false);
      return;
    }
    setUserLoading(false);
    fetchClassrooms();
  }, [userRole]);

  // Lazily fetch data when entering Manage view
  useEffect(() => {
    if (userRole !== 'admin') return;
    if (view === 'manage') {
      if (manageTab === 'teachers' && teachers.length === 0) fetchTeachers();
      if (manageTab === 'admins' && admins.length === 0) fetchAdmins();
      if (manageTab === 'students' && students.length === 0) fetchStudents();
    }
  }, [view, manageTab, userRole]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active')));
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      setClassrooms(list.map(c => ({ 
        id: c.id, 
        name: c.name || c.id, 
        studentCount: c.studentCount || 0, 
        teacherIds: c.teacherIds || [] 
      })));
    } catch (e) {
      console.error('Fetch classrooms error', e);
      setError('Failed to fetch classrooms');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsersByRole = async (roleName) => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', roleName));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => (a.firstName || a.email || a.id).localeCompare(b.firstName || b.email || b.id));
      return list;
    } catch (e) {
      console.error(`Fetch ${roleName}s error`, e);
      setError(`Failed to fetch ${roleName}s`);
      return [];
    }
  };

  const fetchTeachers = async () => {
    const list = await fetchUsersByRole('teacher');
    setTeachers(list);
  };

  const fetchAdmins = async () => {
    const list = await fetchUsersByRole('admin');
    setAdmins(list);
  };

  const fetchStudents = async () => {
    try {
      const snap = await getDocs(collection(db, 'students'));
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => {
        const an = (a.firstName || a.displayName || a.studentID || a.id);
        const bn = (b.firstName || b.displayName || b.studentID || b.id);
        return String(an).localeCompare(String(bn));
      });
      setStudents(list);
    } catch (e) {
      console.error('Fetch students error', e);
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

  const getTeacherClassroomIds = (teacherId) => Array.from(teacherToClassroomIds.get(teacherId) || new Set());

  // ============================================================================
  // VALIDATION
  // ============================================================================

  const validate = () => {
    const errors = {};
    if (role === 'admin' || role === 'teacher') {
      if (!userForm.email) errors.email = 'Email is required';
      else if (!userForm.email.toLowerCase().endsWith('@pepschoolv2.com')) errors.email = 'Email must be @pepschoolv2.com';
      if (!userForm.firstName) errors.firstName = 'First name is required';
      if (role === 'teacher' && selectedClassrooms.length === 0) errors.classrooms = 'Select at least one classroom';
    } else {
      if (!studentForm.firstName) errors.stuFirstName = 'First name is required';
      if (!studentForm.classroomId) errors.classroomId = 'Select a classroom';
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

  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const openInfo = (title, message = 'Property edit functionality coming soon!') => {
    setInfoTitle(title);
    setInfoMessage(message);
    setInfoOpen(true);
  };

  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionUser, setActionUser] = useState(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteDeleting, setDeleteDeleting] = useState(false);

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
      } else if (type === 'admin') {
        await deleteDoc(doc(db, 'users', user.id));
        setAdmins(prev => prev.filter(a => a.id !== user.id));
        notify.success('Admin deleted successfully');
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
      console.error('Delete user error', error);
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
          } catch (err) {
            console.error('Undo access update failed', err);
            notify.error('Failed to undo access changes');
          }
        }
      });
      setManageOpen(false);
    } catch (e) {
      console.error('Manage access save error', e);
      notify.error('Failed to update access');
    } finally {
      setManageSaving(false);
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

  const computeNextIndexForClassroomYear = async (classroomId, classroomCode, year) => {
    const q = query(collection(db, 'students'), where('classroomId', '==', classroomId));
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    
    try {
      setSubmitting(true);
      setError('');
      
      if (role === 'admin' || role === 'teacher') {
        await handleUserSubmit();
      } else {
        await handleStudentSubmit();
      }
    } catch (err) {
      console.error('Add user error', err);
      setError(err?.message || 'Operation failed');
      notify.error(err?.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUserSubmit = async () => {
    const res = await createAuthUserAndProfile({
      email: userForm.email.trim(),
      firstName: userForm.firstName.trim(),
      lastName: (userForm.lastName || '').trim(),
      role,
      selectedClassrooms: role === 'teacher' ? selectedClassrooms : [],
      updateIfExists: false,
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
          });
          notify.success('User updated');
          resetUserForm();
          setConfirmOpen(false);
          setSuccess(true);
          try { await fetchTeachers(); } catch {}
        }
      );
    } else if (data.ok) {
      notify.success('User created');
      resetUserForm();
      setSuccess(true);
      try { await fetchTeachers(); } catch {}
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
      const attempt = async () => {
        const nextIdx = await computeNextIndexForClassroomYear(studentForm.classroomId, code, year);
        const sid = formatStudentId(year, code, nextIdx);
        const ref = doc(db, 'students', sid);
        await runTransaction(db, async (tx) => {
          const s = await tx.get(ref);
          if (s.exists()) throw new Error('exists');
          const payload = {
            studentID: sid,
            firstName: studentForm.firstName.trim(),
            lastName: (studentForm.lastName || '').trim(),
            displayName: `${studentForm.firstName} ${studentForm.lastName || ''}`.trim(),
            classroomId: studentForm.classroomId,
            status: 'active',
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: currentUser?.email || 'ui',
          };
          if (studentForm.dob) payload.dateOfBirth = Timestamp.fromDate(new Date(studentForm.dob));
          const hasGuardian = [studentForm.guardianName, studentForm.guardianRelationship, studentForm.guardianPhone]
            .every(v => (v||'').trim() !== '');
          if (hasGuardian) {
            payload.guardianName = studentForm.guardianName.trim();
            payload.guardianRelationship = studentForm.guardianRelationship.trim();
            payload.guardianPhone = studentForm.guardianPhone.trim();
          }
          tx.set(ref, payload);
          const classroomRef = doc(db, 'classrooms', studentForm.classroomId);
          tx.set(classroomRef, { studentCount: increment(1), updatedAt: serverTimestamp() }, { merge: true });
        });
        return sid;
      };
      let createdId;
      try { createdId = await attempt(); }
      catch { createdId = await attempt(); }
      
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

  const resetUserForm = () => {
    setUserForm({ email: '', firstName: '', lastName: '' });
    setSelectedClassrooms([]);
  };

  const resetStudentForm = () => {
    setStudentForm({ firstName: '', lastName: '', classroomId: '', dob: '', guardianName: '', guardianRelationship: '', guardianPhone: '' });
  };

  // ============================================================================
  // FILTER LOGIC
  // ============================================================================

  const filterTeachers = useMemo(() => {
    return teachers.filter(t => {
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
  }, [teachers, teacherSearch, statusFilter, onlyNoClassrooms, selectedClassroomFilterIds, getTeacherClassroomIds]);

  const filterStudents = useMemo(() => {
    return students.filter(s => {
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
  }, [students, studentSearch, studentStatusFilter, selectedStudentClassroomFilterIds]);

  // ============================================================================
  // SUB-COMPONENTS
  // ============================================================================

  const RoleTabs = ({ value, onChange }) => {
    const items = [
      { key: 'teacher', label: 'Teacher', icon: <School fontSize="small" /> },
      { key: 'admin', label: 'Admin', icon: <ManageAccounts fontSize="small" /> },
      { key: 'student', label: 'Student', icon: <Groups fontSize="small" /> },
    ];
    const index = Math.max(0, items.findIndex(i => i.key === value));
    return (
      <Box sx={{ backgroundColor: 'white', borderRadius: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
        <Tabs value={index} onChange={(e, newIndex) => onChange(items[newIndex].key)} variant="fullWidth" sx={TAB_SX}>
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
      <ListItemButton onClick={onClick} disabled={disabled} alignItems="flex-start" sx={{ py: 1.25 }}>
        <ListItemAvatar>
          {isTeacher ? (
            <Avatar 
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=4f46e5&color=ffffff&size=40&format=png`}
              sx={{ backgroundColor: '#4f46e5', fontSize: '0.875rem', fontWeight: 600 }}
            >
              {initials}
            </Avatar>
          ) : (
            <Avatar>{initials}</Avatar>
          )}
        </ListItemAvatar>
        <ListItemText
          primary={<Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{displayName}</Typography>}
          secondary={secondaryContent}
        />
        <ChevronRight color="disabled" />
      </ListItemButton>
    );
  };

  const LoadingSpinner = ({ size = 24 }) => (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
      <CircularProgress size={size} />
    </Box>
  );

  // ============================================================================
  // EARLY RETURNS
  // ============================================================================

  if (userLoading) {
    return (
      <Box sx={MOBILE_CONTAINER_SX}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={48} />
        </Box>
      </Box>
    );
  }

  if (userRole !== 'admin') {
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
      <Box sx={{ flex: 1, overflow: 'auto', p: 3, backgroundColor: '#f8fafc' }}>
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
                      <Avatar sx={{ bgcolor: '#4f46e5', width: 56, height: 56 }}><PersonAdd /></Avatar>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>Add Users</Typography>
                        <Typography variant="body2" color="text.secondary">Create admins, teachers, or students</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Card sx={{ borderRadius: 2 }}>
                <CardActionArea onClick={() => setView('manage')} sx={{ p: 0 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ bgcolor: '#059669', width: 56, height: 56 }}><ManageAccounts /></Avatar>
                      <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>Manage Users</Typography>
                        <Typography variant="body2" color="text.secondary">Update teacher classroom access</Typography>
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
          <Box sx={{ backgroundColor: 'white', borderRadius: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', mb: 2 }}>
            <Tabs
              value={{ teachers: 0, admins: 1, students: 2 }[manageTab]}
              onChange={(e, idx) => setManageTab(idx === 0 ? 'teachers' : idx === 1 ? 'admins' : 'students')}
              variant="fullWidth"
              sx={TAB_SX}
            >
              <Tab label="Teachers" />
              <Tab label="Admins" />
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
              <List disablePadding>
                {filterTeachers.map((t, idx, arr) => {
                  const assigned = getTeacherClassroomIds(t.id);
                  const inactive = (t.status && t.status !== 'active');
                  const chips = assigned.slice(0, 3).map(cid => {
                    const cls = classrooms.find(c => c.id === cid);
                    return <Chip key={cid} size="small" label={cls ? (cls.name || cls.id) : cid} sx={{ mr: 0.5, mb: 0.5 }} />;
                  });
                  const overflow = Math.max(0, assigned.length - 3);
                  
                  return (
                    <React.Fragment key={t.id}>
                      <UserListItem
                        user={t}
                        type="teacher"
                        onClick={() => openActionDialog('teacher', t)}
                        disabled={inactive}
                        secondaryContent={
                          <>
                            <Typography variant="caption" color="text.secondary">{t.email}</Typography>
                            <Box sx={{ mt: 0.5 }}>
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
                      {idx < arr.length - 1 && <Divider component="li" sx={{ ml: 9 }} />}
                    </React.Fragment>
                  );
                })}
              </List>
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
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                  {classrooms.map(c => (
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

        {/* Admins tab */}
        {view === 'manage' && manageTab === 'admins' && (
          <>
            {loading ? <LoadingSpinner /> : (
              <List disablePadding>
                {admins.map((a, idx, arr) => (
                  <React.Fragment key={a.id}>
                    <UserListItem
                      user={a}
                      type="admin"
                      onClick={() => openActionDialog('admin', a)}
                      secondaryContent={<Typography variant="caption" color="text.secondary">{a.email}</Typography>}
                    />
                    {idx < arr.length - 1 && <Divider component="li" sx={{ ml: 9 }} />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </>
        )}

        {/* Students tab */}
        {view === 'manage' && manageTab === 'students' && (
          <>
            <TextField
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search students by name or ID"
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
              <List disablePadding>
                {filterStudents.map((s, idx, arr) => {
                  const cls = classrooms.find(c => c.id === s.classroomId);
                  const clsLabel = cls ? (cls.name || cls.id) : (s.classroomId || 'Unknown');
                  return (
                    <React.Fragment key={s.id}>
                      <UserListItem
                        user={s}
                        type="student"
                        onClick={() => openActionDialog('student', s)}
                        secondaryContent={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            {s.studentID && <Typography variant="caption" color="text.secondary">{s.studentID}</Typography>}
                            <Chip size="small" label={clsLabel} sx={{ mr: 0.5 }} />
                          </Box>
                        }
                      />
                      {idx < arr.length - 1 && <Divider component="li" sx={{ ml: 9 }} />}
                    </React.Fragment>
                  );
                })}
              </List>
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
          <form onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <RoleTabs value={role} onChange={setRole} />
              </Grid>

              {(role === 'admin' || role === 'teacher') && (
                <>
                  <Grid item xs={12}>
                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                      {role === 'admin' ? 'Admin Details' : 'Teacher Details'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="Email"
                      placeholder="name@pepschoolv2.com"
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

                  {role === 'teacher' && (
                    <Grid item xs={12}>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle1" sx={{ mb: 1 }}>Assign Classrooms</Typography>
                      {loading ? (
                        <LoadingSpinner />
                      ) : (
                        <>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, backgroundColor: 'white', p: 2, borderRadius: 1, border: '1px solid #e2e8f0' }}>
                            {classrooms.map(c => (
                              <Chip
                                key={c.id}
                                label={`${c.name} (${c.studentCount} students)`}
                                onClick={() => handleClassroomToggle(c.id)}
                                color={selectedClassrooms.includes(c.id) ? 'primary' : 'default'}
                                variant={selectedClassrooms.includes(c.id) ? 'filled' : 'outlined'}
                                clickable
                                size="small"
                              />
                            ))}
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
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {classrooms.map(c => (
                        <Chip
                          key={c.id}
                          label={`${c.name} (${c.studentCount} students)`}
                          onClick={() => setStudentForm(p => ({ ...p, classroomId: c.id }))}
                          color={studentForm.classroomId === c.id ? 'primary' : 'default'}
                          variant={studentForm.classroomId === c.id ? 'filled' : 'outlined'}
                          clickable
                          size="small"
                        />
                      ))}
                    </Box>
                    {validationErrors.classroomId && (
                      <Typography variant="caption" color="error">{validationErrors.classroomId}</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      type="date"
                      label="Date of Birth (optional)"
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                      value={studentForm.dob}
                      onChange={(e) => setStudentForm(p => ({ ...p, dob: e.target.value }))}
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
            <Button
              variant="outlined"
              fullWidth
              startIcon={<ManageAccounts />}
              onClick={() => {
                if (actionUser?.user && actionUser.type === 'teacher') {
                  openManage(actionUser.user);
                  closeActionDialog();
                }
              }}
              disabled={actionUser?.type !== 'teacher'}
              sx={{ py: 1.5 }}
            >
              Manage Classroom Access
            </Button>
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeActionDialog}>Cancel</Button>
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
            Delete {deleteTarget?.type === 'teacher' ? 'Teacher' : deleteTarget?.type === 'admin' ? 'Admin' : 'Student'}?
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
    </Box>
  );
};

export default UsersAccessPage;
