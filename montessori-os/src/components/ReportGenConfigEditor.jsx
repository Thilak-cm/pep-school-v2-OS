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
  Autocomplete,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import { isSuperAdmin } from '../utils/roleUtils';
import { REPORT_DEFAULTS, REPORT_PROMPT_DOCS } from '../../../scripts/config/reportConstants';
import { AVAILABLE_MODELS } from '../../../scripts/config/modelConstants';
import useNotify from '../notifications/useNotify';
import { fuzzySearchStudents } from '../utils/fuzzySearch';
import { friendlyFunctionError } from '../utils/cloudFunctionErrors';

const PROGRAM_OPTIONS = Object.entries(REPORT_PROMPT_DOCS).map(([id, docId]) => ({
  id,
  docId,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

function extractTemplateVars(text) {
  if (!text) return [];
  const matches = text.match(/<[A-Z_]+>/g);
  return matches ? [...new Set(matches)] : [];
}

function renderPromptWithChips(text) {
  if (!text) return null;
  const parts = text.split(/(<[A-Z_]+>)/g);
  return parts.map((part, idx) => {
    if (/^<[A-Z_]+>$/.test(part)) {
      return (
        <Chip
          key={idx}
          component="span"
          size="small"
          label={part}
          color="info"
          variant="outlined"
          sx={{
            mx: 0.5,
            fontWeight: 700,
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            borderColor: '#93c5fd',
            verticalAlign: 'middle',
          }}
        />
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export default function ReportGenConfigEditor({ currentUser, userRole }) {
  const isAdmin = isSuperAdmin(userRole);
  const notify = useNotify();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState({
    model: REPORT_DEFAULTS.model,
    temperature: REPORT_DEFAULTS.temperature,
    max_tokens: REPORT_DEFAULTS.max_tokens,
    timezone: REPORT_DEFAULTS.timezone,
  });

  const [programId, setProgramId] = useState(PROGRAM_OPTIONS[0]?.id || 'adolescent');
  const [prompt, setPrompt] = useState({ title: '', description: '', systemPrompt: '' });
  const [editingPrompt, setEditingPrompt] = useState(false);

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [playgroundConfig, setPlaygroundConfig] = useState({ ...config });
  const [playgroundTouched, setPlaygroundTouched] = useState(false);
  const [playgroundRunning, setPlaygroundRunning] = useState(false);
  const [playgroundError, setPlaygroundError] = useState('');
  const [playgroundResult, setPlaygroundResult] = useState(null);

  const promptDocId = useMemo(
    () => REPORT_PROMPT_DOCS[programId] || null,
    [programId],
  );

  const loadConfig = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true);
    try {
      const configSnap = await getDoc(doc(db, 'config', 'report_generation'));
      if (configSnap.exists()) {
        const data = configSnap.data() || {};
        setConfig({
          model: data.model || REPORT_DEFAULTS.model,
          temperature: Number.isFinite(data.temperature) ? data.temperature : REPORT_DEFAULTS.temperature,
          max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : REPORT_DEFAULTS.max_tokens,
          timezone: data.timezone || REPORT_DEFAULTS.timezone,
        });
      } else {
        setConfig({
          model: REPORT_DEFAULTS.model,
          temperature: REPORT_DEFAULTS.temperature,
          max_tokens: REPORT_DEFAULTS.max_tokens,
          timezone: REPORT_DEFAULTS.timezone,
        });
      }
    } catch {
      notify.error('Failed to load report config.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, notify]);

  const loadPrompt = useCallback(async () => {
    if (!isAdmin || !promptDocId) return;
    try {
      const snap = await getDoc(doc(db, 'ai_prompts', promptDocId));
      if (snap.exists()) {
        const data = snap.data() || {};
        setPrompt({
          title: data.title || '',
          description: data.description || '',
          systemPrompt: data.systemPrompt || '',
        });
      } else {
        setPrompt({ title: '', description: '', systemPrompt: '' });
      }
    } catch {
      notify.error(`Failed to load prompt for ${programId}.`);
    }
  }, [isAdmin, promptDocId, programId, notify]);

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
    } catch {
      notify.error('Failed to load students for playground.');
    } finally {
      setStudentsLoading(false);
    }
  }, [isAdmin, notify]);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadPrompt(); }, [loadPrompt]);
  useEffect(() => { loadStudents(); }, [loadStudents]);

  useEffect(() => {
    if (playgroundTouched) return;
    setPlaygroundConfig({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      timezone: config.timezone,
    });
  }, [config.model, config.temperature, config.max_tokens, config.timezone, playgroundTouched]);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const saves = [
        setDoc(doc(db, 'config', 'report_generation'), {
          model: config.model || REPORT_DEFAULTS.model,
          temperature: Number.isFinite(config.temperature) ? config.temperature : REPORT_DEFAULTS.temperature,
          max_tokens: Number.isFinite(config.max_tokens) ? config.max_tokens : REPORT_DEFAULTS.max_tokens,
          timezone: config.timezone || REPORT_DEFAULTS.timezone,
          updatedBy: currentUser?.uid || null,
          updatedAt: new Date(),
        }, { merge: true }),
      ];
      if (promptDocId) {
        saves.push(
          setDoc(doc(db, 'ai_prompts', promptDocId), {
            title: prompt.title || '',
            description: prompt.description || '',
            systemPrompt: prompt.systemPrompt || '',
            updatedBy: currentUser?.uid || null,
            updatedAt: new Date(),
          }, { merge: true }),
        );
      }
      await Promise.all(saves);
      notify.success('Report generation settings saved.');
    } catch {
      notify.error('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
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
      const call = httpsCallable(cloudFunctions, 'previewStudentReport', { timeout: 300_000 });
      const payload = {
        studentId: selectedStudent.id,
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
      setPlaygroundError(friendlyFunctionError(err));
    } finally {
      setPlaygroundRunning(false);
    }
  };

  const templateVars = useMemo(() => extractTemplateVars(prompt.systemPrompt), [prompt.systemPrompt]);
  const studentMatches = useMemo(() => fuzzySearchStudents(students, studentSearch).slice(0, 3), [students, studentSearch]);
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
        <Typography variant="body2" color="text.secondary">Loading report generation settings...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 900, width: '100%', mx: 'auto' }}>

      {/* Model Settings */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Model Settings</Typography>
          <Typography variant="body2" color="text.secondary">
            These settings apply to all report generation. Saved to <code>/config/report_generation</code>.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel id="report-model-label">Model</InputLabel>
              <Select
                labelId="report-model-label"
                value={config.model}
                label="Model"
                onChange={(e) => setConfig((p) => ({ ...p, model: e.target.value }))}
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
              label="Temperature"
              type="number"
              inputProps={{ step: 0.1, min: 0, max: 2 }}
              value={config.temperature}
              onChange={(e) => setConfig((p) => ({ ...p, temperature: e.target.value === '' ? '' : Number(e.target.value) }))}
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Max tokens"
              type="number"
              inputProps={{ min: 50 }}
              value={config.max_tokens}
              onChange={(e) => setConfig((p) => ({ ...p, max_tokens: e.target.value === '' ? '' : Number(e.target.value) }))}
              fullWidth
            />
            <TextField
              label="Timezone"
              value={config.timezone}
              onChange={(e) => setConfig((p) => ({ ...p, timezone: e.target.value }))}
              fullWidth
            />
          </Stack>
        </CardContent>
      </Card>

      {/* Program Prompt */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Program Prompt</Typography>
            <Button
              size="small"
              variant={editingPrompt ? 'outlined' : 'text'}
              onClick={() => setEditingPrompt((prev) => !prev)}
              sx={{ textTransform: 'none' }}
            >
              {editingPrompt ? 'Done' : 'Edit'}
            </Button>
          </Stack>

          <TextField
            select
            label="Program"
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            sx={{ maxWidth: 260 }}
          >
            {PROGRAM_OPTIONS.map((opt) => (
              <MenuItem key={opt.id} value={opt.id}>{opt.label}</MenuItem>
            ))}
          </TextField>

          {templateVars.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
              <Typography variant="caption" color="text.secondary">Template variables:</Typography>
              {templateVars.map((v) => (
                <Chip key={v} label={v} size="small" color="info" variant="outlined" />
              ))}
            </Stack>
          )}

          <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, backgroundColor: '#f8fafc', p: 2 }}>
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
                sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#0f172a', lineHeight: 1.6, fontSize: 15 }}
              >
                {renderPromptWithChips(prompt.systemPrompt) || (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No prompt loaded. Select a program above.
                  </Typography>
                )}
              </Typography>
            )}
          </Box>

          <Typography variant="caption" color="text.secondary">
            Note: A JSON output schema wrapper is automatically appended when generating reports. It is not shown here.
          </Typography>

          <Divider sx={{ my: 1 }} />
        </CardContent>
      </Card>

      {/* Playground */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Report Playground</Typography>
          <Typography variant="body2" color="text.secondary">
            Test report generation with the in-progress prompt/config. Runs are sandboxed and do not save a report.
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
              <FormControl fullWidth size="small" disabled>
                <InputLabel id="report-playground-model-label">Model</InputLabel>
                <Select
                  labelId="report-playground-model-label"
                  value={playgroundConfig.model}
                  label="Model"
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
                label="Temperature"
                type="number"
                inputProps={{ step: 0.1, min: 0, max: 2 }}
                value={playgroundConfig.temperature}
                onChange={handlePlaygroundFieldChange('temperature', true)}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
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
                {playgroundRunning ? 'Running...' : 'Run preview'}
              </Button>
              <Typography variant="body2" color="text.secondary">
                Preview + raw response
              </Typography>
            </Stack>

            {playgroundError && (
              <Typography variant="body2" color="error">{playgroundError}</Typography>
            )}

            {playgroundResult && (
              <Stack spacing={2}>
                <Box sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: 2, backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Report Preview</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line', color: '#334155' }}>
                    {playgroundResult.reportText || '(empty report)'}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip label={`Sentiment: ${playgroundResult.sentimentScore ?? '—'}`} size="small" variant="outlined" />
                    <Chip label={`Balance: ${playgroundResult.areaBalanceScore ?? '—'}`} size="small" variant="outlined" />
                    <Chip label={`Notes: ${playgroundResult.noteCount ?? 0}`} size="small" variant="outlined" />
                    <Chip label={`Model: ${playgroundResult.model || '—'}`} size="small" variant="outlined" />
                  </Stack>
                  {Array.isArray(playgroundResult.missingInputFlags) && playgroundResult.missingInputFlags.length > 0 && (
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Missing inputs:</Typography>
                      {playgroundResult.missingInputFlags.map((flag, idx) => (
                        <Chip key={`flag-${idx}`} label={flag} size="small" color="warning" variant="outlined" />
                      ))}
                    </Stack>
                  )}
                </Box>

                <Box
                  sx={{
                    p: 2,
                    border: '1px solid #e2e8f0',
                    borderRadius: 2,
                    backgroundColor: '#f8fafc',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                  component="pre"
                >
                  {JSON.stringify(playgroundResult, null, 2)}
                </Box>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end" sx={{ mt: -1 }}>
        <Button variant="contained" onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={18} /> : null}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Stack>
    </Box>
  );
}
