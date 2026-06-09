// BroadcastComposer.jsx — Superadmin broadcast composer + management screen (PEP-307)
import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Chip,
  Select, MenuItem, FormControl, InputLabel, CircularProgress,
  Alert as MuiAlert,
} from '@mui/material';
import { Megaphone, Trash2, Plus, Eye, CircleCheck } from '../icons';
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
};

// ── Label presets ───────────────────────────────────────────────────────────

const LABEL_PRESETS = ['FROM OFFICE', 'ANNOUNCEMENT', 'REMINDER', 'URGENT'];

// ── Component ───────────────────────────────────────────────────────────────

export default function BroadcastComposer({ currentUser, userRole }) {
  const [broadcasts, setBroadcasts] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const isSuperAdminUser = isSuperAdmin(userRole);

  // ── Load broadcasts + classrooms ──────────────────────────────────────

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
        // Non-critical — audience picker falls back to empty
      }

      setLoading(false);
    };
    load();
  }, [isSuperAdminUser, loadBroadcasts]);

  // ── Form helpers ──────────────────────────────────────────────────────

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setError(null);
  };

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

      const audienceSummary = form.targetClassrooms.length > 0
        ? form.targetClassrooms.map(id => {
            const c = classrooms.find(cl => cl.id === id);
            return c?.name || id;
          }).join(', ')
        : 'All staff';

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
      });

      setSuccess('Broadcast published');
      resetForm();
      setComposeOpen(false);
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

  return (
    <Box sx={{ px: 2, pb: 4, maxWidth: 600, mx: 'auto' }}>
      {/* ── Status messages ── */}
      {success && <MuiAlert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</MuiAlert>}
      {error && !composeOpen && <MuiAlert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</MuiAlert>}

      {/* ── New Broadcast button ── */}
      <Button
        variant="contained"
        startIcon={<Plus size={18} />}
        onClick={() => { resetForm(); setComposeOpen(true); }}
        fullWidth
        sx={{
          mb: 3, py: 1.5, borderRadius: 2, textTransform: 'none',
          fontWeight: 600, fontSize: '0.95rem',
          background: 'var(--color-primary)',
        }}
      >
        New Broadcast
      </Button>

      {/* ── Broadcast list ── */}
      {broadcasts.length === 0 ? (
        <Paper elevation={0} sx={{ p: 4, textAlign: 'center', borderRadius: 3, border: '1px solid var(--color-border)' }}>
          <Megaphone size={32} style={{ color: 'var(--color-text-faint)', marginBottom: 8 }} />
          <Typography variant="body2" sx={{ color: 'var(--color-text-faint)' }}>
            No broadcasts yet
          </Typography>
        </Paper>
      ) : (
        broadcasts.map(broadcast => {
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
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
        })
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

      {/* ── Compose dialog ── */}
      <Dialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Megaphone size={20} />
          New Broadcast
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {error && <MuiAlert severity="error" sx={{ borderRadius: 2 }}>{error}</MuiAlert>}

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
            label="Subtitle (optional — auto-generated if empty)"
            value={form.subtitle}
            onChange={(e) => updateField('subtitle', e.target.value)}
            placeholder="Auto: sender name · audience"
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
            placeholder="The detailed message teachers see when they tap 'Got it'..."
          />

          {/* Audience picker */}
          <FormControl size="small" fullWidth>
            <InputLabel>Audience (classrooms)</InputLabel>
            <Select
              multiple
              value={form.targetClassrooms}
              label="Audience (classrooms)"
              onChange={(e) => updateField('targetClassrooms', e.target.value)}
              renderValue={(selected) =>
                selected.length === 0
                  ? 'All staff'
                  : selected.map(id => classrooms.find(c => c.id === id)?.name || id).join(', ')
              }
            >
              {classrooms.map(c => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" sx={{ color: 'var(--color-text-faint)', mt: -1.5 }}>
            Leave empty to send to all staff
          </Typography>

          {/* Priority */}
          <FormControl size="small" fullWidth>
            <InputLabel>Priority</InputLabel>
            <Select
              value={form.priority}
              label="Priority"
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
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setComposeOpen(false)} sx={{ color: 'var(--color-text-faint)' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            {submitting ? <CircularProgress size={20} /> : 'Publish Broadcast'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
