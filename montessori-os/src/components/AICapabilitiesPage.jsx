import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, CardActions, Button, Grid, TextField, Divider,
  Alert, CircularProgress, List, ListItem, ListItemText, ListItemSecondaryAction, IconButton, Chip, Tooltip, Tabs, Tab
} from '@mui/material';
import { Restore, Save, Bolt, Science, History, Replay, ArrowBack } from '@mui/icons-material';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { forceRefreshKey, getTextSummarizerPrompts, getWhisperContextPrompt } from '../services/promptProvider';
import { cleanUpText, CLEANUP_MODEL_INFO } from '../textCleanup';
import { WHISPER_MODEL_INFO } from '../whisperSTT';

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

export default function AICapabilitiesPage({ currentUser, userRole, onBack }) {
  const isAdmin = userRole === 'admin';

  // Page tabs: 'text' | 'voice'
  const [tab, setTab] = useState('text');

  // Text Summarizer state
  const [textLoading, setTextLoading] = useState(true);
  const [textError, setTextError] = useState('');
  const [textDoc, setTextDoc] = useState(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [changeNoteText, setChangeNoteText] = useState('');
  const [savingText, setSavingText] = useState(false);
  const [editingText, setEditingText] = useState(false);

  // Test run
  const [testInput, setTestInput] = useState('');
  const [testTone, setTestTone] = useState('standard');
  const [testing, setTesting] = useState(false);
  const [testOutput, setTestOutput] = useState('');
  const [testError, setTestError] = useState('');

  // Voice Transcriber state
  const [voiceLoading, setVoiceLoading] = useState(true);
  const [voiceError, setVoiceError] = useState('');
  const [voiceDoc, setVoiceDoc] = useState(null);
  const [contextPrompt, setContextPrompt] = useState('');
  const [changeNoteVoice, setChangeNoteVoice] = useState('');
  const [savingVoice, setSavingVoice] = useState(false);
  const [editingVoice, setEditingVoice] = useState(false);

  const textRef = useMemo(() => doc(db, 'ai_prompts', 'text_summarizer'), []);
  const voiceRef = useMemo(() => doc(db, 'ai_prompts', 'voice_transcriber'), []);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        setTextLoading(true);
        setVoiceLoading(true);

        const [tSnap, vSnap] = await Promise.all([getDoc(textRef), getDoc(voiceRef)]);

        if (tSnap.exists()) {
          const t = tSnap.data() || {};
          setTextDoc({ id: tSnap.id, ...t });
          setSystemPrompt(t.systemPrompt || '');
          setUserPrompt(t.userPrompt || '');
        } else {
          setTextDoc(null);
        }

        if (vSnap.exists()) {
          const v = vSnap.data() || {};
          setVoiceDoc({ id: vSnap.id, ...v });
          setContextPrompt(v.contextPrompt || '');
        } else {
          setVoiceDoc(null);
        }
      } catch (e) {
        setTextError('Failed to load prompts');
        setVoiceError('Failed to load prompts');
      } finally {
        setTextLoading(false);
        setVoiceLoading(false);
      }
    })();
  }, [isAdmin, textRef, voiceRef]);

  const cancelTextEdit = () => {
    // Revert form fields to the last-loaded doc values and exit edit mode
    if (textDoc) {
      setSystemPrompt(textDoc.systemPrompt || '');
      setUserPrompt(textDoc.userPrompt || '');
    }
    setChangeNoteText('');
    setEditingText(false);
  };

  const cancelVoiceEdit = () => {
    if (voiceDoc) {
      setContextPrompt(voiceDoc.contextPrompt || '');
    }
    setChangeNoteVoice('');
    setEditingVoice(false);
  };

  const saveText = async () => {
    if (!isAdmin) return;
    try {
      setSavingText(true);
      const now = serverTimestamp();
      const updatedBy = {
        uid: currentUser?.uid || '',
        email: currentUser?.email || '',
        name: currentUser?.displayName || '',
      };
      const curr = textDoc || { version: 0, versions: [] };
      const prevSnapshot = curr.systemPrompt || curr.userPrompt ? {
        version: curr.version || 1,
        systemPrompt: curr.systemPrompt || '',
        userPrompt: curr.userPrompt || '',
        updatedAt: now,
        updatedBy,
        changeNote: changeNoteText || 'Updated prompts',
      } : null;
      const newVersions = [
        ...(prevSnapshot ? [prevSnapshot] : []),
        ...((curr.versions || []).slice(0, MAX_HISTORY - (prevSnapshot ? 1 : 0)))
      ];

      const payload = {
        title: curr.title || 'Text Cleanup (Observation Notes)',
        description: curr.description || 'Prompts used to clean up observation notes via AI.',
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
        version: (curr.version || 1) + 1,
        updatedAt: now,
        updatedBy,
        versions: newVersions,
      };

      if (textDoc) {
        await updateDoc(textRef, payload);
      } else {
        await setDoc(textRef, { ...payload, version: 1, versions: [] });
      }
      setChangeNoteText('');
      forceRefreshKey('text_summarizer');
      // Refresh visible doc
      const snap = await getDoc(textRef);
      if (snap.exists()) setTextDoc({ id: snap.id, ...(snap.data() || {}) });
      setEditingText(false);
    } catch (e) {
      setTextError('Failed to save');
    } finally {
      setSavingText(false);
    }
  };

  const revertText = async (versionItem) => {
    if (!isAdmin || !textDoc) return;
    try {
      setSavingText(true);
      const now = serverTimestamp();
      const updatedBy = {
        uid: currentUser?.uid || '',
        email: currentUser?.email || '',
        name: currentUser?.displayName || '',
      };
      const curr = textDoc;
      const prevSnapshot = {
        version: curr.version || 1,
        systemPrompt: curr.systemPrompt || '',
        userPrompt: curr.userPrompt || '',
        updatedAt: now,
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
      if (snap.exists()) setTextDoc({ id: snap.id, ...(snap.data() || {}) });
      setSystemPrompt(payload.systemPrompt);
      setUserPrompt(payload.userPrompt);
      setEditingText(false);
    } catch (e) {
      setTextError('Failed to revert');
    } finally {
      setSavingText(false);
    }
  };

  const saveVoice = async () => {
    if (!isAdmin) return;
    try {
      setSavingVoice(true);
      const now = serverTimestamp();
      const updatedBy = {
        uid: currentUser?.uid || '',
        email: currentUser?.email || '',
        name: currentUser?.displayName || '',
      };
      const curr = voiceDoc || { version: 0, versions: [] };
      const prevSnapshot = curr.contextPrompt ? {
        version: curr.version || 1,
        contextPrompt: curr.contextPrompt || '',
        updatedAt: now,
        updatedBy,
        changeNote: changeNoteVoice || 'Updated context',
      } : null;
      const newVersions = [
        ...(prevSnapshot ? [prevSnapshot] : []),
        ...((curr.versions || []).slice(0, MAX_HISTORY - (prevSnapshot ? 1 : 0)))
      ];

      const payload = {
        title: curr.title || 'Voice Transcriber Context',
        description: curr.description || 'Context string provided to the STT engine to bias educational content.',
        contextPrompt: contextPrompt,
        version: (curr.version || 1) + 1,
        updatedAt: now,
        updatedBy,
        versions: newVersions,
      };

      if (voiceDoc) {
        await updateDoc(voiceRef, payload);
      } else {
        await setDoc(voiceRef, { ...payload, version: 1, versions: [] });
      }
      setChangeNoteVoice('');
      forceRefreshKey('voice_transcriber');
      const snap = await getDoc(voiceRef);
      if (snap.exists()) setVoiceDoc({ id: snap.id, ...(snap.data() || {}) });
      setEditingVoice(false);
    } catch (e) {
      setVoiceError('Failed to save');
    } finally {
      setSavingVoice(false);
    }
  };

  const revertVoice = async (versionItem) => {
    if (!isAdmin || !voiceDoc) return;
    try {
      setSavingVoice(true);
      const now = serverTimestamp();
      const updatedBy = {
        uid: currentUser?.uid || '',
        email: currentUser?.email || '',
        name: currentUser?.displayName || '',
      };
      const curr = voiceDoc;
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
      if (snap.exists()) setVoiceDoc({ id: snap.id, ...(snap.data() || {}) });
      setContextPrompt(payload.contextPrompt);
      setEditingVoice(false);
    } catch (e) {
      setVoiceError('Failed to revert');
    } finally {
      setSavingVoice(false);
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
      const out = await cleanUpText(testInput, { tone: testTone });
      setTestOutput(out);
    } catch (e) {
      setTestError(e?.message || 'Failed to run');
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
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab value="text" label="Text Cleanup" />
        <Tab value="voice" label="Voice Transcriber" />
      </Tabs>

      {tab === 'text' && (
        <SectionCard title="Text Cleanup (Observation Notes)" subtitle="Edit system/user prompts used for cleaning up free-form notes.">
          {textLoading ? (
            <CircularProgress size={24} />
          ) : (
            <>
              {textError && <Alert severity="error" sx={{ mb: 2 }}>{textError}</Alert>}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                {!editingText ? (
                  <Button variant="outlined" onClick={() => setEditingText(true)}>Edit</Button>
                ) : (
                  <Chip size="small" color="warning" label="Editing" />
                )}
                {textDoc?.version && <Chip size="small" color="default" label={`v${textDoc.version}`} />}
                <Tooltip title={`Model ${CLEANUP_MODEL_INFO.model}, temp ${CLEANUP_MODEL_INFO.temperature}, max_tokens ${CLEANUP_MODEL_INFO.max_tokens}`}>
                  <Chip size="small" icon={<Science />} label="Model info" />
                </Tooltip>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                {!editingText ? (
                  <>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>System Prompt</Typography>
                      <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                        {systemPrompt || '—'}
                      </Box>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>User Prompt (supports ${'{tone}'} and ${'{text}'})</Typography>
                      <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                        {userPrompt || '—'}
                      </Box>
                    </Box>
                    {/* Tone moved beneath user prompt */}
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Test Tone</Typography>
                      <TextField fullWidth placeholder="standard" value={testTone} onChange={(e) => setTestTone(e.target.value)} />
                    </Box>
                  </>
                ) : (
                  <>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>System Prompt</Typography>
                      <TextField fullWidth multiline minRows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>User Prompt (supports ${'{tone}'} and ${'{text}'})</Typography>
                      <TextField fullWidth multiline minRows={6} value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} />
                    </Box>
                    {/* Tone moved beneath user prompt */}
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Test Tone</Typography>
                      <TextField fullWidth placeholder="standard" value={testTone} onChange={(e) => setTestTone(e.target.value)} />
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Change note (optional)</Typography>
                      <TextField fullWidth placeholder="e.g., softer tone for parents" value={changeNoteText} onChange={(e) => setChangeNoteText(e.target.value)} />
                    </Box>
                  </>
                )}

                {/* History */}
                <Box>
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>History (last {MAX_HISTORY})</Typography>
                  {!textDoc?.versions?.length && (
                    <Typography variant="body2" sx={{ color: '#64748b' }}>No prior versions.</Typography>
                  )}
                  {textDoc?.versions?.length > 0 && (
                    <List dense>
                      {textDoc.versions.map((v, idx) => (
                        <ListItem key={idx} divider>
                          <ListItemText 
                            primary={`v${v.version || '?'} — ${v.changeNote || 'Updated'}`} 
                            secondary={(v.updatedBy?.email || v.updatedBy?.name) ? `${v.updatedBy?.name || ''} ${v.updatedBy?.email || ''}` : ''}
                          />
                          <ListItemSecondaryAction>
                            <Button size="small" startIcon={<Restore />} onClick={() => revertText(v)}>Revert</Button>
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
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField fullWidth multiline minRows={4} placeholder="Paste some raw observation text here" value={testInput} onChange={(e) => setTestInput(e.target.value)} />
                  </Grid>
                  <Grid item xs={12} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button variant="outlined" startIcon={<Bolt />} onClick={runTest} disabled={testing}>Run cleanup with updated prompt</Button>
                    {testing && <CircularProgress size={16} />}
                    {testError && <Alert severity="error" sx={{ ml: 1 }}>{testError}</Alert>}
                  </Grid>
                  {testOutput && (
                    <Grid item xs={12}>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Output</Typography>
                      <TextField fullWidth multiline minRows={6} value={testOutput} onChange={(e) => setTestOutput(e.target.value)} />
                    </Grid>
                  )}
                </Grid>
                {editingText && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                    <Button variant="contained" startIcon={<Save />} onClick={saveText} disabled={savingText}>Save updated prompt(s)</Button>
                    <Button variant="text" onClick={cancelTextEdit}>Cancel</Button>
                  </Box>
                )}
              </Box>
            </>
          )}
        </SectionCard>
      )}

      {tab === 'voice' && (
        <SectionCard title="Voice Transcriber Context" subtitle="Edit the context prompt provided to the STT engine (Whisper).">
          {voiceLoading ? (
            <CircularProgress size={24} />
          ) : (
            <>
              {voiceError && <Alert severity="error" sx={{ mb: 2 }}>{voiceError}</Alert>}
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                {!editingVoice ? (
                  <Button variant="outlined" onClick={() => setEditingVoice(true)}>Edit</Button>
                ) : (
                  <Chip size="small" color="warning" label="Editing" />
                )}
                {voiceDoc?.version && <Chip size="small" color="default" label={`v${voiceDoc.version}`} />}
                <Tooltip title={`Model ${WHISPER_MODEL_INFO.model}`}>
                  <Chip size="small" icon={<Science />} label="Model info" />
                </Tooltip>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                {!editingVoice ? (
                  <>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Context Prompt</Typography>
                      <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                        {contextPrompt || '—'}
                      </Box>
                    </Box>
                  </>
                ) : (
                  <>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Context Prompt</Typography>
                      <TextField fullWidth multiline minRows={6} value={contextPrompt} onChange={(e) => setContextPrompt(e.target.value)} />
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>Change note (optional)</Typography>
                      <TextField fullWidth placeholder="e.g., add curriculum vocabulary" value={changeNoteVoice} onChange={(e) => setChangeNoteVoice(e.target.value)} />
                    </Box>
                  </>
                )}
                <Box>
                  <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>History (last {MAX_HISTORY})</Typography>
                  {!voiceDoc?.versions?.length && (
                    <Typography variant="body2" sx={{ color: '#64748b' }}>No prior versions.</Typography>
                  )}
                  {voiceDoc?.versions?.length > 0 && (
                    <List dense>
                      {voiceDoc.versions.map((v, idx) => (
                        <ListItem key={idx} divider>
                          <ListItemText primary={`v${v.version || '?'} — ${v.changeNote || 'Updated'}`} secondary={(v.updatedBy?.email || v.updatedBy?.name) ? `${v.updatedBy?.name || ''} ${v.updatedBy?.email || ''}` : ''} />
                          <ListItemSecondaryAction>
                            <Button size="small" startIcon={<Restore />} onClick={() => revertVoice(v)}>Revert</Button>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
                {editingVoice && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                    <Button variant="contained" startIcon={<Save />} onClick={saveVoice} disabled={savingVoice}>Save</Button>
                    <Button variant="text" onClick={cancelVoiceEdit}>Cancel</Button>
                  </Box>
                )}
              </Box>
            </>
          )}
        </SectionCard>
      )}
    </Box>
  );
}
