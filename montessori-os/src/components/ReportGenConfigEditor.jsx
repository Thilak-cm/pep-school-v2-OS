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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RestoreIcon from '@mui/icons-material/Restore';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import { isSuperAdmin } from '../utils/roleUtils';
import { REPORT_DEFAULTS, REPORT_PROMPT_DOCS } from '../../../scripts/config/reportConstants';
import { AVAILABLE_MODELS } from '../../../scripts/config/modelConstants';
import useNotify from '../notifications/useNotify';
import { fuzzySearchStudents } from '../utils/fuzzySearch';
import { friendlyFunctionError } from '../utils/cloudFunctionErrors';

const MAX_HISTORY = 10;

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

function countLines(text) {
  if (!text) return 0;
  return text.split('\n').length;
}

const sectionHeaderSx = {
  fontWeight: 700,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  color: '#64748b',
  mb: 1,
  mt: 0.5,
};

const accordionSx = {
  border: '1px solid #e2e8f0',
  borderRadius: '12px !important',
  boxShadow: 'none',
  '&:before': { display: 'none' },
  '&.Mui-expanded': { margin: 0 },
};

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
  const [prompt, setPrompt] = useState({ title: '', description: '', staticSystemPrompt: '', dynamicSystemPrompt: '' });
  const [promptDocState, setPromptDocState] = useState(null); // full Firestore doc state for version history
  const [editingField, setEditingField] = useState(null); // 'static' | 'dynamic' | null
  const [changeNote, setChangeNote] = useState('');

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
        setPromptDocState({ id: snap.id, ...data });
        setPrompt({
          title: data.title || '',
          description: data.description || '',
          staticSystemPrompt: data.staticSystemPrompt || '',
          dynamicSystemPrompt: data.dynamicSystemPrompt || '',
        });
      } else {
        setPromptDocState(null);
        setPrompt({ title: '', description: '', staticSystemPrompt: '', dynamicSystemPrompt: '' });
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
      const now = serverTimestamp();
      const updatedBy = {
        uid: currentUser?.uid || '',
        email: currentUser?.email || '',
        name: currentUser?.displayName || '',
      };

      const saves = [
        setDoc(doc(db, 'config', 'report_generation'), {
          model: config.model || REPORT_DEFAULTS.model,
          temperature: Number.isFinite(config.temperature) ? config.temperature : REPORT_DEFAULTS.temperature,
          max_tokens: Number.isFinite(config.max_tokens) ? config.max_tokens : REPORT_DEFAULTS.max_tokens,
          timezone: config.timezone || REPORT_DEFAULTS.timezone,
          updatedBy: currentUser?.uid || null,
          updatedAt: now,
        }, { merge: true }),
      ];

      if (promptDocId) {
        const curr = promptDocState || { version: 0, versions: [] };
        const prevSnapshot = (curr.staticSystemPrompt || curr.dynamicSystemPrompt) ? {
          version: curr.version || 1,
          staticSystemPrompt: curr.staticSystemPrompt || '',
          dynamicSystemPrompt: curr.dynamicSystemPrompt || '',
          updatedAt: now,
          updatedBy,
          changeNote: changeNote || 'Updated prompts',
        } : null;
        const newVersions = [
          ...(prevSnapshot ? [prevSnapshot] : []),
          ...((curr.versions || []).slice(0, MAX_HISTORY - (prevSnapshot ? 1 : 0))),
        ];

        const promptPayload = {
          title: prompt.title || '',
          description: prompt.description || '',
          staticSystemPrompt: prompt.staticSystemPrompt || '',
          dynamicSystemPrompt: prompt.dynamicSystemPrompt || '',
          version: (curr.version || 1) + 1,
          updatedAt: now,
          updatedBy,
          versions: newVersions,
        };

        if (promptDocState) {
          saves.push(updateDoc(doc(db, 'ai_prompts', promptDocId), promptPayload));
        } else {
          saves.push(setDoc(doc(db, 'ai_prompts', promptDocId), { ...promptPayload, version: 1, versions: [] }));
        }
      }

      await Promise.all(saves);

      // Reload prompt doc state after save
      if (promptDocId) {
        const snap = await getDoc(doc(db, 'ai_prompts', promptDocId));
        if (snap.exists()) setPromptDocState({ id: snap.id, ...(snap.data() || {}) });
      }

      setEditingField(null);
      setChangeNote('');
      notify.success('Report generation settings saved.');
    } catch {
      notify.error('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async (versionItem) => {
    if (!isAdmin || !promptDocState || !promptDocId) return;
    setSaving(true);
    try {
      const now = serverTimestamp();
      const updatedBy = {
        uid: currentUser?.uid || '',
        email: currentUser?.email || '',
        name: currentUser?.displayName || '',
      };
      const curr = promptDocState;
      const prevSnapshot = {
        version: curr.version || 1,
        staticSystemPrompt: curr.staticSystemPrompt || '',
        dynamicSystemPrompt: curr.dynamicSystemPrompt || '',
        updatedAt: now,
        updatedBy,
        changeNote: `Revert to v${versionItem?.version || ''}`,
      };
      const newVersions = [prevSnapshot, ...(curr.versions || []).filter((v) => v !== versionItem)].slice(0, MAX_HISTORY);

      const payload = {
        staticSystemPrompt: versionItem.staticSystemPrompt || '',
        dynamicSystemPrompt: versionItem.dynamicSystemPrompt || '',
        version: (curr.version || 1) + 1,
        updatedAt: now,
        updatedBy,
        versions: newVersions,
      };
      await updateDoc(doc(db, 'ai_prompts', promptDocId), payload);

      const snap = await getDoc(doc(db, 'ai_prompts', promptDocId));
      if (snap.exists()) setPromptDocState({ id: snap.id, ...(snap.data() || {}) });
      setPrompt((prev) => ({
        ...prev,
        staticSystemPrompt: payload.staticSystemPrompt,
        dynamicSystemPrompt: payload.dynamicSystemPrompt,
      }));
      setEditingField(null);
      notify.success(`Reverted to v${versionItem?.version || ''}.`);
    } catch {
      notify.error('Failed to revert prompt.');
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
      // Sending prompt fields as overrides bypasses the server-side reportPromptCache,
      // so the preview always uses the latest editor values even right after a save.
      const payload = {
        studentId: selectedStudent.id,
        staticSystemPrompt: prompt.staticSystemPrompt,
        dynamicSystemPrompt: prompt.dynamicSystemPrompt,
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

  const allPromptText = prompt.staticSystemPrompt + prompt.dynamicSystemPrompt;
  const templateVars = useMemo(() => extractTemplateVars(allPromptText), [allPromptText]);
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

      {/* Context Window */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Context Window</Typography>
            <TextField
              select
              label="Program"
              value={programId}
              onChange={(e) => { setProgramId(e.target.value); setEditingField(null); }}
              size="small"
              sx={{ minWidth: 160 }}
            >
              {PROGRAM_OPTIONS.map((opt) => (
                <MenuItem key={opt.id} value={opt.id}>{opt.label}</MenuItem>
              ))}
            </TextField>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Everything the LLM receives when generating a report. Editable blocks can be modified; info blocks are assembled at generation time.
          </Typography>

          {templateVars.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
              <Typography variant="caption" color="text.secondary">Template variables:</Typography>
              {templateVars.map((v) => (
                <Chip key={v} label={v} size="small" color="info" variant="outlined" />
              ))}
            </Stack>
          )}

          {/* — System Message Section — */}
          <Typography sx={sectionHeaderSx}>System Message</Typography>

          {/* Static System Prompt */}
          <Accordion
            sx={accordionSx}
            expanded={editingField === 'static'}
            onChange={(_, expanded) => setEditingField(expanded ? 'static' : null)}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ px: 2, '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 } }}
            >
              <LockOutlinedIcon sx={{ fontSize: 18, color: '#6366f1' }} />
              <Typography sx={{ fontWeight: 600, flex: 1 }}>Static System Prompt</Typography>
              <Chip
                label={prompt.staticSystemPrompt ? `${countLines(prompt.staticSystemPrompt)} lines` : 'empty'}
                size="small"
                variant="outlined"
                sx={{ mr: 1, fontSize: 11 }}
              />
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); setEditingField(editingField === 'static' ? null : 'static'); }}
                sx={{ color: '#6366f1' }}
              >
                <EditOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0 }}>
              <TextField
                value={prompt.staticSystemPrompt}
                onChange={(e) => setPrompt((prev) => ({ ...prev, staticSystemPrompt: e.target.value }))}
                fullWidth
                multiline
                minRows={8}
                maxRows={30}
                placeholder="Core report generation instructions (persona, structure, scoring rubrics...)"
                sx={{ '& .MuiInputBase-root': { fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6 } }}
              />
            </AccordionDetails>
          </Accordion>

          {/* Collapsed preview — kept as sibling because AccordionDetails is hidden when collapsed */}
          {editingField !== 'static' && prompt.staticSystemPrompt && (
            <Box sx={{ px: 2, mt: -1.5 }}>
              <Typography variant="body2" sx={{
                color: '#94a3b8',
                fontStyle: 'italic',
                fontSize: 13,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {prompt.staticSystemPrompt}
              </Typography>
            </Box>
          )}

          {/* Dynamic System Prompt */}
          <Accordion
            sx={accordionSx}
            expanded={editingField === 'dynamic'}
            onChange={(_, expanded) => setEditingField(expanded ? 'dynamic' : null)}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ px: 2, '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 } }}
            >
              <EditOutlinedIcon sx={{ fontSize: 18, color: '#10b981' }} />
              <Typography sx={{ fontWeight: 600, flex: 1 }}>Dynamic System Prompt</Typography>
              <Chip
                label={prompt.dynamicSystemPrompt ? `${countLines(prompt.dynamicSystemPrompt)} lines` : 'empty'}
                size="small"
                variant="outlined"
                sx={{ mr: 1, fontSize: 11 }}
              />
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); setEditingField(editingField === 'dynamic' ? null : 'dynamic'); }}
                sx={{ color: '#10b981' }}
              >
                <EditOutlinedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0 }}>
              <TextField
                value={prompt.dynamicSystemPrompt}
                onChange={(e) => setPrompt((prev) => ({ ...prev, dynamicSystemPrompt: e.target.value }))}
                fullWidth
                multiline
                minRows={4}
                maxRows={20}
                placeholder="Glossary, context-specific instructions, classroom-level customizations..."
                sx={{ '& .MuiInputBase-root': { fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6 } }}
              />
            </AccordionDetails>
          </Accordion>

          {editingField !== 'dynamic' && prompt.dynamicSystemPrompt && (
            <Box sx={{ px: 2, mt: -1.5 }}>
              <Typography variant="body2" sx={{
                color: '#94a3b8',
                fontStyle: 'italic',
                fontSize: 13,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {prompt.dynamicSystemPrompt}
              </Typography>
            </Box>
          )}

          <TextField
            label="Change note (optional)"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            size="small"
            fullWidth
            placeholder="e.g. Added glossary terms for primary program"
            sx={{ mt: 0.5 }}
          />

          <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
            A JSON output schema wrapper is automatically appended after both prompts at generation time.
          </Typography>

          {/* Version History */}
          <Box sx={{ mt: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>History (last {MAX_HISTORY})</Typography>
            {!promptDocState?.versions?.length && (
              <Typography variant="body2" sx={{ color: '#64748b' }}>No prior versions.</Typography>
            )}
            {promptDocState?.versions?.length > 0 && (
              <List dense>
                {promptDocState.versions.map((v, idx) => (
                  <ListItem key={`${v.version}-${idx}`} divider>
                    <ListItemText
                      primary={`v${v.version || '?'} — ${v.changeNote || 'Updated'}`}
                      secondary={(v.updatedBy?.email || v.updatedBy?.name) ? `${v.updatedBy?.name || ''} ${v.updatedBy?.email || ''}` : ''}
                    />
                    <ListItemSecondaryAction>
                      <Button size="small" startIcon={<RestoreIcon />} onClick={() => handleRevert(v)} disabled={saving}>Revert</Button>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          <Divider sx={{ my: 0.5 }} />

          {/* — User Message Section — */}
          <Typography sx={sectionHeaderSx}>User Message</Typography>

          {/* Student Context */}
          <Box sx={{ ...accordionSx, px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <InfoOutlinedIcon sx={{ fontSize: 18, color: '#f59e0b' }} />
              <Typography sx={{ fontWeight: 600, flex: 1 }}>Student Context</Typography>
              <Chip label="auto-injected" size="small" color="default" variant="outlined" sx={{ fontSize: 11 }} />
            </Stack>
            <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13 }}>
              Student name, date of birth, and age are injected from the student profile at generation time.
            </Typography>
            <Box sx={{ backgroundColor: '#f8fafc', borderRadius: 1, px: 1.5, py: 1, fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>
              {'Student: {"studentName":"Aarav Sharma","dob":"15 March 2019","age":"6 years 11 months"}'}
            </Box>
          </Box>

          {/* Student Observations */}
          <Box sx={{ ...accordionSx, px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <InfoOutlinedIcon sx={{ fontSize: 18, color: '#f59e0b' }} />
              <Typography sx={{ fontWeight: 600, flex: 1 }}>Student Observations</Typography>
              <Chip label="auto-injected" size="small" color="default" variant="outlined" sx={{ fontSize: 11 }} />
            </Stack>
            <Typography variant="body2" sx={{ color: '#64748b', fontSize: 13 }}>
              All observations for the selected date range are injected as a JSON array at generation time.
            </Typography>
          </Box>

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
