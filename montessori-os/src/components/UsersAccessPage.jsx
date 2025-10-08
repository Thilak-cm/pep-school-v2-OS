import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, TextField, Button, Grid, Alert, CircularProgress, Chip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, Card, CardContent, CardActionArea, Avatar
} from '@mui/material';
import { ArrowBack, PersonAdd, School, ManageAccounts, Groups } from '@mui/icons-material';
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
  arrayRemove
} from 'firebase/firestore';

const UsersAccessPage = ({ onBack, currentUser, userRole, view: externalView, onViewChange }) => {
  const notify = useNotify();

  // Page IA: cards home, add users, manage users
  const [view, setView] = useState(externalView || 'home'); // 'home' | 'add' | 'manage'
  const [manageTab, setManageTab] = useState('teachers'); // 'teachers' | 'admins' | 'students'

  // Role selection for Add tab
  const [role, setRole] = useState('teacher'); // 'admin' | 'teacher' | 'student'

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

  // Admin gate + classrooms (teachers loaded lazily in Manage view)
  useEffect(() => {
    if (userRole !== 'admin') {
      setError('Access denied. Only admins can access this page.');
      setUserLoading(false);
      return;
    }
    setUserLoading(false);
    fetchClassrooms();
  }, [userRole]);

  // Lazily fetch teachers when entering Manage > Teachers
  useEffect(() => {
    if (userRole !== 'admin') return;
    if (view === 'manage' && manageTab === 'teachers' && teachers.length === 0) {
      fetchTeachers();
    }
  }, [view, manageTab, userRole]);

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'classrooms'));
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      setClassrooms(list.map(c => ({ id: c.id, name: c.name || c.id, studentCount: c.studentCount || 0, teacherIds: c.teacherIds || [] })));
    } catch (e) {
      console.error('Fetch classrooms error', e);
      setError('Failed to fetch classrooms');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const qTeachers = query(collection(db, 'users'), where('role', '==', 'teacher'));
      const snap = await getDocs(qTeachers);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => (a.firstName || a.email || a.id).localeCompare(b.firstName || b.email || b.id));
      setTeachers(list);
    } catch (e) {
      console.error('Fetch teachers error', e);
      setError('Failed to fetch teachers');
    }
  };

  // Validation for Add tab
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

  const handleClassroomToggle = (id) => {
    setSelectedClassrooms(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    if (validationErrors.classrooms) setValidationErrors(prev => ({ ...prev, classrooms: '' }));
  };

  // Confirm dialog (Add tab)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmContent, setConfirmContent] = useState({ title: '', body: '', onConfirm: null });
  const openConfirm = (title, body, onConfirm) => { setConfirmContent({ title, body, onConfirm }); setConfirmOpen(true); };

  // Derived: teacherId -> classroomIds from loaded classrooms
  const teacherToClassroomIds = useMemo(() => {
    const mapping = new Map();
    classrooms.forEach(c => {
      const tids = c.teacherIds || [];
      tids.forEach(tid => {
        if (!mapping.has(tid)) mapping.set(tid, new Set());
        mapping.get(tid).add(c.id);
      });
    });
    return mapping;
  }, [classrooms]);

  const getTeacherClassroomIds = (teacherId) => Array.from(teacherToClassroomIds.get(teacherId) || new Set());

  // Manage Access dialog state
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTeacher, setManageTeacher] = useState(null);
  const [manageSelectedIds, setManageSelectedIds] = useState([]);
  const [manageSaving, setManageSaving] = useState(false);

  const openManage = (teacher) => {
    setManageTeacher(teacher);
    setManageSelectedIds(getTeacherClassroomIds(teacher.id));
    setManageOpen(true);
  };
  const toggleManageClassroom = (id) => {
    setManageSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const saveManage = async () => {
    if (!manageTeacher) return;
    if ((manageTeacher.status || 'active') !== 'active') return;
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
      // Optimistically update local classrooms state
      setClassrooms(prev => prev.map(c => {
        if (toAdd.includes(c.id)) return { ...c, teacherIds: Array.from(new Set([...(c.teacherIds || []), manageTeacher.id])) };
        if (toRemove.includes(c.id)) return { ...c, teacherIds: (c.teacherIds || []).filter(tid => tid !== manageTeacher.id) };
        return c;
      }));
      notify.success('Access updated');
      setManageOpen(false);
    } catch (e) {
      console.error('Manage access save error', e);
      notify.error('Failed to update access');
    } finally {
      setManageSaving(false);
    }
  };

  // Student ID helpers (Add tab)
  const classroomCodeFromId = (id) => {
    const letters = (id || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
    return (letters.slice(0, 3) || 'STD').padEnd(3, 'X').slice(0, 3);
  };
  const extractIndexFromStudentId = (studentId, classroomCode, year) => {
    const re = new RegExp(`^${year}-` + classroomCode + `-([0-9]{3})$`);
    const m = String(studentId || '').match(re);
    if (!m) return null; const n = parseInt(m[1], 10); return Number.isFinite(n) ? n : null;
  };
  const computeNextIndexForClassroomYear = async (classroomId, classroomCode, year) => {
    const q = query(collection(db, 'students'), where('classroomId', '==', classroomId));
    const snap = await getDocs(q);
    let maxIndex = 0;
    snap.forEach(d => {
      const data = d.data() || {}; const candidate = data.studentID || d.id;
      const idx = extractIndexFromStudentId(candidate, classroomCode, year);
      if (idx && idx > maxIndex) maxIndex = idx;
    });
    return maxIndex + 1;
  };
  const formatStudentId = (year, code, idx) => `${year}-${code}-${String(idx).padStart(3, '0')}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setSubmitting(true); setError('');
      if (role === 'admin' || role === 'teacher') {
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
              setUserForm({ email: '', firstName: '', lastName: '' });
              setSelectedClassrooms([]);
              setConfirmOpen(false);
              setSuccess(true);
              try { await fetchTeachers(); } catch {}
            }
          );
        } else if (data.ok) {
          notify.success('User created');
          setUserForm({ email: '', firstName: '', lastName: '' });
          setSelectedClassrooms([]);
          setSuccess(true);
          try { await fetchTeachers(); } catch {}
        } else {
          throw new Error('Failed to create user');
        }
      } else {
        // Student duplicate warning
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
              const hasGuardian = [studentForm.guardianName, studentForm.guardianRelationship, studentForm.guardianPhone].every(v => (v||'').trim() !== '');
              if (hasGuardian) {
                payload.guardianName = studentForm.guardianName.trim();
                payload.guardianRelationship = studentForm.guardianRelationship.trim();
                payload.guardianPhone = studentForm.guardianPhone.trim();
              }
              tx.set(ref, payload);
            });
            return sid;
          };
          let createdId;
          try { createdId = await attempt(); }
          catch { createdId = await attempt(); }
          notify.success(`Student ${studentForm.firstName} ${studentForm.lastName || ''} has been added to the roster!`);
          setStudentForm({ firstName: '', lastName: '', classroomId: '', dob: '', guardianName: '', guardianRelationship: '', guardianPhone: '' });
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
      }
    } catch (err) {
      console.error('Add user error', err);
      setError(err?.message || 'Operation failed');
      notify.error(err?.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (userLoading) {
    return (
      <Box sx={{ width: '100%', maxWidth: '375px', minHeight: '100vh', margin: '0 auto', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={48} />
        </Box>
      </Box>
    );
  }

  if (userRole !== 'admin') {
    return (
      <Box sx={{ width: '100%', maxWidth: '375px', minHeight: '100vh', margin: '0 auto', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ p: 3 }}>
          <Alert severity="error" sx={{ mb: 2 }}>Access Denied</Alert>
          <Typography variant="body1" sx={{ mb: 3 }}>Only admins can access this page.</Typography>
          <Button variant="contained" startIcon={<ArrowBack />} onClick={() => onBack && onBack()} fullWidth>Back to Admin Panel</Button>
        </Box>
      </Box>
    );
  }

  // Tab-style role selector for Add tab
  const RoleTabs = ({ value, onChange }) => {
    const items = [
      { key: 'teacher', label: 'Teacher', icon: <School fontSize="small" /> },
      { key: 'admin', label: 'Admin', icon: <ManageAccounts fontSize="small" /> },
      { key: 'student', label: 'Student', icon: <Groups fontSize="small" /> },
    ];
    const index = Math.max(0, items.findIndex(i => i.key === value));
    return (
      <Box sx={{ backgroundColor: 'white', borderRadius: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
        <Tabs
          value={index}
          onChange={(e, newIndex) => onChange(items[newIndex].key)}
          variant="fullWidth"
          sx={{
            minHeight: 48,
            '& .MuiTabs-flexContainer': { alignItems: 'center' },
            '& .MuiTab-root': {
              textTransform: 'none',
              minHeight: 48,
              fontWeight: 600,
              color: '#475569'
            },
            '& .Mui-selected': { color: '#4f46e5 !important' },
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: 2,
              backgroundColor: '#4f46e5'
            }
          }}
        >
          {items.map((it) => (
            <Tab key={it.key} icon={it.icon} iconPosition="start" label={it.label} aria-label={it.label} />
          ))}
        </Tabs>
      </Box>
    );
  };

  return (
    <Box sx={{ width: '100%', maxWidth: '375px', minHeight: '100vh', margin: '0 auto', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ flex: 1, overflow: 'auto', p: 3, backgroundColor: '#f8fafc' }}>
        {error && view !== 'home' && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
        )}

        {/* Home view: cards */}
        {view === 'home' && (
          <>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Card sx={{ borderRadius: 2 }}>
                  <CardActionArea onClick={() => {
                    setView('add');
                    onViewChange && onViewChange('add');
                  }} sx={{ p: 0 }}>
                    <CardContent sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar sx={{ bgcolor: '#4f46e5', width: 56, height: 56 }}>
                            <PersonAdd />
                          </Avatar>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>Add Users</Typography>
                            <Typography variant="body2" color="text.secondary">Create admins, teachers, or students</Typography>
                          </Box>
                        </Box>
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <Card sx={{ borderRadius: 2 }}>
                  <CardActionArea onClick={() => {
                    setView('manage');
                    onViewChange && onViewChange('manage');
                  }} sx={{ p: 0 }}>
                    <CardContent sx={{ p: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Avatar sx={{ bgcolor: '#059669', width: 56, height: 56 }}>
                            <ManageAccounts />
                          </Avatar>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>Manage Users</Typography>
                            <Typography variant="body2" color="text.secondary">Update teacher classroom access</Typography>
                          </Box>
                        </Box>
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            </Grid>
          </>
        )}

        {/* Manage header with tabs */}
        {view === 'manage' && (
          <>
            <Box sx={{ backgroundColor: 'white', borderRadius: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0', mb: 2 }}>
              <Tabs
                value={{ teachers: 0, admins: 1, students: 2 }[manageTab]}
                onChange={(e, idx) => setManageTab(idx === 0 ? 'teachers' : idx === 1 ? 'admins' : 'students')}
                variant="fullWidth"
                sx={{
                  minHeight: 48,
                  '& .MuiTab-root': { textTransform: 'none', minHeight: 48, fontWeight: 600 },
                  '& .MuiTabs-indicator': { height: 3, borderRadius: 2, backgroundColor: '#4f46e5' }
                }}
              >
                <Tab label="Teachers" />
                <Tab label="Admins" />
                <Tab label="Students" />
              </Tabs>
            </Box>
          </>
        )}

        {view === 'manage' && manageTab === 'teachers' && (
          <>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                placeholder="Search teachers by name or email"
                size="small"
                fullWidth
              />
            </Box>
            <Box sx={{ mb: 2 }}>
              <Button variant="contained" onClick={() => {
                setView('add');
                onViewChange && onViewChange('add');
              }}>Add Teacher</Button>
            </Box>

            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <CircularProgress size={24} />
              </Box>
            )}

            {!loading && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {teachers
                  .filter(t => {
                    const q = teacherSearch.trim().toLowerCase();
                    if (!q) return true;
                    const name = `${t.firstName || ''} ${t.lastName || ''}`.toLowerCase();
                    return name.includes(q) || (t.email || '').toLowerCase().includes(q);
                  })
                  .map(t => {
                    const assigned = getTeacherClassroomIds(t.id);
                    const inactive = (t.status && t.status !== 'active');
                    return (
                      <Box key={t.id} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, p: 1.5, backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{[t.firstName, t.lastName].filter(Boolean).join(' ') || (t.email || 'Teacher')}</Typography>
                            <Typography variant="caption" color="text.secondary">{t.email}</Typography>
                            {inactive && (
                              <Chip size="small" color="warning" variant="outlined" label="Inactive" sx={{ ml: 1 }} />
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Button size="small" variant="contained" onClick={() => openManage(t)} disabled={inactive}>Manage</Button>
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {assigned.length > 0 ? (
                            assigned.map(cid => {
                              const cls = classrooms.find(c => c.id === cid);
                              const label = cls ? (cls.name || cls.id) : cid;
                              return <Chip key={cid} size="small" label={label} />;
                            })
                          ) : (
                            <Typography variant="caption" color="text.secondary">No classrooms</Typography>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
              </Box>
            )}

            {/* Manage Access dialog */}
            <Dialog open={manageOpen} onClose={() => setManageOpen(false)}>
              <DialogTitle component="div">
                <Typography component="h2" variant="h6">Manage Classroom Access</Typography>
                {manageTeacher && (
                  <Typography variant="body2" color="text.secondary">{[manageTeacher.firstName, manageTeacher.lastName].filter(Boolean).join(' ') || manageTeacher.email}</Typography>
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
                <Button variant="contained" onClick={saveManage} disabled={manageSaving || (manageTeacher && manageTeacher.status && manageTeacher.status !== 'active')}>
                  {manageSaving ? 'Saving...' : 'Save'}
                </Button>
              </DialogActions>
            </Dialog>
          </>
        )}
        {view === 'manage' && manageTab === 'admins' && (
          <Alert severity="info">Manage Admins is a work in progress.</Alert>
        )}
        {view === 'manage' && manageTab === 'students' && (
          <Alert severity="info">Manage Students is a work in progress.</Alert>
        )}

        {view === 'add' && (
          <>
            <form onSubmit={handleSubmit}>
              <Grid container spacing={2}>
              <Grid item xs={12}>
                <RoleTabs value={role} onChange={setRole} />
              </Grid>

              {(role === 'admin' || role === 'teacher') && (
                <>
                  <Grid item xs={12}><Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>{role === 'admin' ? 'Admin Details' : 'Teacher Details'}</Typography></Grid>
                  <Grid item xs={12}>
                    <TextField label="Email" placeholder="name@pepschoolv2.com" fullWidth value={userForm.email} onChange={(e) => setUserForm(p => ({ ...p, email: e.target.value }))} error={!!validationErrors.email} helperText={validationErrors.email} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="First Name" fullWidth value={userForm.firstName} onChange={(e) => setUserForm(p => ({ ...p, firstName: e.target.value }))} error={!!validationErrors.firstName} helperText={validationErrors.firstName} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField label="Last Name (optional)" fullWidth value={userForm.lastName} onChange={(e) => setUserForm(p => ({ ...p, lastName: e.target.value }))} />
                  </Grid>

                  {role === 'teacher' && (
                    <Grid item xs={12}>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle1" sx={{ mb: 1 }}>Assign Classrooms</Typography>
                      {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>
                      ) : (
                        <>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, backgroundColor: 'white', p: 2, borderRadius: 1, border: '1px solid #e2e8f0' }}>
                            {classrooms.map(c => (
                              <Chip key={c.id} label={`${c.name} (${c.studentCount} students)`} onClick={() => handleClassroomToggle(c.id)} color={selectedClassrooms.includes(c.id) ? 'primary' : 'default'} variant={selectedClassrooms.includes(c.id) ? 'filled' : 'outlined'} clickable size="small" />
                            ))}
                          </Box>
                          {validationErrors.classrooms && <Typography variant="caption" color="error">{validationErrors.classrooms}</Typography>}
                        </>
                      )}
                    </Grid>
                  )}
                </>
              )}

              {role === 'student' && (
                <>
                  <Grid item xs={12}><Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>Student Details</Typography></Grid>
                  <Grid item xs={12} sm={6}><TextField label="First Name" fullWidth value={studentForm.firstName} onChange={(e)=>setStudentForm(p=>({...p, firstName:e.target.value}))} error={!!validationErrors.stuFirstName} helperText={validationErrors.stuFirstName} /></Grid>
                  <Grid item xs={12} sm={6}><TextField label="Last Name (optional)" fullWidth value={studentForm.lastName} onChange={(e)=>setStudentForm(p=>({...p, lastName:e.target.value}))} /></Grid>
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Classroom</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {classrooms.map(c => (
                        <Chip key={c.id} label={`${c.name} (${c.studentCount} students)`} onClick={()=>setStudentForm(p=>({...p, classroomId:c.id}))} color={studentForm.classroomId===c.id?'primary':'default'} variant={studentForm.classroomId===c.id?'filled':'outlined'} clickable size="small" />
                      ))}
                    </Box>
                    {validationErrors.classroomId && <Typography variant="caption" color="error">{validationErrors.classroomId}</Typography>}
                  </Grid>
                  <Grid item xs={12}><TextField type="date" label="Date of Birth (optional)" InputLabelProps={{ shrink: true }} fullWidth value={studentForm.dob} onChange={(e)=>setStudentForm(p=>({...p, dob:e.target.value}))} /></Grid>
                  <Grid item xs={12}><Divider sx={{ my: 2 }} /><Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Guardian (optional)</Typography></Grid>
                  <Grid item xs={12} sm={4}><TextField label="Name" fullWidth value={studentForm.guardianName} onChange={(e)=>setStudentForm(p=>({...p, guardianName:e.target.value}))} error={!!validationErrors.guardian} /></Grid>
                  <Grid item xs={12} sm={4}><TextField label="Relationship" fullWidth value={studentForm.guardianRelationship} onChange={(e)=>setStudentForm(p=>({...p, guardianRelationship:e.target.value}))} error={!!validationErrors.guardian} /></Grid>
                  <Grid item xs={12} sm={4}><TextField label="Phone" fullWidth value={studentForm.guardianPhone} onChange={(e)=>setStudentForm(p=>({...p, guardianPhone:e.target.value}))} error={!!validationErrors.guardian} helperText={validationErrors.guardian} /></Grid>
                </>
              )}

              <Grid item xs={12} sx={{ mt: 2 }}>
                <Button type="submit" variant="contained" fullWidth size="large" disabled={submitting} startIcon={<PersonAdd />} sx={{ py: 1.5 }}>
                  {submitting ? 'Saving...' : (role === 'student' ? 'Create Student' : 'Create User Account')}
                </Button>
              </Grid>
            </Grid>
          </form>
          </>
        )}
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle component="div"><Typography component="h2" variant="h6">{confirmContent.title}</Typography></DialogTitle>
        <DialogContent><Typography variant="body2" sx={{ mt: 1 }}>{confirmContent.body}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => confirmContent.onConfirm && confirmContent.onConfirm()}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UsersAccessPage;
