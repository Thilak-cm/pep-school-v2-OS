// BroadcastCompose.jsx — Compose modal for creating/editing broadcasts
// MUI Dialog modal. Single scrollable column. Pinned footer.

import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Dialog, Switch, FormControlLabel,
  TextField, CircularProgress, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { Timestamp } from 'firebase/firestore';
import { X, Send, ChevronRight, Users, Clock, Plus, Trash2 } from '../../icons';
import { createBroadcast, updateBroadcast } from '../../services/broadcastService';
import useNotify from '../../notifications/useNotify';
import BroadcastPreviewPill from './BroadcastPreviewPill';
import BroadcastAudiencePicker from './BroadcastAudiencePicker';
import BroadcastPriorityStack from './BroadcastPriorityStack';
import {
  getAudienceSummary, computeReach, getExpiryChips, toDatetimeLocal,
  PRIORITY_OPTIONS,
} from './broadcastUtils';

const INITIAL_FORM = {
  label: 'FROM OFFICE',
  title: '',
  subtitle: '',
  ctaLabel: 'Read More',
  message: '',
  priority: 3,
  dip: true,
  expiresAt: '',
  expiryChip: 'auto', // 'auto' | 'week-end' | 'one-week' | 'custom'
  startsAt: '',
  startsAtMode: 'immediately', // 'immediately' | 'custom'
  targetClassrooms: [],
  targetTeachers: [],
  // Poll fields (PEP-323a)
  pollEnabled: false,
  pollQuestion: '',
  pollOptions: [{ id: 'opt_1', label: '' }, { id: 'opt_2', label: '' }],
  pollMultiSelect: false,
  pollAllowOther: false,
};

