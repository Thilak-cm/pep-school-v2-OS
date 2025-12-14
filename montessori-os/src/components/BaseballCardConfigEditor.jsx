import React, { useEffect, useCallback, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Stack,
  Button,
  CircularProgress,
  Divider,
  Chip,
  InputAdornment,
  Autocomplete
} from '@mui/material';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import { isSuperAdmin } from '../utils/roleUtils';
import { BASEBALL_CARD_DEFAULTS } from '../../../config/baseballCardConstants';
import useNotify from '../notifications/useNotify';
import { fuzzySearchStudents } from '../utils/fuzzySearch';

const DEFAULT_PROMPT = `You are Coach Pepper, summarizing the last <WINDOW_DAYS> days of notes for ONE student.
You receive an array of notes with various fields in them. Understand them so you can generate a structured summary output.

Rules:
- Output concise JSON only. No markdown. Return exactly one JSON object matching the schema; no extra keys.
- Summaries must be grounded ONLY in provided notes. Never invent details, diagnoses, or events.
- Keep wording clear, teacher-friendly, and brief; prefer active voice.
- Bullets: 3–7 items (depends on content size). Each bullet must include a concrete evidence clause with a date (e.g., “On Nov 18 …”).
- Lesson summary: 1–2 sentence conclusion weaving the recent lessons/overall takeaway (no heading).

Output schema:
{
  "bullets": ["...", "..."],
  "lessonSummary": "..."
}`;

