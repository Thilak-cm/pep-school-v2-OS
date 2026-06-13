// BroadcastDetail.jsx — Detail/receipts view for a broadcast
// Shows full content, ack progress, who read / who hasn't, and actions (edit/end/delete).

import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Button, Dialog, Paper,
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { Timestamp } from 'firebase/firestore';
import { X, Pencil, Trash2, CircleCheck, Clock } from '../../icons';
import { deleteBroadcast, updateBroadcast } from '../../services/broadcastService';
import useNotify from '../../notifications/useNotify';
import {
  relativeExpiry, labelColor, priorityLabel, priorityTint,
  getAudienceSummary, classifyBroadcast, userDisplayName,
} from './broadcastUtils';

export default function BroadcastDetail({
  open,
  broadcast,
  onClose,
  onEdit,
  onBroadcastChanged,
  teachers = [],
  classrooms = [],
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const notify = useNotify();

  // Build read / unread lists (hooks must be above early return)
  const { readList, unreadList } = useMemo(() => {
    if (!broadcast) return { readList: [], unreadList: [] };
    const dismissedBy = broadcast.dismissedBy || {};
    const dismissedUids = new Set(Object.keys(dismissedBy));

    // Resolve target audience
    let audienceUids;
    if ((broadcast.targetClassrooms?.length || 0) === 0 && (broadcast.targetTeachers?.length || 0) === 0) {
      // All staff
      audienceUids = teachers.map(t => t.id);
    } else {
      const uidSet = new Set();
      if (broadcast.targetClassrooms?.length > 0) {
        for (const c of classrooms) {
          if (broadcast.targetClassrooms.includes(c.id)) {
            (c.teacherIds || []).forEach(id => uidSet.add(id));
          }
        }
      }
      if (broadcast.targetTeachers?.length > 0) {
        broadcast.targetTeachers.forEach(id => uidSet.add(id));
      }
      audienceUids = Array.from(uidSet);
    }

    const teacherMap = {};
    for (const t of teachers) teacherMap[t.id] = t;

    const read = [];
    const unread = [];

    for (const uid of audienceUids) {
      const name = teacherMap[uid] ? userDisplayName(teacherMap[uid]) : uid;
      if (dismissedUids.has(uid)) {
        const ts = dismissedBy[uid];
        const time = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
        read.push({ uid, name, time });
      } else {
        unread.push({ uid, name });
      }
    }

    // Sort read by time (most recent first)
    read.sort((a, b) => (b.time || 0) - (a.time || 0));
    // Sort unread alphabetically
    unread.sort((a, b) => a.name.localeCompare(b.name));

    return { readList: read, unreadList: unread };
  }, [broadcast, teachers, classrooms]);

  if (!open || !broadcast) return null;

  const payload = broadcast.payload || {};
  const status = classifyBroadcast(broadcast);
  const ackCount = broadcast.dismissedBy ? Object.keys(broadcast.dismissedBy).length : 0;
  const reach = broadcast.reach || 0;
  const ackFraction = reach > 0 ? ackCount / reach : 0;
  const lColor = labelColor(payload.label);
  const pLabel = priorityLabel(broadcast.priority);
  const pTint = priorityTint(broadcast.priority);
  const audience = payload.audience
    || getAudienceSummary(broadcast.targetClassrooms, broadcast.targetTeachers, classrooms);

  // ── Actions ────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    try {
      await deleteBroadcast(broadcast.id);
      notify.success('Broadcast deleted');
      setDeleteConfirm(false);
      onClose();
      onBroadcastChanged?.();
    } catch {
      notify.error('Failed to delete broadcast');
    }
  };

  const handleEndBroadcast = async () => {
    try {
      await updateBroadcast(broadcast.id, {
        ...broadcastFieldsFromDoc(broadcast),
        expiresAt: Timestamp.fromDate(new Date()),
      });
      notify.success('Broadcast ended');
      setEndConfirm(false);
      onBroadcastChanged?.();
    } catch {
      notify.error('Failed to end broadcast');
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 3, mx: 2,
            maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
          },
        }}
      >
        {/* ── Header ── */}
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2, pt: 2, pb: 1, flexShrink: 0,
        }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem', flex: 1 }}>
            Broadcast Details
          </Typography>
          <Box onClick={onClose} sx={{ cursor: 'pointer', color: 'var(--color-text-soft)', display: 'flex' }}>
            <X size={20} />
          </Box>
        </Box>

        {/* ── Body ── */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 2 }}>
          {/* Info card */}
          <Paper elevation={0} sx={{
            p: 2, borderRadius: 3, mb: 2,
            border: '1px solid var(--color-border)',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, flexWrap: 'wrap' }}>
              <Typography sx={{
                fontSize: '0.6rem', fontWeight: 800, letterSpacing: 1.2,
                textTransform: 'uppercase', color: lColor,
              }}>
                {payload.label || 'BROADCAST'}
              </Typography>
              <Box sx={{
                display: 'inline-flex', px: 1, py: 0.15, borderRadius: '6px',
                backgroundColor: pTint.bg, color: pTint.color,
                fontSize: '0.6rem', fontWeight: 700,
              }}>
                {pLabel}
              </Box>
              <Box sx={{
                display: 'inline-flex', px: 1, py: 0.15, borderRadius: '6px',
                fontSize: '0.6rem', fontWeight: 600,
                backgroundColor: status === 'live' ? 'var(--color-success-light, #e6f9e6)' : 'var(--color-surface)',
                color: status === 'live' ? 'var(--color-success, #16a34a)' : 'var(--color-text-faint)',
              }}>
                {status === 'live' ? 'Live' : status === 'scheduled' ? 'Scheduled' : 'Done'}
              </Box>
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: '0.65rem', color: 'var(--color-text-faint)' }}>
                {relativeExpiry(broadcast.expiresAt)}
              </Typography>
            </Box>

            <Typography variant="body1" sx={{ fontWeight: 700, mb: 0.5 }}>
              {payload.title || ''}
            </Typography>

            {payload.message && (
              <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mb: 1, whiteSpace: 'pre-wrap' }}>
                {payload.message}
              </Typography>
            )}

            <Typography variant="caption" sx={{ color: 'var(--color-text-faint)' }}>
              {audience} · {reach} people · {broadcast.dip ? 'In Quick Alerts' : 'Not in Quick Alerts'}
            </Typography>
          </Paper>

          {/* Ack progress */}
          <Paper elevation={0} sx={{
            p: 2, borderRadius: 3, mb: 2,
            border: '1px solid var(--color-border)',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>
                Acknowledgments
              </Typography>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                {ackCount}/{reach} read
              </Typography>
            </Box>

            {/* Progress bar */}
            {reach > 0 && (
              <Box sx={{
                height: 8, borderRadius: '4px',
                backgroundColor: 'var(--color-surface, #eef0f4)',
                overflow: 'hidden', mb: 2,
              }}>
                <Box sx={{
                  width: `${Math.min(ackFraction * 100, 100)}%`,
                  height: '100%', borderRadius: '4px',
                  backgroundColor: ackFraction >= 1 ? 'var(--color-success, #16a34a)' : 'var(--color-primary)',
                  transition: 'width 0.3s ease',
                }} />
              </Box>
            )}

            {/* Read list */}
            {readList.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{
                  fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1.2,
                  textTransform: 'uppercase', color: 'var(--color-success, #16a34a)', mb: 0.75,
                }}>
                  READ · {readList.length}
                </Typography>
                {readList.map(({ uid, name, time }) => (
                  <Box key={uid} sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    py: 0.5, px: 0.5,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <CircleCheck size={14} style={{ color: 'var(--color-success, #16a34a)' }} />
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 500 }}>
                        {name}
                      </Typography>
                    </Box>
                    {time && (
                      <Typography sx={{ fontSize: '0.65rem', color: 'var(--color-text-faint)' }}>
                        {time.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{' '}
                        {time.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            )}

            {/* Unread list */}
            {unreadList.length > 0 && (
              <Box>
                <Typography sx={{
                  fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1.2,
                  textTransform: 'uppercase', color: 'var(--color-text-faint)', mb: 0.75,
                }}>
                  NOT YET READ · {unreadList.length}
                </Typography>
                {unreadList.map(({ uid, name }) => (
                  <Box key={uid} sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75,
                    py: 0.5, px: 0.5,
                  }}>
                    <Clock size={14} style={{ color: 'var(--color-text-faint)' }} />
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--color-text-soft)' }}>
                      {name}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            {readList.length === 0 && unreadList.length === 0 && reach === 0 && (
              <Typography sx={{ fontSize: '0.82rem', color: 'var(--color-text-faint)', textAlign: 'center', py: 2 }}>
                Audience reach not recorded for this broadcast
              </Typography>
            )}
          </Paper>

        </Box>

        {/* ── Pinned footer — actions ── */}
        <Box sx={{
          display: 'flex', gap: 1, px: 2, py: 1.5,
          borderTop: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          {status !== 'done' && (
            <Button
              variant="outlined"
              startIcon={<Pencil size={16} />}
              onClick={() => onEdit(broadcast)}
              fullWidth
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, borderColor: 'var(--color-border)', color: 'var(--color-text-soft)' }}
            >
              Edit
            </Button>
          )}
          {status === 'live' && (
            <Button
              variant="outlined"
              onClick={() => setEndConfirm(true)}
              fullWidth
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, borderColor: 'var(--color-border)', color: 'var(--color-warning, #f59e0b)' }}
            >
              End
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<Trash2 size={16} />}
            onClick={() => setDeleteConfirm(true)}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, borderColor: 'var(--color-border)', color: 'var(--color-error)', minWidth: 'auto', px: 2 }}
          >
            Delete
          </Button>
        </Box>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Broadcast?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently remove "{payload.title}". This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirm(false)} sx={{ color: 'var(--color-text-faint)' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} sx={{ borderRadius: 2, textTransform: 'none' }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* End broadcast confirmation */}
      <Dialog open={endConfirm} onClose={() => setEndConfirm(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>End Broadcast?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will expire the broadcast immediately. Teachers who haven't acknowledged it yet won't see it anymore.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEndConfirm(false)} sx={{ color: 'var(--color-text-faint)' }}>Cancel</Button>
          <Button variant="contained" onClick={handleEndBroadcast} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
            End now
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ── Helper: extract broadcast fields from a doc for update calls ─────────────

function broadcastFieldsFromDoc(broadcast) {
  const p = broadcast.payload || {};
  return {
    label: p.label,
    title: p.title,
    subtitle: p.subtitle,
    ctaLabel: p.ctaLabel,
    message: p.message,
    senderName: p.senderName,
    audience: p.audience,
    priority: broadcast.priority,
    dip: broadcast.dip,
    expiresAt: broadcast.expiresAt,
    startsAt: broadcast.startsAt,
    reach: broadcast.reach,
    targetClassrooms: broadcast.targetClassrooms,
    targetTeachers: broadcast.targetTeachers,
  };
}