// Unique option ID generator — uses timestamp to avoid collisions across sessions
const nextOptionId = () => `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// ── Soft input style (shared) ──────────────────────────────────────────────────

const softInputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '9px',
    backgroundColor: 'var(--color-surface, #f8fafc)',
    '& fieldset': { borderColor: 'var(--color-border, rgba(0,0,0,0.08))' },
  },
  '& .MuiOutlinedInput-root:hover fieldset': {
    borderColor: 'var(--color-text-faint)',
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function BroadcastCompose({
  open,
  onClose,
  editingBroadcast,
  broadcasts = [],
  classrooms = [],
  teachers = [],
  currentUser,
}) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [audiencePickerOpen, setAudiencePickerOpen] = useState(false);
  const [resetDismissConfirm, setResetDismissConfirm] = useState(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const notify = useNotify();

  const isEditing = !!editingBroadcast;
  const expiryChips = getExpiryChips();

  // ── Populate form for editing ──────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    if (editingBroadcast) {
      const p = editingBroadcast.payload || {};
      const poll = editingBroadcast.poll || null;
      setForm({
        label: p.label || 'FROM OFFICE',
        title: p.title || '',
        subtitle: p.subtitle || '',
        ctaLabel: p.ctaLabel,
        message: p.message || '',
        priority: editingBroadcast.priority ?? 3,
        dip: editingBroadcast.dip ?? true,
        expiresAt: toDatetimeLocal(editingBroadcast.expiresAt),
        expiryChip: editingBroadcast.expiresAt ? 'custom' : 'auto',
        startsAt: toDatetimeLocal(editingBroadcast.startsAt),
        startsAtMode: editingBroadcast.startsAt ? 'custom' : 'immediately',
        targetClassrooms: editingBroadcast.targetClassrooms || [],
        targetTeachers: editingBroadcast.targetTeachers || [],
        pollEnabled: editingBroadcast.broadcastKind === 'poll',
        pollQuestion: poll?.question || '',
        pollOptions: poll?.options?.length ? poll.options : [{ id: 'opt_1', label: '' }, { id: 'opt_2', label: '' }],
        pollMultiSelect: poll?.multiSelect || false,
        pollAllowOther: poll?.allowOther || false,
      });
    } else {
      setForm(INITIAL_FORM);
    }
    setResetDismissConfirm(null);
    setConfirmPublish(false);
  }, [open, editingBroadcast]);

  // ── Form helpers ───────────────────────────────────────────────────────

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const senderName = currentUser?.displayName || currentUser?.name
    || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ')
    || 'Admin';

  const audienceSummary = getAudienceSummary(form.targetClassrooms, form.targetTeachers, classrooms);
  const reach = computeReach(form.targetClassrooms, form.targetTeachers, teachers, classrooms);

  // ── Expiry chip handler ────────────────────────────────────────────────

  const handleExpiryChip = (chipKey, chipValue) => {
    if (chipKey === 'custom') {
      updateField('expiryChip', 'custom');
      // Don't clear expiresAt — let user pick
    } else {
      updateField('expiryChip', chipKey);
      updateField('expiresAt', toDatetimeLocal(chipValue));
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────

  const doSubmit = async (resetDismissals = false) => {
    setSubmitting(true);
    try {
      const isPoll = form.pollEnabled;
      const broadcastFields = {
        label: form.label,
        title: form.title,
        subtitle: form.subtitle || `${senderName} · ${audienceSummary}`,
        ctaLabel: isPoll ? 'Respond' : form.ctaLabel,
        message: form.message,
        senderName,
        audience: audienceSummary,
        priority: form.priority,
        dip: form.dip,
        broadcastKind: isPoll ? 'poll' : 'ack',
        ...(isPoll && {
          poll: {
            question: form.pollQuestion,
            options: form.pollOptions.filter(o => o.label.trim()),
            multiSelect: form.pollMultiSelect,
            allowOther: form.pollAllowOther,
          },
        }),
        expiresAt: form.expiryChip === 'auto' ? null : Timestamp.fromDate(new Date(form.expiresAt)),
        startsAt: form.startsAtMode === 'custom' && form.startsAt
          ? Timestamp.fromDate(new Date(form.startsAt))
          : null,
        reach,
        targetClassrooms: form.targetClassrooms,
        targetTeachers: form.targetTeachers,
      };

      if (isEditing) {
        if (resetDismissals) broadcastFields.resetDismissals = true;
        await updateBroadcast(editingBroadcast.id, broadcastFields);
        notify.success('Broadcast updated');
      } else {
        await createBroadcast(broadcastFields);
        notify.success(form.startsAtMode === 'custom' ? 'Broadcast scheduled' : 'Broadcast published');
      }

      setResetDismissConfirm(null);
      setConfirmPublish(false);
      onClose(true); // true = did save
    } catch (err) {
      notify.error(err.message || 'Failed to save broadcast');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = () => {
    // Validate required fields with specific toasts
    if (!form.title.trim()) { notify.warning('Add a title for the broadcast'); return; }
    if (!form.message.trim()) { notify.warning('Add a message body — teachers see this after tapping'); return; }
    if (form.expiryChip !== 'auto' && !form.expiresAt) { notify.warning('Pick an expiry date — broadcasts must have an end time'); return; }
    if (form.expiryChip === 'auto' && reach === 0) { notify.warning('Select an audience — auto-expiry needs at least one teacher'); return; }
    if (form.pollEnabled) {
      if (!form.pollQuestion.trim()) { notify.warning('Add a poll question'); return; }
      const filledOptions = form.pollOptions.filter(o => o.label.trim());
      if (filledOptions.length < 2) { notify.warning('Add at least 2 poll options'); return; }
    }

    // Check for existing acks when editing
    if (isEditing) {
      const dismissCount = editingBroadcast.dismissedBy
        ? Object.keys(editingBroadcast.dismissedBy).length : 0;
      if (dismissCount > 0) {
        setResetDismissConfirm({ dismissCount });
        return;
      }
    }

    // Confirm dialog for High priority + All staff
    if (form.priority <= 2 && form.targetClassrooms.length === 0 && form.targetTeachers.length === 0) {
      setConfirmPublish(true);
      return;
    }

    doSubmit();
  };

  // ── Footer button text ─────────────────────────────────────────────────

  const footerText = (() => {
    if (isEditing) return 'Save changes';
    if (form.startsAtMode === 'custom' && form.startsAt) {
      const d = new Date(form.startsAt);
      const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
      const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `Schedule for ${dayName} ${time}`;
    }
    return `Publish to ${reach} people`;
  })();

  if (!open) return null;

  return (
    <>
      <Dialog
        open={open}
        onClose={() => onClose(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 3, mx: 2,
            maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            backgroundColor: 'var(--color-bg, #fff)',
          },
        }}
      >
        {/* ── Header ── */}
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2, pt: 2, pb: 1, flexShrink: 0,
        }}>
          <Box onClick={() => onClose(false)} sx={{ cursor: 'pointer', color: 'var(--color-text-soft)', display: 'flex' }}>
            <X size={22} />
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>
            {isEditing ? 'Edit broadcast' : 'New broadcast'}
          </Typography>
          <Box sx={{ width: 22 }} />
        </Box>

        {/* ── Scrollable body ── */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 2 }}>
          {/* Live preview */}
          <BroadcastPreviewPill
            form={form}
            senderName={senderName}
            audienceSummary={audienceSummary}
            onUpdateField={updateField}
          />

          {/* ── MESSAGE card ── */}
          <GroupCard label="MESSAGE">
            <TextField
              size="small" fullWidth
              placeholder="Title"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              sx={{ ...softInputSx, mb: 1 }}
            />
            <TextField
              size="small" fullWidth multiline rows={3}
              placeholder="Details teachers read after tapping..."
              value={form.message}
              onChange={(e) => updateField('message', e.target.value)}
              sx={softInputSx}
            />
          </GroupCard>

          {/* ── POLL card (PEP-323a) ── */}
          <GroupCard label="POLL">
            <FormControlLabel
              control={
                <Switch
                  checked={form.pollEnabled}
                  onChange={(e) => updateField('pollEnabled', e.target.checked)}
                  color="primary"
                  size="small"
                />
              }
              label={
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Attach a poll
                </Typography>
              }
              sx={{ mx: 0, mb: form.pollEnabled ? 1.5 : 0 }}
            />
            {form.pollEnabled && (
              <>
                <TextField
                  size="small" fullWidth
                  placeholder="Poll question"
                  value={form.pollQuestion}
                  onChange={(e) => updateField('pollQuestion', e.target.value)}
                  sx={{ ...softInputSx, mb: 1.5 }}
                />

                {/* Options */}
                {form.pollOptions.map((opt, i) => (
                  <Box key={opt.id} sx={{ display: 'flex', gap: 0.75, mb: 0.75, alignItems: 'center' }}>
                    <TextField
                      size="small" fullWidth
                      placeholder={`Option ${i + 1}`}
                      value={opt.label}
                      onChange={(e) => {
                        const updated = form.pollOptions.map(o =>
                          o.id === opt.id ? { ...o, label: e.target.value } : o
                        );
                        updateField('pollOptions', updated);
                      }}
                      sx={softInputSx}
                    />
                    {form.pollOptions.length > 2 && (
                      <Box
                        onClick={() => updateField('pollOptions', form.pollOptions.filter(o => o.id !== opt.id))}
                        sx={{ cursor: 'pointer', color: 'var(--color-text-faint)', flexShrink: 0, p: 0.5,
                          '&:hover': { color: 'var(--color-error)' } }}
                      >
                        <Trash2 size={16} />
                      </Box>
                    )}
                  </Box>
                ))}

                {/* Add option */}
                <Box
                  onClick={() => {
                    const id = nextOptionId();
                    updateField('pollOptions', [...form.pollOptions, { id, label: '' }]);
                  }}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.5,
                    cursor: 'pointer', color: 'var(--color-primary)',
                    fontSize: '0.8rem', fontWeight: 600, mt: 0.5, mb: 1.5,
                    '&:hover': { opacity: 0.8 },
                  }}
                >
                  <Plus size={14} />
                  Add option
                </Box>

                {/* Multi-select & Other toggles */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.pollMultiSelect}
                        onChange={(e) => updateField('pollMultiSelect', e.target.checked)}
                        color="primary" size="small"
                      />
                    }
                    label={
                      <Typography sx={{ fontSize: '0.8rem' }}>
                        Allow multiple selections
                      </Typography>
                    }
                    sx={{ mx: 0 }}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.pollAllowOther}
                        onChange={(e) => updateField('pollAllowOther', e.target.checked)}
                        color="primary" size="small"
                      />
                    }
                    label={
                      <Typography sx={{ fontSize: '0.8rem' }}>
                        Include &ldquo;Other&rdquo; free-text option
                      </Typography>
                    }
                    sx={{ mx: 0 }}
                  />
                </Box>
              </>
            )}
          </GroupCard>

          {/* ── AUDIENCE card ── */}
          <GroupCard label="AUDIENCE">
            <Box
              onClick={() => setAudiencePickerOpen(true)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 1.5, py: 1.25, borderRadius: '9px',
                backgroundColor: 'var(--color-surface, #f8fafc)',
                border: '1px solid var(--color-border, rgba(0,0,0,0.08))',
                cursor: 'pointer',
                '&:active': { opacity: 0.85 },
              }}
            >
              <Box sx={{
                width: 32, height: 32, borderRadius: '8px',
                backgroundColor: 'var(--color-indigo-bg, rgba(79,70,229,0.08))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Users size={16} style={{ color: 'var(--color-primary)' }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  {audienceSummary}
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: 'var(--color-text-faint)' }}>
                  {reach} people · tap to change
                </Typography>
              </Box>
              <ChevronRight size={18} style={{ color: 'var(--color-text-faint)', flexShrink: 0 }} />
            </Box>
          </GroupCard>

          {/* ── DELIVERY card ── */}
          <GroupCard label="DELIVERY">
            {/* Priority segmented control */}
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-soft)', mb: 0.5 }}>
              Priority
            </Typography>
            <Box sx={{
              display: 'flex',
              backgroundColor: 'var(--color-surface, #f1f3f7)',
              borderRadius: '8px', p: '2px', mb: 1.5,
            }}>
              {PRIORITY_OPTIONS.map(opt => {
                const isActive = form.priority === opt.value;
                return (
                  <Box
                    key={opt.value}
                    onClick={() => updateField('priority', opt.value)}
                    sx={{
                      flex: 1, textAlign: 'center', py: 0.6,
                      borderRadius: '6px', cursor: 'pointer',
                      fontSize: '0.8rem', fontWeight: 600,
                      transition: 'all 0.2s ease',
                      ...(isActive
                        ? { backgroundColor: '#fff', color: 'var(--color-text)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                        : { color: 'var(--color-text-faint)' }),
                    }}
                  >
                    {opt.label}
                  </Box>
                );
              })}
            </Box>

            {/* Priority stack visualization */}
            <BroadcastPriorityStack broadcasts={broadcasts} currentPriority={form.priority} />

            {/* Goes live */}
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-soft)', mb: 0.5, mt: 2 }}>
              Goes live
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, mb: form.startsAtMode === 'custom' ? 1 : 0 }}>
              {[
                { key: 'immediately', label: 'Immediately' },
                { key: 'custom', label: 'Custom' },
              ].map(chip => {
                const isActive = form.startsAtMode === chip.key;
                return (
                  <Box
                    key={chip.key}
                    onClick={() => updateField('startsAtMode', chip.key)}
                    sx={{
                      display: 'inline-flex', alignItems: 'center', gap: 0.5,
                      px: 1.5, py: 0.6, borderRadius: '8px', cursor: 'pointer',
                      fontSize: '0.78rem', fontWeight: 600,
                      border: '1px solid',
                      transition: 'all 0.15s ease',
                      ...(isActive
                        ? { borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-indigo-bg, rgba(79,70,229,0.06))', color: 'var(--color-primary)' }
                        : { borderColor: 'var(--color-border)', backgroundColor: 'transparent', color: 'var(--color-text-faint)' }),
                    }}
                  >
                    {chip.key === 'custom' && <Clock size={13} />}
                    {chip.label}
                  </Box>
                );
              })}
            </Box>
            {form.startsAtMode === 'custom' && (
              <TextField
                size="small" type="datetime-local" fullWidth
                value={form.startsAt}
                onChange={(e) => updateField('startsAt', e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ ...softInputSx, mb: 0.5 }}
              />
            )}

            {/* Expires */}
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-soft)', mb: 0.5, mt: 2 }}>
              Expires
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: form.expiryChip === 'custom' ? 1 : 0 }}>
              {/* Auto-expire chip (default) */}
              <Box
                onClick={() => { updateField('expiryChip', 'auto'); updateField('expiresAt', ''); }}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5,
                  px: 1.5, py: 0.6, borderRadius: '8px',
                  cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                  border: '1px solid',
                  transition: 'all 0.15s ease',
                  ...(form.expiryChip === 'auto'
                    ? { borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-indigo-bg, rgba(79,70,229,0.06))', color: 'var(--color-primary)' }
                    : { borderColor: 'var(--color-border)', backgroundColor: 'transparent', color: 'var(--color-text-faint)' }),
                }}
              >
                When all respond
              </Box>
              {expiryChips.map((chip, i) => {
                const chipKey = i === 0 ? 'week-end' : 'one-week';
                const isActive = form.expiryChip === chipKey;
                return (
                  <Box
                    key={chipKey}
                    onClick={() => handleExpiryChip(chipKey, chip.value)}
                    sx={{
                      display: 'inline-flex', px: 1.5, py: 0.6, borderRadius: '8px',
                      cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                      border: '1px solid',
                      transition: 'all 0.15s ease',
                      ...(isActive
                        ? { borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-indigo-bg, rgba(79,70,229,0.06))', color: 'var(--color-primary)' }
                        : { borderColor: 'var(--color-border)', backgroundColor: 'transparent', color: 'var(--color-text-faint)' }),
                    }}
                  >
                    {chip.label}
                  </Box>
                );
              })}
              <Box
                onClick={() => handleExpiryChip('custom')}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.5,
                  px: 1.5, py: 0.6, borderRadius: '8px',
                  cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                  border: '1px solid',
                  transition: 'all 0.15s ease',
                  ...(form.expiryChip === 'custom'
                    ? { borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-indigo-bg, rgba(79,70,229,0.06))', color: 'var(--color-primary)' }
                    : { borderColor: 'var(--color-border)', backgroundColor: 'transparent', color: 'var(--color-text-faint)' }),
                }}
              >
                <Clock size={13} />
                Custom
              </Box>
            </Box>
            {form.expiryChip === 'custom' && (
              <TextField
                size="small" type="datetime-local" fullWidth
                value={form.expiresAt}
                onChange={(e) => updateField('expiresAt', e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={softInputSx}
              />
            )}

            {/* Show in Quick Alerts toggle */}
            <Box sx={{ mt: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.dip}
                    onChange={(e) => updateField('dip', e.target.checked)}
                    color="primary"
                    size="small"
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      Show in Quick Alerts
                    </Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: 'var(--color-text-faint)' }}>
                      When on, this appears in Quick Alerts on teachers' home screen
                    </Typography>
                  </Box>
                }
                sx={{ mx: 0, alignItems: 'flex-start' }}
              />
            </Box>
          </GroupCard>
        </Box>

        {/* ── Pinned footer ── */}
        <Box sx={{
          px: 2, py: 2, flexShrink: 0,
          borderTop: '1px solid var(--color-border)',
        }}>
          <Button
            variant="contained" fullWidth
            onClick={handlePublish}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={18} /> : <Send size={18} />}
            sx={{
              borderRadius: '11px', textTransform: 'none',
              fontWeight: 700, py: 1.25, fontSize: '0.95rem',
              boxShadow: 'none',
            }}
          >
            {footerText}
          </Button>
        </Box>
      </Dialog>

      {/* ── Audience picker ── */}
      <BroadcastAudiencePicker
        open={audiencePickerOpen}
        onClose={() => setAudiencePickerOpen(false)}
        classrooms={classrooms}
        teachers={teachers}
        initialClassrooms={form.targetClassrooms}
        initialTeachers={form.targetTeachers}
        onConfirm={(cls, tch) => {
          updateField('targetClassrooms', cls);
          updateField('targetTeachers', tch);
        }}
      />

      {/* ── Reset acknowledgments dialog ── */}
      <Dialog open={!!resetDismissConfirm} onClose={() => setResetDismissConfirm(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Reset Acknowledgments?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {resetDismissConfirm?.dismissCount} teacher{resetDismissConfirm?.dismissCount !== 1 ? 's have' : ' has'} already acknowledged this broadcast. What would you like to do?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexDirection: 'column', gap: 1 }}>
          <Button
            variant="contained" fullWidth
            onClick={() => doSubmit(true)}
            disabled={submitting}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Reset & show updated broadcast
          </Button>
          <Button
            variant="outlined" fullWidth
            onClick={() => doSubmit(false)}
            disabled={submitting}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            Keep existing acknowledgments
          </Button>
          <Button
            onClick={() => setResetDismissConfirm(null)}
            sx={{ color: 'var(--color-text-faint)', textTransform: 'none' }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── High-priority confirm dialog ── */}
      <Dialog open={confirmPublish} onClose={() => setConfirmPublish(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Publish High Priority?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This broadcast will be sent as <strong>High priority</strong> to <strong>all staff ({reach} people)</strong>. It will appear at the top of Quick Alerts.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmPublish(false)} sx={{ color: 'var(--color-text-faint)' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => { setConfirmPublish(false); doSubmit(); }}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Publish
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ── GroupCard helper ──────────────────────────────────────────────────────────

function GroupCard({ label, children }) {
  return (
    <Box sx={{
      mb: 1.5, p: 1.75, borderRadius: 3,
      border: '1px solid var(--color-border)',
      backgroundColor: '#fff',
    }}>
      <Typography sx={{
        fontSize: '0.6rem', fontWeight: 700, letterSpacing: 1.5,
        textTransform: 'uppercase', color: 'var(--color-text-faint)',
        mb: 1,
      }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}
