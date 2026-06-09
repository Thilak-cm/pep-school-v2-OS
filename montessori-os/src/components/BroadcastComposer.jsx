// BroadcastComposer.jsx — Superadmin broadcast composer + management screen (PEP-307)
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Chip,
  Select, MenuItem, FormControl, InputLabel, CircularProgress,
  Alert as MuiAlert, Checkbox, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Divider,
} from '@mui/material';
import { Megaphone, Trash2, Eye, CircleCheck, Search, Send } from '../icons';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  createBroadcast, listBroadcasts, deleteBroadcast, toggleBroadcastDip,
  BROADCAST_PRIORITIES,
} from '../services/broadcastService';
import { isSuperAdmin } from '../utils/roleUtils';

// ── Default form state ──────────────────────────────────────────────────────

const INITIAL_FORM = {
  label: 'FROM OFFICE',
  title: '',
  subtitle: '',
  ctaLabel: 'Got it',
  message: '',
  priority: 3,
  dip: true,
  expiresAt: '',
  targetClassrooms: [],
  targetTeachers: [],
};

// ── Label presets ───────────────────────────────────────────────────────────

const LABEL_PRESETS = ['FROM OFFICE', 'ANNOUNCEMENT', 'REMINDER', 'URGENT'];

// ── Helper: display name for a teacher ──────────────────────────────────────

