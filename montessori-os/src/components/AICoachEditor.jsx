import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Divider, Alert, CircularProgress,
  Chip, Tooltip, List, ListItem, ListItemText, ListItemSecondaryAction, TextField, FormGroup, FormControlLabel, Switch
} from '@mui/material';
import { Restore, Save, Psychology } from '@mui/icons-material';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';

const MAX_HISTORY = 5;
const ALL_NUDGES = ['duration', 'modality', 'independence', 'evidence', 'subjective'];

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

function buildCoachSystemPrompt(enabled) {
  const set = new Set(enabled);
  const allow = ALL_NUDGES.filter(n => set.has(n)).join(' | ');
  const chips = [];
  if (set.has('duration')) chips.push('  duration: ["<5m","5–10m","10–20m","20m+"]');
  if (set.has('modality')) chips.push('  modality: ["Material","Pen & paper","Mental"]');
  if (set.has('independence')) chips.push('  independence: ["Independent","Peer pair","Small group","Teacher-guided"]');
  if (set.has('evidence')) chips.push('  evidence: ["# attempts","# correct","Add quote"]');
  if (set.has('subjective')) chips.push('  subjective: []');
  const micro = [];
  if (set.has('duration')) micro.push('about_how_long');
  if (set.has('modality')) micro.push('how_was_this_done');
  if (set.has('evidence')) micro.push('add_tiny_evidence');
  if (set.has('subjective')) micro.push('objective_line_invite');

  return [
    'You are a Montessori teacher coach that proposes up to 2 nudges to improve',
    "a Montessori observation note. Do not rewrite the teacher's text. Only suggest:",
    '- Duration, Modality, Independence, Evidence, or Subjective (objective one-liner).',
    '',
    'Rules:',
    '- Output strict JSON with top-level {"nudges": [...]} with at most 2 items.',
    `- Allowed ids: ${allow}.`,
    '- Chips by id:',
    ...chips,
    micro.length ? `- microcopy_key values: ${micro.join(' | ')}` : null,
    '- Do not infer a duration; only suggest if missing.',
    '- Prefer high precision. If unsure, return an empty array.',
    '',
    'Example (one-shot):',
    'INPUT:',
    '{"note_text":"STUDENT_A used number rods today.","context":{"classroomId":"allstars","programId":"adolescent"}}',
    'OUTPUT:',
    '{"nudges":[',
    '  {"id":"duration","reason":"Activity noted without a time range.","confidence":0.86,"microcopy_key":"about_how_long","chips":["<5m","5–10m","10–20m","20m+"],"append_line":"Duration: 10–20 min","metadata":{"duration_range":"10–20m"}},',
    '  {"id":"modality","reason":"Math work without modality context.","confidence":0.62,"microcopy_key":"how_was_this_done","chips":["Material","Pen & paper","Mental"],"append_line":"Modality: Material","metadata":{"modality":"Material"}}',
    ']}',
    '',
    'Return only JSON. No extra text.'
  ].filter(Boolean).join('\n');
}

