import React, { useEffect, useState } from 'react';
import {
  Box, Typography, TextField, Button, Grid, Alert, CircularProgress, Chip, Divider, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { ArrowBack, PersonAdd, School } from '@mui/icons-material';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import useNotify from '../notifications/useNotify.js';
import { collection, getDocs, query, where, doc, runTransaction, Timestamp, serverTimestamp } from 'firebase/firestore';

const AddUserPage = ({ onBack, currentUser, userRole }) => {
  const notify = useNotify();

  // Role selection
  const [role, setRole] = useState('teacher'); // 'admin' | 'teacher' | 'student'

  // Admin/Teacher form
  const [userForm, setUserForm] = useState({ email: '', firstName: '', lastName: '' });
  const [selectedClassrooms, setSelectedClassrooms] = useState([]);

  // Student form
  const [studentForm, setStudentForm] = useState({
    firstName: '', lastName: '', classroomId: '', dob: '', guardianName: '', guardianRelationship: '', guardianPhone: ''
  });

  // Shared state
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [userLoading, setUserLoading] = useState(true);

  // Callables
  const createAuthUserAndProfile = httpsCallable(cloudFunctions, 'createAuthUserAndProfile');

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

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'classrooms'));
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
      list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      setClassrooms(list.map(c => ({ id: c.id, name: c.name || c.id, studentCount: c.studentCount || 0 })));
    } catch (e) {
      console.error('Fetch classrooms error', e);
      setError('Failed to fetch classrooms');
    } finally {
      setLoading(false);
    }
  };

  // Validation
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

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmContent, setConfirmContent] = useState({ title: '', body: '', onConfirm: null });
  const openConfirm = (title, body, onConfirm) => { setConfirmContent({ title, body, onConfirm }); setConfirmOpen(true); };

  // Student ID helpers
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
            }
          );
        } else if (data.ok) {
          notify.success('User created');
          setUserForm({ email: '', firstName: '', lastName: '' });
          setSelectedClassrooms([]);
          setSuccess(true);
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
          <Typography variant="body1" sx={{ mb: 3 }}>Only admins can add users.</Typography>
          <Button variant="contained" startIcon={<ArrowBack />} onClick={onBack} fullWidth>Back to Admin Panel</Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: '375px', minHeight: '100vh', margin: '0 auto', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 3, borderBottom: '1px solid #e2e8f0', backgroundColor: 'white', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={onBack} size="small"><ArrowBack /></IconButton>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Add User</Typography>
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3, backgroundColor: '#f8fafc' }}>
        {/* Success banner removed */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {['teacher', 'admin', 'student'].map(r => (
                  <Chip key={r} label={r.charAt(0).toUpperCase() + r.slice(1)} color={role === r ? 'primary' : 'default'} variant={role === r ? 'filled' : 'outlined'} clickable onClick={() => setRole(r)} />
                ))}
              </Box>
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
      </Box>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{confirmContent.title}</DialogTitle>
        <DialogContent><Typography variant="body2" sx={{ mt: 1 }}>{confirmContent.body}</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => confirmContent.onConfirm && confirmContent.onConfirm()}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AddUserPage;