function teacherDisplayName(t) {
  const name = [t.firstName, t.lastName].filter(Boolean).join(' ');
  return name || t.email || t.id;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function BroadcastComposer({ currentUser, userRole }) {
  const [broadcasts, setBroadcasts] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Audience picker modals
  const [classroomPickerOpen, setClassroomPickerOpen] = useState(false);
  const [teacherPickerOpen, setTeacherPickerOpen] = useState(false);
  const [pendingClassrooms, setPendingClassrooms] = useState([]);
  const [pendingTeachers, setPendingTeachers] = useState([]);
  const [teacherSearch, setTeacherSearch] = useState('');

  const isSuperAdminUser = isSuperAdmin(userRole);

  // ── Load broadcasts + classrooms + teachers ──────────────────────────

  const loadBroadcasts = useCallback(async () => {
    try {
      const list = await listBroadcasts();
      setBroadcasts(list);
    } catch {
      setError('Failed to load broadcasts');
    }
  }, []);

  useEffect(() => {
    if (!isSuperAdminUser) return;

    const load = async () => {
      setLoading(true);
      await loadBroadcasts();

      // Load classrooms for audience picker
      try {
        const snap = await getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active')));
        setClassrooms(snap.docs.map(d => ({ id: d.id, name: d.data().name || d.id })));
      } catch {
        // Non-critical
      }

      // Load teachers for teacher picker
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
        list.sort((a, b) => teacherDisplayName(a).localeCompare(teacherDisplayName(b)));
        setTeachers(list);
      } catch {
        // Non-critical
      }

      setLoading(false);
    };
    load();
  }, [isSuperAdminUser, loadBroadcasts]);

  // ── Filtered teachers for search ──────────────────────────────────────

  const filteredTeachers = useMemo(() => {
    if (!teacherSearch.trim()) return teachers;
    const q = teacherSearch.toLowerCase();
    return teachers.filter(t =>
      teacherDisplayName(t).toLowerCase().includes(q) ||
      (t.email || '').toLowerCase().includes(q)
    );
  }, [teachers, teacherSearch]);

  // ── Form helpers ──────────────────────────────────────────────────────

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setError(null);
  };

  // ── Audience summary ──────────────────────────────────────────────────

  const getAudienceSummary = useCallback(() => {
    const parts = [];
    if (form.targetClassrooms.length > 0) {
      parts.push(form.targetClassrooms.map(id => {
        const c = classrooms.find(cl => cl.id === id);
        return c?.name || id;
      }).join(', '));
    }
    if (form.targetTeachers.length > 0) {
      parts.push(`${form.targetTeachers.length} teacher${form.targetTeachers.length > 1 ? 's' : ''}`);
    }
    return parts.length > 0 ? parts.join(' + ') : 'All staff';
  }, [form.targetClassrooms, form.targetTeachers, classrooms]);

  // ── Submit broadcast ──────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.label || !form.title || !form.message || !form.expiresAt) {
      setError('Label, title, message, and expiry are required');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const senderName = currentUser?.displayName || currentUser?.name
        || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ')
        || 'Admin';

      const audienceSummary = getAudienceSummary();

      await createBroadcast({
        label: form.label,
        title: form.title,
        subtitle: form.subtitle || `${senderName} · ${audienceSummary}`,
        ctaLabel: form.ctaLabel || 'Got it',
        message: form.message,
        senderName,
        audience: audienceSummary,
        priority: form.priority,
        dip: form.dip,
        expiresAt: Timestamp.fromDate(new Date(form.expiresAt)),
        targetClassrooms: form.targetClassrooms,
        targetTeachers: form.targetTeachers,
      });

      setSuccess('Broadcast published');
      resetForm();
      await loadBroadcasts();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message || 'Failed to publish broadcast');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete broadcast ──────────────────────────────────────────────────

  const handleDelete = async (alertId) => {
    try {
      await deleteBroadcast(alertId);
      setDeleteConfirm(null);
      await loadBroadcasts();
    } catch {
      setError('Failed to delete broadcast');
    }
  };

  // ── Toggle DIP ────────────────────────────────────────────────────────

  const handleToggleDip = async (alertId, currentDip) => {
    try {
      await toggleBroadcastDip(alertId, !currentDip);
      await loadBroadcasts();
    } catch {
      setError('Failed to update DIP visibility');
    }
  };

  // ── Classroom picker handlers ─────────────────────────────────────────

  const openClassroomPicker = () => {
    setPendingClassrooms([...form.targetClassrooms]);
    setClassroomPickerOpen(true);
  };

  const toggleClassroom = (id) => {
    setPendingClassrooms(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const confirmClassrooms = () => {
    updateField('targetClassrooms', pendingClassrooms);
    setClassroomPickerOpen(false);
  };

  // ── Teacher picker handlers ───────────────────────────────────────────

  const openTeacherPicker = () => {
    setPendingTeachers([...form.targetTeachers]);
    setTeacherSearch('');
    setTeacherPickerOpen(true);
  };

  const toggleTeacher = (id) => {
    setPendingTeachers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const confirmTeachers = () => {
    updateField('targetTeachers', pendingTeachers);
    setTeacherPickerOpen(false);
  };

  // ── Helpers ───────────────────────────────────────────────────────────

  const isExpired = (broadcast) => {
    if (!broadcast.expiresAt) return false;
    const exp = broadcast.expiresAt.toDate ? broadcast.expiresAt.toDate() : new Date(broadcast.expiresAt);
    return exp < new Date();
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ── Access guard ──────────────────────────────────────────────────────

  if (!isSuperAdminUser) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error">Superadmin access required</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  // ── Audience display chips ────────────────────────────────────────────

  const classroomChips = form.targetClassrooms.map(id => {
    const c = classrooms.find(cl => cl.id === id);
    return c?.name || id;
  });
  const teacherChips = form.targetTeachers.map(id => {
    const t = teachers.find(tc => tc.id === id);
    return t ? teacherDisplayName(t) : id;
  });

  return (
    <Box sx={{ px: 2, pb: 4, maxWidth: 600, mx: 'auto' }}>
      {/* ── Status messages ── */}
      {success && <MuiAlert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</MuiAlert>}
      {error && <MuiAlert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</MuiAlert>}

      {/* ── Compose form (inline) ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>

          {/* Label — preset picker or custom */}
          <FormControl size="small" fullWidth>
            <InputLabel>Label (DIP top line)</InputLabel>
            <Select
              value={LABEL_PRESETS.includes(form.label) ? form.label : '__custom__'}
              label="Label (DIP top line)"
              onChange={(e) => updateField('label', e.target.value === '__custom__' ? '' : e.target.value)}
            >
              {LABEL_PRESETS.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              <MenuItem value="__custom__">Custom...</MenuItem>
            </Select>
          </FormControl>
          {!LABEL_PRESETS.includes(form.label) && (
            <TextField
              size="small"
              label="Custom label"
              value={form.label}
              onChange={(e) => updateField('label', e.target.value.toUpperCase())}
              placeholder="e.g., NOTICE"
              fullWidth
            />
          )}

          {/* Title */}
          <TextField
            size="small"
            label="Title (DIP main line)"
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="e.g., Early dismissal · Friday 6th"
            required
            fullWidth
          />

          {/* Subtitle */}
          <TextField
            size="small"
            label="Subtitle (optional — defaults to sender + audience)"
            value={form.subtitle}
            onChange={(e) => updateField('subtitle', e.target.value)}
            placeholder="Leave empty to use sender name + audience"
            fullWidth
          />

          {/* CTA label */}
          <TextField
            size="small"
            label="CTA button text"
            value={form.ctaLabel}
            onChange={(e) => updateField('ctaLabel', e.target.value)}
            placeholder="Got it"
            fullWidth
          />

          {/* Message body */}
          <TextField
            size="small"
            label="Full message body (shown in confirmation modal)"
            value={form.message}
            onChange={(e) => updateField('message', e.target.value)}
            multiline
            rows={4}
            required
            fullWidth
            placeholder="The detailed message teachers see when they tap the CTA..."
          />

          {/* ── Audience: Classrooms ── */}
          <Box>
            <Button
              variant="outlined"
              size="small"
              onClick={openClassroomPicker}
              fullWidth
              sx={{ justifyContent: 'space-between', textTransform: 'none', borderColor: 'var(--color-border)', color: 'var(--color-text)', py: 1.2 }}
            >
              <span>Select Classrooms</span>
              <Chip size="small" label={form.targetClassrooms.length || 'All'} sx={{ height: 22, fontSize: '0.75rem' }} />
            </Button>
            {classroomChips.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {classroomChips.map(name => (
                  <Chip key={name} size="small" label={name} sx={{ height: 24, fontSize: '0.7rem' }} />
                ))}
              </Box>
            )}
          </Box>

          {/* ── Audience: Teachers ── */}
          <Box>
            <Button
              variant="outlined"
              size="small"
              onClick={openTeacherPicker}
              fullWidth
              sx={{ justifyContent: 'space-between', textTransform: 'none', borderColor: 'var(--color-border)', color: 'var(--color-text)', py: 1.2 }}
            >
              <span>Select Teachers</span>
              <Chip size="small" label={form.targetTeachers.length || 'All'} sx={{ height: 22, fontSize: '0.75rem' }} />
            </Button>
            {teacherChips.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {teacherChips.map(name => (
                  <Chip key={name} size="small" label={name} sx={{ height: 24, fontSize: '0.7rem' }} />
                ))}
              </Box>
            )}
          </Box>

          <Typography variant="caption" sx={{ color: 'var(--color-text-faint)', mt: -1 }}>
            Leave both empty to send to all staff
          </Typography>

          {/* Priority */}
          <FormControl size="small" fullWidth>
            <InputLabel>Priority (decides order of DIP carousel)</InputLabel>
            <Select
              value={form.priority}
              label="Priority (decides order of DIP carousel)"
              onChange={(e) => updateField('priority', e.target.value)}
            >
              {BROADCAST_PRIORITIES.map(p => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Expiry */}
          <TextField
            size="small"
            label="Expires at"
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => updateField('expiresAt', e.target.value)}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {/* DIP toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={form.dip}
                onChange={(e) => updateField('dip', e.target.checked)}
                color="primary"
              />
            }
            label="Show in DIP carousel"
          />

          {/* Submit */}
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} /> : <Send size={18} />}
            fullWidth
            sx={{
              py: 1.5, borderRadius: 2, textTransform: 'none',
              fontWeight: 600, fontSize: '0.95rem',
            }}
          >
            Publish Broadcast
          </Button>
        </Box>

      {/* ── Published broadcasts list ── */}
      {broadcasts.length > 0 && (
        <>
          <Divider sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: 'var(--color-text-faint)', fontWeight: 600, letterSpacing: 0.5 }}>
              PUBLISHED BROADCASTS
            </Typography>
          </Divider>

          {broadcasts.map(broadcast => {
            const expired = isExpired(broadcast);
            const priorityInfo = BROADCAST_PRIORITIES.find(p => p.value === broadcast.priority);

            return (
              <Paper
                key={broadcast.id}
                elevation={0}
                sx={{
                  mb: 1.5, p: 2, borderRadius: 3,
                  border: '1px solid var(--color-border)',
                  opacity: expired ? 0.6 : 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--color-primary)', letterSpacing: 0.5 }}>
                        {broadcast.payload?.label || 'BROADCAST'}
                      </Typography>
                      <Chip
                        size="small"
                        label={expired ? 'Expired' : 'Live'}
                        sx={{
                          height: 20, fontSize: '0.65rem', fontWeight: 600,
                          backgroundColor: expired ? 'var(--color-error-light, #fde8e8)' : 'var(--color-success-light, #e6f9e6)',
                          color: expired ? 'var(--color-error)' : 'var(--color-success, #16a34a)',
                        }}
                      />
                      {broadcast.dip && (
                        <Chip size="small" label="DIP" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, backgroundColor: 'var(--color-indigo-bg)', color: 'var(--color-primary)' }} />
                      )}
                      {priorityInfo && (
                        <Chip size="small" label={priorityInfo.label} sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {broadcast.payload?.title || broadcast.payload?.message || ''}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'var(--color-text-faint)' }}>
                      {broadcast.payload?.audience || 'All staff'} · Expires {formatDate(broadcast.expiresAt)}
                    </Typography>
                    {broadcast.dismissedBy && Object.keys(broadcast.dismissedBy).length > 0 && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'var(--color-text-faint)', mt: 0.5 }}>
                        <CircleCheck size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        {Object.keys(broadcast.dismissedBy).length} acknowledged
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
                    <IconButton
                      size="small"
                      onClick={() => handleToggleDip(broadcast.id, broadcast.dip)}
                      title={broadcast.dip ? 'Remove from DIP' : 'Show in DIP'}
                      sx={{ color: broadcast.dip ? 'var(--color-primary)' : 'var(--color-text-faint)' }}
                    >
                      <Eye size={18} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => setDeleteConfirm(broadcast)}
                      title="Delete broadcast"
                      sx={{ color: 'var(--color-error)' }}
                    >
                      <Trash2 size={18} />
                    </IconButton>
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </>
      )}

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Broadcast?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently remove the broadcast "{deleteConfirm?.payload?.title}". This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirm(null)} sx={{ color: 'var(--color-text-faint)' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => handleDelete(deleteConfirm?.id)} sx={{ borderRadius: 2, textTransform: 'none' }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Classroom picker modal ── */}
      <Dialog
        open={classroomPickerOpen}
        onClose={() => setClassroomPickerOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Select Classrooms</DialogTitle>
        <DialogContent sx={{ px: 1, py: 0 }}>
          <List dense>
            {classrooms.map(c => (
              <ListItem key={c.id} disablePadding>
                <ListItemButton onClick={() => toggleClassroom(c.id)} dense>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox
                      edge="start"
                      checked={pendingClassrooms.includes(c.id)}
                      disableRipple
                      size="small"
                    />
                  </ListItemIcon>
                  <ListItemText primary={c.name} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setClassroomPickerOpen(false)} sx={{ color: 'var(--color-text-faint)' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmClassrooms} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
            Select ({pendingClassrooms.length})
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Teacher picker modal ── */}
      <Dialog
        open={teacherPickerOpen}
        onClose={() => setTeacherPickerOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Select Teachers</DialogTitle>
        <DialogContent sx={{ px: 1, py: 0 }}>
          {/* Search bar */}
          <Box sx={{ px: 1, pb: 1 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search teachers..."
              value={teacherSearch}
              onChange={(e) => setTeacherSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <Search size={16} style={{ marginRight: 8, color: 'var(--color-text-faint)' }} />,
                },
              }}
            />
          </Box>
          <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
            {filteredTeachers.map(t => (
              <ListItem key={t.id} disablePadding>
                <ListItemButton onClick={() => toggleTeacher(t.id)} dense>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox
                      edge="start"
                      checked={pendingTeachers.includes(t.id)}
                      disableRipple
                      size="small"
                    />
                  </ListItemIcon>
                  <ListItemText primary={teacherDisplayName(t)} />
                </ListItemButton>
              </ListItem>
            ))}
            {filteredTeachers.length === 0 && (
              <Typography variant="body2" sx={{ p: 2, textAlign: 'center', color: 'var(--color-text-faint)' }}>
                No teachers found
              </Typography>
            )}
          </List>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTeacherPickerOpen(false)} sx={{ color: 'var(--color-text-faint)' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmTeachers} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
            Select ({pendingTeachers.length})
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