export default function BaseballCardConfigEditor({ currentUser, userRole }) {
  const isAdmin = isSuperAdmin(userRole);
  const notify = useNotify();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    model: BASEBALL_CARD_DEFAULTS.model,
    temperature: BASEBALL_CARD_DEFAULTS.temperature,
    windowDays: BASEBALL_CARD_DEFAULTS.windowDays,
    timezone: BASEBALL_CARD_DEFAULTS.timezone,
    max_tokens: BASEBALL_CARD_DEFAULTS.max_tokens,
  });

  const [prompt, setPrompt] = useState({
    title: 'Coach Pepper’s summary',
    description: 'Last six weeks baseball card summary',
    systemPrompt: DEFAULT_PROMPT,
  });
  const [editingConfig, setEditingConfig] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [playgroundConfig, setPlaygroundConfig] = useState({
    model: BASEBALL_CARD_DEFAULTS.model,
    temperature: BASEBALL_CARD_DEFAULTS.temperature,
    windowDays: BASEBALL_CARD_DEFAULTS.windowDays,
    timezone: BASEBALL_CARD_DEFAULTS.timezone,
    max_tokens: BASEBALL_CARD_DEFAULTS.max_tokens,
  });
  const [playgroundTouched, setPlaygroundTouched] = useState(false);
  const [playgroundRunning, setPlaygroundRunning] = useState(false);
  const [playgroundError, setPlaygroundError] = useState('');
  const [playgroundResult, setPlaygroundResult] = useState(null);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [configSnap, promptSnap] = await Promise.all([
        getDoc(doc(db, 'config', 'baseball_card')),
        getDoc(doc(db, 'ai_prompts', 'baseball_card'))
      ]);

      if (configSnap.exists()) {
        const data = configSnap.data() || {};
        setConfig({
          model: data.model || BASEBALL_CARD_DEFAULTS.model,
          temperature: Number.isFinite(data.temperature) ? data.temperature : BASEBALL_CARD_DEFAULTS.temperature,
          windowDays: Number.isFinite(data.windowDays) ? data.windowDays : BASEBALL_CARD_DEFAULTS.windowDays,
          timezone: data.timezone || BASEBALL_CARD_DEFAULTS.timezone,
          max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens,
        });
      } else {
        setConfig({ ...BASEBALL_CARD_DEFAULTS });
      }

      if (promptSnap.exists()) {
        const data = promptSnap.data() || {};
        setPrompt({
          title: data.title || 'Coach Pepper’s summary',
          description: data.description || 'Last six weeks baseball card summary',
          systemPrompt: data.systemPrompt || DEFAULT_PROMPT,
        });
      } else {
        setPrompt({
          title: 'Coach Pepper’s summary',
          description: 'Last six weeks baseball card summary',
          systemPrompt: DEFAULT_PROMPT,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load baseball card config', e);
      notify.error('Failed to load baseball card settings.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, notify]);

  const loadStudents = useCallback(async () => {
    if (!isAdmin) return;
    setStudentsLoading(true);
    try {
      const studentsQuery = query(collection(db, 'students'), where('isActive', '==', true));
      const snap = await getDocs(studentsQuery);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const nameA = (a.displayName || a.name || a.firstName || '').toLowerCase();
        const nameB = (b.displayName || b.name || b.firstName || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setStudents(list);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to load students for playground', err);
      notify.error('Failed to load students for playground.');
    } finally {
      setStudentsLoading(false);
    }
  }, [isAdmin, notify]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    if (playgroundTouched) return;
    setPlaygroundConfig({
      model: config.model,
      temperature: config.temperature,
      windowDays: config.windowDays,
      timezone: config.timezone,
      max_tokens: config.max_tokens,
    });
  }, [config.model, config.temperature, config.windowDays, config.timezone, config.max_tokens, playgroundTouched]);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      await Promise.all([
        setDoc(doc(db, 'config', 'baseball_card'), {
          model: config.model || BASEBALL_CARD_DEFAULTS.model,
          temperature: Number.isFinite(config.temperature) ? config.temperature : BASEBALL_CARD_DEFAULTS.temperature,
          windowDays: Number.isFinite(config.windowDays) ? config.windowDays : BASEBALL_CARD_DEFAULTS.windowDays,
          timezone: config.timezone || BASEBALL_CARD_DEFAULTS.timezone,
          max_tokens: Number.isFinite(config.max_tokens) ? config.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens,
          updatedBy: currentUser?.uid || null,
          updatedAt: new Date(),
        }, { merge: true }),
        setDoc(doc(db, 'ai_prompts', 'baseball_card'), {
          title: prompt.title || 'Coach Pepper’s summary',
          description: prompt.description || '',
          systemPrompt: prompt.systemPrompt || DEFAULT_PROMPT,
          updatedBy: currentUser?.uid || null,
          updatedAt: new Date(),
        }, { merge: true })
      ]);
      notify.success('Baseball card settings saved.');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to save baseball card config', e);
      notify.error('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setConfig({ ...BASEBALL_CARD_DEFAULTS });
    setPrompt((prev) => ({
      ...prev,
      systemPrompt: DEFAULT_PROMPT,
    }));
  };

  const handlePlaygroundFieldChange = (key, numeric = false) => (e) => {
    setPlaygroundTouched(true);
    const value = e.target.value;
    setPlaygroundConfig((prev) => ({
      ...prev,
      [key]: numeric ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handleRunPlayground = async () => {
    if (!selectedStudent) {
      setPlaygroundError('Select a student to run the preview.');
      return;
    }
    setPlaygroundRunning(true);
    setPlaygroundError('');
    setPlaygroundResult(null);
    try {
      const runWindowDays = Number.isFinite(playgroundWindowDays) ? Math.max(1, playgroundWindowDays) : windowDaysValue;
      const call = httpsCallable(cloudFunctions, 'previewBaseballCard');
      const payload = {
        studentId: selectedStudent.id,
        windowDays: runWindowDays,
        systemPrompt: prompt.systemPrompt,
        config: {
          model: playgroundConfig.model,
          temperature: playgroundConfig.temperature,
          max_tokens: playgroundConfig.max_tokens,
          timezone: playgroundConfig.timezone,
        },
      };
      const res = await call(payload);
      setPlaygroundResult(res.data);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Baseball card playground failed', err);
      const message = err?.message || 'Failed to run preview.';
      setPlaygroundError(message);
    } finally {
      setPlaygroundRunning(false);
    }
  };

  const windowDaysValue = Number.isFinite(config.windowDays) ? config.windowDays : BASEBALL_CARD_DEFAULTS.windowDays;
  const promptPreviewParts = (prompt.systemPrompt || '').split('<WINDOW_DAYS>');
  const studentMatches = useMemo(() => {
    const matches = fuzzySearchStudents(students, studentSearch);
    return matches.slice(0, 3);
  }, [students, studentSearch]);
  const playgroundWindowDays = Number.isFinite(playgroundConfig.windowDays) ? Math.max(1, playgroundConfig.windowDays) : windowDaysValue;
  const getStudentLabel = (stu) => stu ? (stu.displayName || stu.name || `${stu.firstName || ''} ${stu.lastName || ''}`.trim() || stu.id) : '';

  if (!isAdmin) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="error">Access denied. Super admins only.</Typography>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3 }}>
        <CircularProgress size={24} />
        <Typography variant="body2" color="text.secondary">Loading baseball card settings…</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 900, width: '100%', mx: 'auto' }}>

      <Card sx={{ borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Baseball Card Config
          </Typography>
          <Box
            sx={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 2,
              p: 2
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                Model Configuration
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: '#1f2937', fontWeight: 500 }}>
              Model: {config.model} • Temperature: {config.temperature} • Max tokens: {Number.isFinite(config.max_tokens) ? config.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens}
            </Typography>
          </Box>

          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ xs: 'flex-start', sm: 'flex-start' }}
            >
              <TextField
                label="Window (days)"
                type="number"
                inputProps={{ min: 1 }}
                value={config.windowDays}
                onChange={(e) => setConfig((prev) => ({ ...prev, windowDays: Number(e.target.value) }))}
                InputProps={{
                  readOnly: !editingConfig,
                  endAdornment: (
                    <InputAdornment position="end">
                      <Button
                        size="small"
                        variant={editingConfig ? 'outlined' : 'text'}
                        onClick={() => setEditingConfig((prev) => !prev)}
                        sx={{ textTransform: 'none', minWidth: 72 }}
                      >
                        {editingConfig ? 'Done' : 'Edit'}
                      </Button>
                    </InputAdornment>
                  )
                }}
                fullWidth
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              System Prompt
            </Typography>
            <Button
              size="small"
              variant={editingPrompt ? 'outlined' : 'text'}
              onClick={() => setEditingPrompt((prev) => !prev)}
              sx={{ textTransform: 'none' }}
            >
              {editingPrompt ? 'Done' : 'Edit'}
            </Button>
          </Stack>

          <Box
            sx={{
              border: '1px solid #e2e8f0',
              borderRadius: 2,
              backgroundColor: '#f8fafc',
              p: 2
            }}
          >
            {editingPrompt ? (
              <TextField
                label="System Prompt"
                value={prompt.systemPrompt}
                onChange={(e) => setPrompt((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                fullWidth
                multiline
                minRows={8}
              />
            ) : (
              <Typography
                component="div"
                sx={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  color: '#0f172a',
                  lineHeight: 1.6,
                  fontSize: 15
                }}
              >
                {promptPreviewParts.map((part, idx) => (
                  <React.Fragment key={idx}>
                    {part}
                    {idx < promptPreviewParts.length - 1 && (
                      <Chip
                        component="span"
                        size="small"
                        label={String(windowDaysValue)}
                        color="info"
                        variant="outlined"
                        title="Window days"
                        sx={{
                          mx: 0.5,
                          fontWeight: 700,
                          backgroundColor: 'rgba(59, 130, 246, 0.08)',
                          borderColor: '#93c5fd',
                          verticalAlign: 'middle'
                        }}
                      />
                    )}
                  </React.Fragment>
                ))}
              </Typography>
            )}
          </Box>

          <Divider sx={{ my: 1 }} />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
            <Button variant="contained" onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={18} /> : null}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Baseball Card Sandbox
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Test the baseball card with the in-progress prompt/config above. Runs are sandboxed and do not save.
          </Typography>

          <Stack spacing={2}>
            <Autocomplete
              options={studentMatches}
              loading={studentsLoading}
              value={selectedStudent}
              onChange={(e, newValue) => setSelectedStudent(newValue)}
              inputValue={studentSearch}
              onInputChange={(e, newInputValue) => setStudentSearch(newInputValue)}
              getOptionLabel={getStudentLabel}
              fullWidth
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select student"
                  placeholder="Search student"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {studentsLoading ? <CircularProgress color="inherit" size={16} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            {selectedStudent && (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Selected: {getStudentLabel(selectedStudent)}
              </Typography>
            )}

            <Divider />

            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Playground overrides</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Window (days)"
                type="number"
                inputProps={{ min: 1 }}
                value={playgroundConfig.windowDays}
                onChange={handlePlaygroundFieldChange('windowDays', true)}
                fullWidth
              />
              <TextField
                label="Model"
                value={playgroundConfig.model}
                disabled
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Temperature"
                type="number"
                inputProps={{ step: 0.1, min: 0, max: 2 }}
                value={playgroundConfig.temperature}
                onChange={handlePlaygroundFieldChange('temperature', true)}
                fullWidth
              />
              <TextField
                label="Max tokens"
                type="number"
                inputProps={{ min: 50 }}
                value={playgroundConfig.max_tokens}
                onChange={handlePlaygroundFieldChange('max_tokens', true)}
                fullWidth
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <Button
                variant="contained"
                onClick={handleRunPlayground}
                disabled={playgroundRunning || !selectedStudent}
                startIcon={playgroundRunning ? <CircularProgress size={18} /> : null}
                sx={{ minWidth: 160 }}
              >
                {playgroundRunning ? 'Running…' : 'Run preview'}
              </Button>
              <Typography variant="body2" color="text.secondary">
                Uses the current prompt above (including any unsaved edits).
              </Typography>
            </Stack>

            {playgroundError && (
              <Typography variant="body2" color="error">
                {playgroundError}
              </Typography>
            )}

            {playgroundResult && (
              <Box
                sx={{
                  p: 2,
                  border: '1px solid #e2e8f0',
                  borderRadius: 2,
                  backgroundColor: '#f8fafc',
                  fontFamily: 'ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                }}
                component="pre"
              >
                {JSON.stringify(playgroundResult, null, 2)}
              </Box>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
