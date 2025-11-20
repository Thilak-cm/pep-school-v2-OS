import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  TextField,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Stack
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Group,
  Search,
  Save,
  Close
} from '@mui/icons-material';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify';
import { normalizeClassroomId } from '../utils/lessonNoteConstraints';

const slugifyAliasName = (name = '') => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40);
  return slug ? `alias_${slug}` : '';
};

const getStudentDisplayName = (student) => {
  if (!student) return 'Unknown student';
  return (
    student.displayName ||
    student.preferredName ||
    student.name ||
    [student.firstName, student.lastName].filter(Boolean).join(' ') ||
    student.id
  );
};

function StudentAliasesPage({ currentUser, userRole }) {
  const notify = useNotify();
  const [classrooms, setClassrooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingAliasId, setEditingAliasId] = useState(null);
  const [aliasForm, setAliasForm] = useState({ name: '', description: '', studentIds: [] });
  const [formSearch, setFormSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const studentsById = useMemo(
    () => Object.fromEntries(students.map((stu) => [stu.id, stu])),
    [students]
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const classQuery =
          userRole === 'teacher'
            ? query(collection(db, 'classrooms'), where('teacherIds', 'array-contains', currentUser.uid))
            : query(collection(db, 'classrooms'), where('status', '==', 'active'));

        const classroomSnap = await getDocs(classQuery);
        const classList = classroomSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((cls) => (cls.status || 'active') !== 'archived');
        setClassrooms(classList);

        const studentsSnap = await getDocs(collection(db, 'students'));
        const normalizedStudents = studentsSnap.docs.map((docSnap) => {
          const data = docSnap.data();
          const classroomId = normalizeClassroomId(data.classroomId);
          return {
            id: docSnap.id,
            ...data,
            classroomId
          };
        });

        const allowedClassroomIds = new Set(classList.map((cls) => cls.id));
        const scopedStudents =
          userRole === 'teacher'
            ? normalizedStudents.filter((stu) => allowedClassroomIds.has(stu.classroomId))
            : normalizedStudents.filter(
                (stu) => !stu.classroomId || allowedClassroomIds.size === 0 || allowedClassroomIds.has(stu.classroomId)
              );

        scopedStudents.sort((a, b) => getStudentDisplayName(a).localeCompare(getStudentDisplayName(b)));
        setStudents(scopedStudents);

        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        const aliasMap = userSnap.exists() ? userSnap.data().studentAliases || {} : {};
        const aliasList = Object.values(aliasMap).map((alias) => ({
          ...alias,
          studentIds: Array.isArray(alias.studentIds) ? alias.studentIds : []
        }));
        aliasList.sort((a, b) => a.name.localeCompare(b.name));
        setAliases(aliasList);
      } catch (error) {
        console.error('Failed to load aliases', error);
        notify.error('Unable to load student groups.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUser?.uid, notify, userRole]);

  const startCreate = () => {
    setEditingAliasId(null);
    setAliasForm({ name: '', description: '', studentIds: [] });
    setFormSearch('');
    setFormOpen(true);
  };

  const startEdit = (alias) => {
    setEditingAliasId(alias.id);
    setAliasForm({
      name: alias.name || '',
      description: alias.description || '',
      studentIds: Array.isArray(alias.studentIds) ? alias.studentIds : []
    });
    setFormSearch('');
    setFormOpen(true);
  };

  const handleToggleStudent = (studentId) => {
    setAliasForm((prev) => {
      const exists = prev.studentIds.includes(studentId);
      return {
        ...prev,
        studentIds: exists ? prev.studentIds.filter((id) => id !== studentId) : [...prev.studentIds, studentId]
      };
    });
  };

  const handleSaveAlias = async () => {
    const trimmedName = aliasForm.name.trim();
    if (!trimmedName) {
      notify.warning('Name is required.');
      return;
    }
    if (aliasForm.studentIds.length === 0) {
      notify.warning('Select at least one student.');
      return;
    }
    const aliasId = editingAliasId || slugifyAliasName(trimmedName);
    if (!aliasId) {
      notify.error('Unable to generate alias id. Try a different name.');
      return;
    }
    const nameTaken =
      aliases.some((alias) => alias.id !== editingAliasId && alias.name.toLowerCase() === trimmedName.toLowerCase()) ||
      aliases.some((alias) => alias.id === aliasId && alias.id !== editingAliasId);
    if (nameTaken) {
      notify.warning('Name must be unique.');
      return;
    }

    try {
      setSaving(true);
      const userRef = doc(db, 'users', currentUser.uid);
      const existing = aliases.find((alias) => alias.id === aliasId);
      const payload = {
        id: aliasId,
        name: trimmedName,
        description: aliasForm.description.trim() || null,
        studentIds: aliasForm.studentIds,
        createdAt: existing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await updateDoc(userRef, {
        [`studentAliases.${aliasId}`]: payload
      });

      const nextAliases = aliases.filter((a) => a.id !== aliasId);
      const ordered = [...nextAliases, payload].sort((a, b) => a.name.localeCompare(b.name));
      setAliases(ordered);
      setEditingAliasId(null);
      setAliasForm({ name: '', description: '', studentIds: [] });
      setFormOpen(false);
      notify.success('Student group saved.');
    } catch (error) {
      console.error('Failed to save alias', error);
      notify.error('Unable to save student group.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSaving(true);
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        [`studentAliases.${deleteTarget.id}`]: deleteField()
      });
      setAliases((prev) => prev.filter((alias) => alias.id !== deleteTarget.id));
      setDeleteTarget(null);
      notify.success('Student group deleted.');
    } catch (error) {
      console.error('Failed to delete alias', error);
      notify.error('Unable to delete student group.');
    } finally {
      setSaving(false);
    }
  };

  const filteredFormStudents = useMemo(() => {
    const queryText = formSearch.trim().toLowerCase();
    if (!queryText) return students;
    return students.filter((stu) => getStudentDisplayName(stu).toLowerCase().includes(queryText));
  }, [formSearch, students]);

  if (loading) {
    return (
      <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Group sx={{ color: '#4f46e5' }} />
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Student Groups
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create shortcuts for frequent group or individual lesson notes.
              </Typography>
            </Box>
          </Box>
          <Button startIcon={<Add />} variant="contained" onClick={startCreate}>
            New Group
          </Button>
        </Box>
      </Paper>

      {aliases.map((alias) => {
        const memberNames = alias.studentIds
          .map((id) => studentsById[id])
          .filter(Boolean)
          .map((stu) => getStudentDisplayName(stu));
        return (
          <Paper key={alias.id} sx={{ p: 2, borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {alias.name}
                </Typography>
                {alias.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {alias.description}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                  {memberNames.length === 0 && (
                    <Chip label="No students in scope" size="small" />
                  )}
                  {memberNames.slice(0, 6).map((name) => (
                    <Chip key={name} label={name} size="small" />
                  ))}
                  {memberNames.length > 6 && (
                    <Chip label={`+${memberNames.length - 6} more`} size="small" />
                  )}
                </Stack>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <IconButton onClick={() => startEdit(alias)} aria-label="Edit group">
                  <Edit />
                </IconButton>
                <IconButton onClick={() => setDeleteTarget(alias)} color="error" aria-label="Delete group">
                  <Delete />
                </IconButton>
              </Box>
            </Box>
          </Paper>
        );
      })}

      {aliases.length === 0 && (
        <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>
            No groups yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create your first student group to speed up lesson note selection.
          </Typography>
          <Button startIcon={<Add />} variant="contained" onClick={startCreate}>
            Create Group
          </Button>
        </Paper>
      )}

      <Dialog
        open={formOpen}
        onClose={() => {
          setEditingAliasId(null);
          setAliasForm({ name: '', description: '', studentIds: [] });
          setFormSearch('');
          setFormOpen(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Group />
          {editingAliasId ? 'Edit Student Group' : 'New Student Group'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Group name"
              value={aliasForm.name}
              onChange={(e) => setAliasForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              autoFocus
            />
            <TextField
              label="Description (optional)"
              value={aliasForm.description}
              onChange={(e) => setAliasForm((prev) => ({ ...prev, description: e.target.value }))}
              multiline
              minRows={2}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Students ({aliasForm.studentIds.length})
              </Typography>
              <TextField
                fullWidth
                placeholder="Search students"
                value={formSearch}
                onChange={(e) => setFormSearch(e.target.value)}
                InputProps={{
                  startAdornment: <Search fontSize="small" sx={{ mr: 1, color: '#94a3b8' }} />
                }}
              />
              <Paper
                variant="outlined"
                sx={{
                  mt: 1.5,
                  maxHeight: 280,
                  overflowY: 'auto',
                  borderRadius: 2,
                  border: '1px solid #e2e8f0'
                }}
              >
                <List dense disablePadding>
                  {filteredFormStudents.map((student) => {
                    const selected = aliasForm.studentIds.includes(student.id);
                    const classroom = classrooms.find((cls) => cls.id === student.classroomId);
                    return (
                      <ListItem
                        key={student.id}
                        button
                        onClick={() => handleToggleStudent(student.id)}
                        sx={{ px: 1.5 }}
                      >
                        <Checkbox
                          edge="start"
                          tabIndex={-1}
                          disableRipple
                          checked={selected}
                          onChange={() => handleToggleStudent(student.id)}
                        />
                        <ListItemText
                          primary={getStudentDisplayName(student)}
                          secondary={classroom?.name || student.classroomId || 'Unassigned'}
                        />
                      </ListItem>
                    );
                  })}
                  {filteredFormStudents.length === 0 && (
                    <ListItem>
                      <ListItemText primary="No students match this search." />
                    </ListItem>
                  )}
                </List>
              </Paper>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button
            startIcon={<Close />}
            onClick={() => {
              setEditingAliasId(null);
              setAliasForm({ name: '', description: '', studentIds: [] });
              setFormSearch('');
              setFormOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button
            startIcon={<Save />}
            variant="contained"
            onClick={handleSaveAlias}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Group'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete student group?</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            This removes <strong>{deleteTarget?.name}</strong> from your profile. It will no longer appear in lesson note search.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" startIcon={<Delete />} onClick={confirmDelete} disabled={saving}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StudentAliasesPage;
