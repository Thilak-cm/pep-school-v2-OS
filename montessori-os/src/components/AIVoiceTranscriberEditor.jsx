import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, TextField, Divider,
  Alert, CircularProgress, List, ListItem, ListItemText, ListItemSecondaryAction, Chip
} from '@mui/material';
import { RotateCcw as Restore, Save, FlaskConical as Science } from '../icons';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { forceRefreshKey } from '../services/promptProvider';
import { WHISPER_MODEL_INFO } from '../whisperSTT';
import { isSuperAdmin } from '../utils/roleUtils';

const MAX_HISTORY = 5;

const SectionCard = ({ title, subtitle, children }) => (
  <Card sx={{ borderRadius: 2 }}>
    <CardContent>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>{title}</Typography>
      {subtitle && (
        <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mt: 0.5 }}>{subtitle}</Typography>
      )}
      <Divider sx={{ my: 2 }} />
      {children}
    </CardContent>
  </Card>
);

export default function AIVoiceTranscriberEditor({ currentUser, userRole }) {
  const isAdmin = isSuperAdmin(userRole);

  // Voice Transcriber state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docState, setDocState] = useState(null);
  const [contextPrompt, setContextPrompt] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const voiceRef = useMemo(() => doc(db, 'config', 'voice_transcriber'), []);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        setLoading(true);
        const vSnap = await getDoc(voiceRef);
        if (vSnap.exists()) {
          const v = vSnap.data() || {};
          setDocState({ id: vSnap.id, ...v });
          setContextPrompt(v.contextPrompt || '');
        } else {
          setDocState(null);
        }
      } catch {
        setError('Failed to load prompts');
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, voiceRef]);

  const cancelEdit = () => {
    if (docState) setContextPrompt(docState.contextPrompt || '');
    setChangeNote('');
    setEditing(false);
  };

  const save = async () => {
    if (!isAdmin) return;
    try {
      setSaving(true);
      const now = serverTimestamp();
      const updatedBy = {
        uid: currentUser?.uid || '',
        email: currentUser?.email || '',
        name: currentUser?.displayName || '',
      };
      const curr = docState || { version: 0, versions: [] };
      const prevSnapshot = curr.contextPrompt ? {
        version: curr.version || 1,
        contextPrompt: curr.contextPrompt || '',
        updatedAt: now,
        updatedBy,
        changeNote: changeNote || 'Updated context',
      } : null;
      const newVersions = [
        ...(prevSnapshot ? [prevSnapshot] : []),
        ...((curr.versions || []).slice(0, MAX_HISTORY - (prevSnapshot ? 1 : 0)))
      ];

      const payload = {
        title: curr.title || 'Voice Transcriber Context',
        description: curr.description || 'Context string provided to the STT engine to bias educational content.',
        contextPrompt,
        version: (curr.version || 1) + 1,
        updatedAt: now,
        updatedBy,
        versions: newVersions,
      };

      if (docState) {
        await updateDoc(voiceRef, payload);
      } else {
        await setDoc(voiceRef, { ...payload, version: 1, versions: [] });
      }
      setChangeNote('');
      forceRefreshKey('voice_transcriber');
      const snap = await getDoc(voiceRef);
      if (snap.exists()) setDocState({ id: snap.id, ...(snap.data() || {}) });
      setEditing(false);
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const revert = async (versionItem) => {
    if (!isAdmin || !docState) return;
    try {
      setSaving(true);
      const now = serverTimestamp();
      const updatedBy = {
        uid: currentUser?.uid || '',
        email: currentUser?.email || '',
        name: currentUser?.displayName || '',
      };
      const curr = docState;
      const prevSnapshot = {
        version: curr.version || 1,
        contextPrompt: curr.contextPrompt || '',
        updatedAt: now,
        updatedBy,
        changeNote: `Revert to v${versionItem?.version || ''}`,
      };
      const newVersions = [prevSnapshot, ...(curr.versions || []).filter(v => v !== versionItem)].slice(0, MAX_HISTORY);

      const payload = {
        contextPrompt: versionItem.contextPrompt || '',
        version: (curr.version || 1) + 1,
        updatedAt: now,
        updatedBy,
        versions: newVersions,
      };
      await updateDoc(voiceRef, payload);
      forceRefreshKey('voice_transcriber');
      const snap = await getDoc(voiceRef);
      if (snap.exists()) setDocState({ id: snap.id, ...(snap.data() || {}) });
      setContextPrompt(payload.contextPrompt);
      setEditing(false);
    } catch {
      setError('Failed to revert');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Access denied. Admins only.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionCard title="Voice Transcriber Context" subtitle="Edit the context prompt provided to the STT engine (Whisper).">
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Coach Pepper is fetching the voice prompt...
            </Typography>
          </Box>
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
              {!editing ? (
                <Button variant="outlined" onClick={() => setEditing(true)}>Edit</Button>
              ) : (
                <Chip size="small" color="warning" label="Editing" />
              )}
            </Box>
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Science size={18} style={{ color: 'var(--color-text-soft)' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'var(--color-text)' }}>
                  Model Configuration
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', fontFamily: 'var(--font-mono)' }}>
                Model: {WHISPER_MODEL_INFO.model}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
              {!editing ? (
                <>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'var(--color-text-soft)' }}>Context Prompt</Typography>
                    <Box component="pre" sx={{ fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 1 }}>
                      {contextPrompt || '—'}
                    </Box>
                  </Box>
                </>
              ) : (
                <>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'var(--color-text-soft)' }}>Context Prompt</Typography>
                    <TextField fullWidth multiline minRows={6} value={contextPrompt} onChange={(e) => setContextPrompt(e.target.value)} />
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'var(--color-text-soft)' }}>Change note (optional)</Typography>
                    <TextField fullWidth placeholder="e.g., add curriculum vocabulary" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
                  </Box>
                </>
              )}
              <Box>
                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>History (last {MAX_HISTORY})</Typography>
                {!docState?.versions?.length && (
                  <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>No prior versions.</Typography>
                )}
                {docState?.versions?.length > 0 && (
                  <List dense>
                    {docState.versions.map((v, idx) => (
                      <ListItem key={idx} divider>
                        <ListItemText primary={`v${v.version || '?'} — ${v.changeNote || 'Updated'}`} secondary={(v.updatedBy?.email || v.updatedBy?.name) ? `${v.updatedBy?.name || ''} ${v.updatedBy?.email || ''}` : ''} />
                        <ListItemSecondaryAction>
                          <Button size="small" onClick={() => revert(v)} startIcon={<Restore />}>Revert</Button>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>
              {editing && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                  <Button variant="contained" startIcon={<Save />} onClick={save} disabled={saving}>Save</Button>
                  <Button variant="text" onClick={cancelEdit}>Cancel</Button>
                </Box>
              )}
            </Box>
          </>
        )}
      </SectionCard>
    </Box>
  );
}
