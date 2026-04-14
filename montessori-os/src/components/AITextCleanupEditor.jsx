import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, TextField, Divider,
  Alert, CircularProgress, List, ListItem, ListItemText, ListItemSecondaryAction, Chip, Stack,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { Restore, Save, Bolt, Science } from '@mui/icons-material';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { forceRefreshKey } from '../services/promptProvider';
import { cleanUpText, CLEANUP_MODEL_INFO } from '../textCleanup';
import { AVAILABLE_MODELS } from '../../../scripts/config/modelConstants';
import { isSuperAdmin } from '../utils/roleUtils';

const MAX_HISTORY = 5;

const SectionCard = ({ title, subtitle, children }) => (
  <Card sx={{ borderRadius: 2 }}>
    <CardContent>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>{title}</Typography>
      {subtitle && (
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>{subtitle}</Typography>
      )}
      <Divider sx={{ my: 2 }} />
      {children}
    </CardContent>
  </Card>
);

export default function AITextCleanupEditor({ currentUser, userRole }) {
  const isAdmin = isSuperAdmin(userRole);

  // Text Summarizer state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docState, setDocState] = useState(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [model, setModel] = useState(CLEANUP_MODEL_INFO.model);
  const [temperature, setTemperature] = useState(CLEANUP_MODEL_INFO.temperature);

  // Test run
  const [testInput, setTestInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [testOutput, setTestOutput] = useState('');
  const [testError, setTestError] = useState('');

  const textRef = useMemo(() => doc(db, 'config', 'text_summarizer'), []);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        setLoading(true);
        const tSnap = await getDoc(textRef);
        if (tSnap.exists()) {
          const t = tSnap.data() || {};
          setDocState({ id: tSnap.id, ...t });
          setSystemPrompt(t.systemPrompt || '');
          setUserPrompt(t.userPrompt || '');
          if (t.model) setModel(t.model);
          if (typeof t.temperature === 'number') setTemperature(t.temperature);
        } else {
          setDocState(null);
        }
      } catch {
        setError('Failed to load prompts');
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, textRef]);

  const cancelEdit = () => {
    if (docState) {
      setSystemPrompt(docState.systemPrompt || '');
      setUserPrompt(docState.userPrompt || '');
      if (docState.model) setModel(docState.model);
      if (typeof docState.temperature === 'number') setTemperature(docState.temperature);
    }
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
      const prevSnapshot = curr.systemPrompt || curr.userPrompt ? {
        version: curr.version || 1,
        systemPrompt: curr.systemPrompt || '',
        userPrompt: curr.userPrompt || '',
        updatedAt: new Date(),
        updatedBy,
        changeNote: changeNote || 'Updated prompts',
      } : null;
      const newVersions = [
        ...(prevSnapshot ? [prevSnapshot] : []),
        ...((curr.versions || []).slice(0, MAX_HISTORY - (prevSnapshot ? 1 : 0)))
      ];

      const payload = {
        title: curr.title || 'Text Cleanup (Observation Notes)',
        description: curr.description || 'Prompts used to clean up observation notes via AI.',
        systemPrompt,
        userPrompt,
        model,
        temperature,
        version: (curr.version || 1) + 1,
        updatedAt: now,
        updatedBy,
        versions: newVersions,
      };

      if (docState) {
        await updateDoc(textRef, payload);
      } else {
        await setDoc(textRef, { ...payload, version: 1, versions: [] });
      }
      setChangeNote('');
      forceRefreshKey('text_summarizer');
      const snap = await getDoc(textRef);
      if (snap.exists()) setDocState({ id: snap.id, ...(snap.data() || {}) });
      setEditing(false);
    } catch (err) {
      console.error('[AITextCleanupEditor] save failed:', err);
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
        systemPrompt: curr.systemPrompt || '',
        userPrompt: curr.userPrompt || '',
        updatedAt: new Date(),
        updatedBy,
        changeNote: `Revert to v${versionItem?.version || ''}`,
      };
      const newVersions = [prevSnapshot, ...(curr.versions || []).filter(v => v !== versionItem)].slice(0, MAX_HISTORY);

      const payload = {
        systemPrompt: versionItem.systemPrompt || '',
        userPrompt: versionItem.userPrompt || '',
        version: (curr.version || 1) + 1,
        updatedAt: now,
        updatedBy,
        versions: newVersions,
      };
      await updateDoc(textRef, payload);
      forceRefreshKey('text_summarizer');
      const snap = await getDoc(textRef);
      if (snap.exists()) setDocState({ id: snap.id, ...(snap.data() || {}) });
      setSystemPrompt(payload.systemPrompt);
      setUserPrompt(payload.userPrompt);
      setEditing(false);
    } catch {
      setError('Failed to revert');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTestError('');
    setTestOutput('');
    if (!testInput.trim()) {
      setTestError('Enter some sample text');
      return;
    }
    try {
      setTesting(true);
      const out = await cleanUpText(testInput);
      setTestOutput(out);
    } catch (_e) {
      setTestError(_e?.message || 'Failed to run');
    } finally {
      setTesting(false);
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
      <SectionCard title="Text Cleanup (Observation Notes)" subtitle="Edit system/user prompts used for cleaning up free-form notes.">
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Coach Pepper is loading the text cleanup prompts...
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
            <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Science sx={{ fontSize: 18, color: '#64748b' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                  Model Configuration
                </Typography>
              </Box>
              {editing ? (
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <FormControl size="small" sx={{ minWidth: 240 }}>
                    <InputLabel id="cleanup-model-label">Model</InputLabel>
                    <Select
                      labelId="cleanup-model-label"
                      value={model}
                      label="Model"
                      onChange={(e) => setModel(e.target.value)}
                      disabled={saving}
                      renderValue={(val) => {
                        const found = AVAILABLE_MODELS.find((m) => m.id === val);
                        return found ? found.label : val;
                      }}
                    >
                      {AVAILABLE_MODELS.map((m) => (
                        <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    type="number"
                    label="Temperature"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    disabled={saving}
                    size="small"
                    sx={{ width: 120 }}
                    inputProps={{ min: 0, max: 2, step: 0.1 }}
                  />
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: '#64748b', fontFamily: 'monospace' }}>
                  Model: {model} &bull; Temperature: {temperature}
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
              {!editing ? (
                <>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>System Prompt</Typography>
                    <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                      {systemPrompt || '—'}
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>User Prompt (supports ${'{text}'})</Typography>
                    <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                      {userPrompt || '—'}
                    </Box>
                  </Box>
                </>
              ) : (
                <>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>System Prompt</Typography>
                    <TextField fullWidth multiline minRows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>User Prompt (supports ${'{text}'})</Typography>
                    <TextField fullWidth multiline minRows={6} value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} />
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Change note (optional)</Typography>
                    <TextField fullWidth placeholder="e.g., softer tone for parents" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
                  </Box>
                </>
              )}

              {/* History */}
              <Box>
                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>History (last {MAX_HISTORY})</Typography>
                {!docState?.versions?.length && (
                  <Typography variant="body2" sx={{ color: '#64748b' }}>No prior versions.</Typography>
                )}
                {docState?.versions?.length > 0 && (
                  <List dense>
                    {docState.versions.map((v, idx) => (
                      <ListItem key={idx} divider>
                        <ListItemText 
                          primary={`v${v.version || '?'} — ${v.changeNote || 'Updated'}`} 
                          secondary={(v.updatedBy?.email || v.updatedBy?.name) ? `${v.updatedBy?.name || ''} ${v.updatedBy?.email || ''}` : ''}
                        />
                        <ListItemSecondaryAction>
                          <Button size="small" startIcon={<Restore />} onClick={() => revert(v)}>Revert</Button>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>

              {/* Test Run */}
              <Divider sx={{ my: 1 }} />
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Bolt fontSize="small" /> Test Run
              </Typography>
              <Stack spacing={2}>
                <TextField fullWidth multiline minRows={4} placeholder="Paste some raw observation text here" value={testInput} onChange={(e) => setTestInput(e.target.value)} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button variant="outlined" startIcon={<Bolt />} onClick={runTest} disabled={testing}>Run cleanup with updated prompt</Button>
                  {testing && <CircularProgress size={16} />}
                  {testError && <Alert severity="error" sx={{ ml: 1 }}>{testError}</Alert>}
                </Box>
                {testOutput && (
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Output</Typography>
                    <TextField fullWidth multiline minRows={6} value={testOutput} onChange={(e) => setTestOutput(e.target.value)} />
                  </Box>
                )}
              </Stack>
              {editing && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                  <Button variant="contained" startIcon={<Save />} onClick={save} disabled={saving}>Save updated prompt(s)</Button>
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