export default function AICoachEditor({ currentUser, userRole }) {
  const isAdmin = userRole === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docState, setDocState] = useState(null);
  const [enabled, setEnabled] = useState(ALL_NUDGES);
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [testNote, setTestNote] = useState('');
  const [testing, setTesting] = useState(false);
  const [testOutput, setTestOutput] = useState('');
  const [testError, setTestError] = useState('');

  const coachRef = useMemo(() => doc(db, 'ai_prompts', 'coach'), []);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        setLoading(true);
        const snap = await getDoc(coachRef);
        if (snap.exists()) {
          const d = snap.data() || {};
          setDocState({ id: snap.id, ...d });
          const arr = Array.isArray(d.enabledNudges) && d.enabledNudges.length
            ? d.enabledNudges.filter((x) => ALL_NUDGES.includes(x))
            : ALL_NUDGES;
          setEnabled(arr);
        } else {
          setDocState(null);
          setEnabled(ALL_NUDGES);
        }
      } catch (e) {
        setError('Failed to load Coach config');
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, coachRef]);

  const toggle = (id) => {
    setEnabled((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id); else set.add(id);
      const out = ALL_NUDGES.filter(n => set.has(n));
      return out.length ? out : prev; // prevent empty set
    });
  };

  const cancelEdit = () => {
    if (docState && Array.isArray(docState.enabledNudges)) {
      const arr = docState.enabledNudges.filter((x) => ALL_NUDGES.includes(x));
      setEnabled(arr.length ? arr : ALL_NUDGES);
    } else {
      setEnabled(ALL_NUDGES);
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
      const prevSnapshot = curr.enabledNudges ? {
        version: curr.version || 1,
        enabledNudges: curr.enabledNudges || ALL_NUDGES,
        updatedAt: now,
        updatedBy,
        changeNote: changeNote || 'Updated enabled nudges',
      } : null;
      const newVersions = [
        ...(prevSnapshot ? [prevSnapshot] : []),
        ...((curr.versions || []).slice(0, MAX_HISTORY - (prevSnapshot ? 1 : 0)))
      ];

      const payload = {
        title: curr.title || 'Coach Nudges',
        description: curr.description || 'Select which nudges Coach can suggest.',
        enabledNudges: enabled,
        version: (curr.version || 1) + 1,
        updatedAt: now,
        updatedBy,
        versions: newVersions,
      };

      if (docState) {
        await updateDoc(coachRef, payload);
      } else {
        await setDoc(coachRef, { ...payload, version: 1, versions: [] });
      }
      setChangeNote('');
      // Refresh
      const snap = await getDoc(coachRef);
      if (snap.exists()) setDocState({ id: snap.id, ...(snap.data() || {}) });
      setEditing(false);
    } catch (e) {
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
        enabledNudges: curr.enabledNudges || ALL_NUDGES,
        updatedAt: now,
        updatedBy,
        changeNote: `Revert to v${versionItem?.version || ''}`,
      };
      const newVersions = [prevSnapshot, ...(curr.versions || []).filter(v => v !== versionItem)].slice(0, MAX_HISTORY);

      const payload = {
        enabledNudges: Array.isArray(versionItem.enabledNudges) ? versionItem.enabledNudges : ALL_NUDGES,
        version: (curr.version || 1) + 1,
        updatedAt: now,
        updatedBy,
        versions: newVersions,
      };
      await updateDoc(coachRef, payload);
      const snap = await getDoc(coachRef);
      if (snap.exists()) setDocState({ id: snap.id, ...(snap.data() || {}) });
      setEnabled(payload.enabledNudges);
      setEditing(false);
    } catch (e) {
      setError('Failed to revert');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTestError('');
    setTestOutput('');
    const text = (testNote || '').trim();
    if (!text) {
      setTestError('Enter a sample observation');
      return;
    }
    try {
      setTesting(true);
      const call = httpsCallable(cloudFunctions, 'aiCoachReview');
      const res = await call({ note_text: text, context: {}, forceRefresh: true });
      setTestOutput(JSON.stringify(res?.data || {}, null, 2));
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

  const preview = buildCoachSystemPrompt(enabled);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionCard title="Coach Nudges" subtitle="Toggle which nudges Coach can suggest. Disabled nudges are omitted from the system prompt.">
        {loading ? (
          <CircularProgress size={24} />
        ) : (
          <>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              {!editing ? (
                <Button variant="outlined" startIcon={<Psychology />} onClick={() => setEditing(true)}>Edit</Button>
              ) : (
                <Chip size="small" color="warning" label="Editing" />
              )}
              {docState?.version && <Chip size="small" label={`v${docState.version}`} />}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!editing ? (
                <>
                  <Typography variant="subtitle2">Enabled nudges</Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {enabled.map((n) => (
                      <Chip key={n} label={n} size="small" />
                    ))}
                  </Box>
                </>
              ) : (
                <>
                  <Typography variant="subtitle2">Enable nudges</Typography>
                  <FormGroup>
                    {ALL_NUDGES.map((n) => (
                      <FormControlLabel
                        key={n}
                        control={<Switch checked={enabled.includes(n)} onChange={() => toggle(n)} />}
                        label={n}
                      />
                    ))}
                  </FormGroup>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>Change note (optional)</Typography>
                    <TextField fullWidth placeholder="e.g., testing evidence only" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
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
                        <ListItemText primary={`v${v.version || '?'}`} secondary={v.changeNote || ''} />
                        <ListItemSecondaryAction>
                          <Button size="small" startIcon={<Restore />} onClick={() => revert(v)}>Revert</Button>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Box>

              {/* Preview */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Rendered System Prompt (preview)</Typography>
                <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                  {preview}
                </Box>
              </Box>

              {/* Test Run */}
              <Box>
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Psychology fontSize="small" /> Test Run
                </Typography>
                <TextField fullWidth multiline minRows={4} placeholder="Paste an observation to get nudges" value={testNote} onChange={(e) => setTestNote(e.target.value)} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                  <Button variant="outlined" onClick={runTest} disabled={testing}>Run Coach</Button>
                  {testing && <CircularProgress size={16} />}
                  {testError && <Alert severity="error" sx={{ ml: 1 }}>{testError}</Alert>}
                </Box>
                {testOutput && (
                  <TextField sx={{ mt: 1 }} fullWidth multiline minRows={6} value={testOutput} onChange={(e) => setTestOutput(e.target.value)} />
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

