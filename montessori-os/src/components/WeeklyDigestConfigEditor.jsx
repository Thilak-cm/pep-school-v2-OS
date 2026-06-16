import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  IconButton,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { Plus as Add, Trash2 as Delete, Save, Pencil, Check } from '../icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { isSuperAdmin } from '../utils/roleUtils';
import useNotify from '../notifications/useNotify';

import { parseNotes, serializeNotes } from '../utils/digestNotes';


export default function WeeklyDigestConfigEditor({ userRole }) {
  const notify = useNotify();
  const isAdmin = isSuperAdmin(userRole);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [notes, setNotes] = useState([]);
  const [originalNotes, setOriginalNotes] = useState([]);

  const [editingIndex, setEditingIndex] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, index: null, text: '' });

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const ref = doc(db, 'config', 'weekly_digest');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          const parsed = parseNotes(data.contextualNotes);
          setNotes(parsed);
          setOriginalNotes(parsed);
        } else {
          notify.info('Weekly digest config not found. You can add contextual notes here.');
        }
      } catch {
        setError('Failed to load weekly digest configuration.');
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const isDirty = JSON.stringify(notes) !== JSON.stringify(originalNotes);

  const handleAdd = useCallback(() => {
    setNotes((prev) => {
      setEditingIndex(prev.length);
      return [...prev, ''];
    });
  }, []);

  const handleChange = useCallback((index, value) => {
    setNotes((prev) => prev.map((n, i) => (i === index ? value : n)));
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    const { index } = deleteDialog;
    setNotes((prev) => prev.filter((_, i) => i !== index));
    setDeleteDialog({ open: false, index: null, text: '' });
  }, [deleteDialog]);

  const handleSave = async () => {
    const trimmed = notes.map((n) => n.trim()).filter(Boolean);
    setSaving(true);
    try {
      const ref = doc(db, 'config', 'weekly_digest');
      await updateDoc(ref, { contextualNotes: serializeNotes(trimmed) });
      setNotes(trimmed);
      setOriginalNotes(trimmed);
      notify.success('Contextual notes saved.');
    } catch {
      notify.error('Failed to save contextual notes.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Access denied. Super admins only.</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card sx={{ borderRadius: 2 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--color-text)', mb: 1 }}>
            School Context Notes
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mb: 2 }}>
            These notes are injected into every weekly digest LLM call. Use them to flag non-teaching staff, school breaks, or other edge cases the AI should know about.
          </Typography>

          <Stack spacing={1.5}>
            {notes.map((note, index) => (
              <Card
                key={index}
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  bgcolor: 'var(--color-surface, #fafafa)',
                }}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  {editingIndex === index ? (
                    <>
                      <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        maxRows={6}
                        size="small"
                        autoFocus
                        value={note}
                        onChange={(e) => handleChange(index, e.target.value)}
                        placeholder="e.g. Diana Da is operations admin, not a teacher"
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                      />
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => setEditingIndex(null)}
                        sx={{ mt: 0.5 }}
                      >
                        <Check size={18} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <Typography
                        variant="body2"
                        sx={{ flex: 1, color: 'var(--color-text)', lineHeight: 1.6, py: 0.5 }}
                      >
                        {note || <em style={{ color: 'var(--color-text-soft)' }}>Empty note</em>}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => setEditingIndex(index)}
                        sx={{ color: 'var(--color-text-soft)' }}
                      >
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteDialog({ open: true, index, text: note })}
                      >
                        <Delete size={16} />
                      </IconButton>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}

            {notes.length === 0 && (
              <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', fontStyle: 'italic', py: 1 }}>
                No contextual notes yet. Click "Add Note" to create one.
              </Typography>
            )}
          </Stack>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
            <Button
              variant="outlined"
              startIcon={<Add size={18} />}
              onClick={handleAdd}
              sx={{ textTransform: 'none' }}
            >
              Add Note
            </Button>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Save size={18} />}
              onClick={handleSave}
              disabled={!isDirty || saving}
              sx={{ textTransform: 'none' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, index: null, text: '' })}
      >
        <DialogTitle>Delete Note</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this note?
          </DialogContentText>
          {deleteDialog.text && (
            <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic', color: 'text.secondary' }}>
              &ldquo;{deleteDialog.text}&rdquo;
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, index: null, text: '' })}>
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
