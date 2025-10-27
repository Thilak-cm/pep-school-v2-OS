import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Divider, Alert, CircularProgress,
  Chip, Tooltip, TextField, FormGroup, FormControlLabel, Switch
} from '@mui/material';
import { Save, Psychology } from '@mui/icons-material';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';

const ALL_NUDGES = ['duration', 'modality', 'independence', 'evidence', 'subjective'];
const DEFAULT_PRIORITY = ['duration', 'modality', 'independence', 'evidence', 'subjective'];

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

function composeFinalPrompt(doc, enabled) {
  const set = new Set(enabled || []);
  const blocks = (doc && doc.nudgeBlocks) || {};
  const priority = Array.isArray(doc?.priorityOrder) && doc.priorityOrder.length ? doc.priorityOrder : DEFAULT_PRIORITY;
  const effective = priority.filter((id) => set.has(id) && blocks[id] && Array.isArray(blocks[id].lines) && blocks[id].lines.length);
  const allow = effective.join(' | ');
  const lines = [];
  if (Array.isArray(doc?.introLines)) lines.push(...doc.introLines);
  lines.push('');
  lines.push('How to respond');
  if (Array.isArray(doc?.howToLines)) lines.push(...doc.howToLines);
  lines.push('Each nudge must include exactly: id, reason, confidence.');
  lines.push(`Allowed ids: ${allow}.`);
  if (effective.length) lines.push(`Prioritize in this order: ${effective.join(' → ')}.`);
  lines.push('');
  lines.push('Nudge types and triggers');
  for (const id of effective) {
    const block = blocks[id];
    for (const s of (block?.lines || [])) lines.push(String(s));
    lines.push('');
  }
  const baseInput = doc?.examples?.baseInput || 'STUDENT_A used number rods today.';
  const reasons = (doc?.examples?.reasonsById) || {};
  const exampleIds = effective.slice(0, 2);
  lines.push('Example');
  lines.push('INPUT:');
  lines.push(JSON.stringify({ note_text: baseInput }));
  lines.push('OUTPUT:');
  lines.push('{');
  lines.push('  "nudges": [');
  for (let i = 0; i < exampleIds.length; i++) {
    const id = exampleIds[i];
    const reason = reasons[id] || 'Relevant missing element.';
    const conf = i === 0 ? 0.86 : 0.62;
    const comma = i < exampleIds.length - 1 ? ',' : '';
    lines.push(`    {"id": "${id}", "reason": "${reason}", "confidence": ${conf}}${comma}`);
  }
  lines.push('  ]');
  lines.push('}');
  return { text: lines.join('\n'), allowList: allow, order: effective, effectiveEnabled: effective };
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
        // Surface the underlying Firestore error details in console
        // Common causes: permission denied or FieldValue in arrays
        // eslint-disable-next-line no-console
        console.error('[AICoachEditor] load failed', e);
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
      return ALL_NUDGES.filter(n => set.has(n)); // allow zero enabled
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
      const nowServer = serverTimestamp();
      const nowIso = new Date().toISOString();
      const updatedBy = {
        uid: currentUser?.uid || '',
        email: currentUser?.email || '',
        name: currentUser?.displayName || '',
      };
      const curr = docState || {};
      const composed = composeFinalPrompt(curr, enabled);
      const finalPromptToSave = enabled.length === 0 ? '' : composed.text;
      const payload = {
        title: curr.title || 'Coach Nudges',
        description: curr.description || 'Select which nudges Coach can suggest.',
        enabledNudges: enabled,
        disabledNudges: ALL_NUDGES.filter((n) => !enabled.includes(n)),
        effectiveEnabled: enabled.length === 0 ? [] : composed.effectiveEnabled,
        finalPrompt: finalPromptToSave,
        updatedAt: nowServer,
        updatedBy,
      };

      if (docState) await updateDoc(coachRef, payload); else await setDoc(coachRef, payload);
      setChangeNote('');
      // Refresh
      const snap = await getDoc(coachRef);
      if (snap.exists()) setDocState({ id: snap.id, ...(snap.data() || {}) });
      setEditing(false);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[AICoachEditor] save failed', e);
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Version history removed — revert functionality no longer applicable

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
      const res = await call({ note_text: text });
      setTestOutput(JSON.stringify(res?.data || {}, null, 2));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[AICoachEditor] test run failed', e);
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

  const final = composeFinalPrompt(docState || {}, enabled);

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
              {/* version removed */}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {!editing ? (
                <>
                  <Typography variant="subtitle2">Enabled nudges</Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {ALL_NUDGES.map((n) => {
                      const isOn = enabled.includes(n);
                      return (
                        <Chip
                          key={n}
                          label={n}
                          size="small"
                          color={isOn ? 'success' : 'error'}
                          variant={isOn ? 'filled' : 'outlined'}
                          sx={{
                            textDecoration: isOn ? 'none' : 'line-through',
                          }}
                        />
                      );
                    })}
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

              {/* Version history removed */}

              {/* Preview Panels */}
              {enabled.length === 0 ? (
                <Alert severity="info">Coach feature disabled. No enhancements will be suggested on note save.</Alert>
              ) : (
                <>
                  {/* Intro */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Intro</Typography>
                    <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                      {(Array.isArray(docState?.introLines) ? docState.introLines : []).join('\n')}
                    </Box>
                  </Box>

                  {/* How To */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>How To</Typography>
                    <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                      {[
                        ...(Array.isArray(docState?.howToLines) ? docState.howToLines : []),
                        'Each nudge must include exactly: id, reason, confidence.',
                        `Allowed ids: ${(final?.allowList || '')}.`,
                        final?.order?.length ? `Prioritize in this order: ${final.order.join(' → ')}.` : '',
                      ].filter(Boolean).join('\n')}
                    </Box>
                  </Box>

                  {/* Nudge Blocks */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Nudge Blocks</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1 }}>
                      {ALL_NUDGES.map((id) => {
                        const block = docState?.nudgeBlocks?.[id];
                        const isOn = enabled.includes(id);
                        const text = Array.isArray(block?.lines) ? block.lines.join('\n') : '• Not configured';
                        return (
                          <Box key={id} component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.25, border: '1px solid #e2e8f0', borderRadius: 1, bgcolor: '#ffffff', color: isOn ? 'text.primary' : 'text.disabled' }}>
                            {text}
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>

                  {/* Example (expanded) */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Example (expanded preview)</Typography>
                    <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1, mb: 1 }}>
                      {`INPUT:\n${JSON.stringify({ note_text: (docState?.examples?.baseInput || 'STUDENT_A used number rods today.') })}`}
                    </Box>
                    <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                      {['OUTPUT candidates:', ...ALL_NUDGES.map((id, i) => {
                        const reason = docState?.examples?.reasonsById?.[id] || 'Relevant missing element.';
                        const conf = i === 0 ? 0.86 : 0.62;
                        const obj = { id, reason, confidence: conf };
                        const json = JSON.stringify(obj);
                        return enabled.includes(id) ? json : `// ${json}`;
                      })].join('\n')}
                    </Box>
                  </Box>

                  {/* Final composed prompt (from Firestore) */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Final Prompt (used by Coach)</Typography>
                    <Box component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', p: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 1 }}>
                      {docState?.finalPrompt ?? ''}
                    </Box>
                  </Box>
                </>
              )}

              {/* Test Run */}
              <Box>
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Psychology fontSize="small" /> Test Run
                </Typography>
                <TextField fullWidth multiline minRows={4} placeholder="Paste an observation to get nudges" value={testNote} onChange={(e) => setTestNote(e.target.value)} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                  <Button variant="outlined" onClick={runTest} disabled={testing || enabled.length === 0}>Run Coach</Button>
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
