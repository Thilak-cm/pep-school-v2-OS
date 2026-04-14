import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, TextField, Divider,
  Alert, CircularProgress, Chip, ListItemButton, Collapse,
  FormControl, InputLabel, Select, MenuItem, FormControlLabel, Switch
} from '@mui/material';
import { Settings, Bolt, ExpandMore, ExpandLess, Save, Cancel } from '@mui/icons-material';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, cloudFunctions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import useNotify from '../notifications/useNotify';
import { COACH_MODEL_INFO } from '../../../scripts/config/coachConstants';
import { AVAILABLE_MODELS } from '../../../scripts/config/modelConstants';
import { isSuperAdmin } from '../utils/roleUtils';

const SectionCard = ({ title, subtitle, children }) => (
  <Card sx={{ borderRadius: 2, mb: 2 }}>
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

// All possible nudge types
const ALL_NUDGES = ['duration', 'modality', 'independence', 'evidence', 'subjective'];

export default function AICoachEditor({ currentUser, userRole }) {
  const isAdmin = isSuperAdmin(userRole);
  const notify = useNotify();

  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docState, setDocState] = useState(null);
  const [enabledNudges, setEnabledNudges] = useState([]);
  const [maxReturnNudges, setMaxReturnNudges] = useState(1);
  const [saving, setSaving] = useState(false);
  const [programId, setProgramId] = useState('toddler');
  const [coachEnabled, setCoachEnabled] = useState(true);
  
  // Track original values to detect changes
  const [originalEnabledNudges, setOriginalEnabledNudges] = useState([]);
  const [originalMaxReturnNudges, setOriginalMaxReturnNudges] = useState(1);
  const [originalCoachEnabled, setOriginalCoachEnabled] = useState(true);
  const [originalModel, setOriginalModel] = useState(COACH_MODEL_INFO.model);
  const [originalTemperature, setOriginalTemperature] = useState(COACH_MODEL_INFO.temperature);
  
  // Collapsible section states
  const [coachConfigExpanded, setCoachConfigExpanded] = useState(true); // Default to true since it's the main editing section
  const [introExpanded, setIntroExpanded] = useState(false);
  const [nudgeBlocksExpanded, setNudgeBlocksExpanded] = useState(false);
  const [finalPromptExpanded, setFinalPromptExpanded] = useState(false);
  
  // Coach test run states
  const [noteText, setNoteText] = useState('');
  const [coachResult, setCoachResult] = useState(null);
  const [runningCoach, setRunningCoach] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [coachError, setCoachError] = useState('');
  const [model, setModel] = useState(COACH_MODEL_INFO.model);
  const [temperature, setTemperature] = useState(COACH_MODEL_INFO.temperature);

  const coachRef = useMemo(() => doc(db, 'config', `coach_${programId}`), [programId]);

  // Load initial data from Firestore
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const snap = await getDoc(coachRef);
        if (snap.exists()) {
          const data = snap.data() || {};
          setDocState({ id: snap.id, ...data });
          const initialEnabledNudges = data.enabledNudges || [];
          const initialMaxReturnNudges = data.maxReturnNudges || 1;
          setEnabledNudges(initialEnabledNudges);
          setMaxReturnNudges(initialMaxReturnNudges);
          const initialCoachEnabled = data.coach_feature_enable === true;
          setCoachEnabled(initialCoachEnabled);
          setOriginalEnabledNudges(initialEnabledNudges);
          setOriginalMaxReturnNudges(initialMaxReturnNudges);
          setOriginalCoachEnabled(initialCoachEnabled);
          const initialModel = data.model || COACH_MODEL_INFO.model;
          const initialTemp = typeof data.temperature === 'number' ? data.temperature : COACH_MODEL_INFO.temperature;
          setModel(initialModel);
          setTemperature(initialTemp);
          setOriginalModel(initialModel);
          setOriginalTemperature(initialTemp);
        } else {
          setDocState(null);
          setEnabledNudges([]);
          setMaxReturnNudges(1);
          setCoachEnabled(false);
          setOriginalEnabledNudges([]);
          setOriginalMaxReturnNudges(1);
          setOriginalCoachEnabled(false);
          setModel(COACH_MODEL_INFO.model);
          setTemperature(COACH_MODEL_INFO.temperature);
          setOriginalModel(COACH_MODEL_INFO.model);
          setOriginalTemperature(COACH_MODEL_INFO.temperature);
          setError('Coach prompt configuration not found for this program');
        }
      } catch {
        setDocState(null);
        setEnabledNudges([]);
        setMaxReturnNudges(1);
        setCoachEnabled(false);
        setOriginalEnabledNudges([]);
        setOriginalMaxReturnNudges(1);
        setOriginalCoachEnabled(false);
        setError('Failed to load coach prompt configuration');
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, coachRef]);

  // Save function for updating Firestore
  const handleSave = async () => {
    if (!isAdmin || !docState) return;
    
    try {
      setSaving(true);
      setError('');
      
      // Calculate disabledNudges from current enabledNudges
      const disabledNudges = ALL_NUDGES.filter(n => !enabledNudges.includes(n));
      
      // Compose finalPrompt from enabled nudges and configured nudgeBlocks
      const composeFinalPrompt = (enabled) => {
        if (!enabled || enabled.length === 0) return '';
        const nb = (docState && docState.nudgeBlocks) || {};
        const blocks = [];
        if (enabled.includes('duration') && nb.duration) blocks.push(nb.duration);
        if (enabled.includes('modality') && nb.modality) blocks.push(nb.modality);
        if (enabled.includes('independence') && nb.independence) blocks.push(nb.independence);
        if (enabled.includes('evidence') && nb.evidence) blocks.push(nb.evidence);
        if (enabled.includes('subjective') && nb.subjective) blocks.push(nb.subjective);
        const allowedIds = enabled.join(' | ');
        const nudgeBlocksText = blocks.join('\n\n');
        const intro = `You are Coach Pepper, a Montessori observation coach that inspects one teacher note and identifies objective information gaps.\n\nHow to respond\n- Read the note carefully and understand its meaning.\n- Evaluate each nudge type independently — whether or not another applies.\n- A note may trigger multiple nudges at once; include all that clearly fit.\n- If no nudge fits confidently, return an empty array.\n- Output strict JSON with top-level "nudges", which is an array of objects.  \n   Each object must include exactly:\n   - "id": string (the nudge type) - must be one of: ${allowedIds}\n   - "reason": short explanation of what's missing\n   - "confidence": numeric value between 0 and 1\n\nExample outputs:\n1. \n   {\n     "nudges": [\n       { "id": "duration", "reason": "Missing time range.", "confidence": 0.8 },\n       { "id": "modality", "reason": "No activity method specified.", "confidence": 0.6 },\n       { "id": "subjective", "reason": "Includes emotional adjective without objective observation.", "confidence": 0.7 }\n     ]\n   }\n2. \n   {\n     "nudges": []\n   }`;
        const tail = `\n\nNudge types and triggers:\n${nudgeBlocksText}\n`;
        return `${intro}${tail}`;
      };

      const finalPrompt = composeFinalPrompt(enabledNudges);
      const introBlock = finalPrompt ? finalPrompt.split('\n\nNudge types and triggers')[0] : '';

      const payload = {
        enabledNudges,
        maxReturnNudges,
        disabledNudges,
        coach_feature_enable: coachEnabled === true,
        programId,
        introBlock,
        finalPrompt,
        model,
        temperature,
        updatedAt: serverTimestamp(),
        updatedBy: {
          uid: currentUser?.uid || '',
          email: currentUser?.email || '',
          name: currentUser?.displayName || '',
        }
      };

      await updateDoc(coachRef, payload);
      
      // Reload to get updated document
      const snap = await getDoc(coachRef);
      if (snap.exists()) {
        const updatedData = snap.data();
        setDocState({ id: snap.id, ...updatedData });
        // Update original values to mark as saved
        setOriginalEnabledNudges(enabledNudges);
        setOriginalMaxReturnNudges(maxReturnNudges);
        setOriginalCoachEnabled(coachEnabled);
        setOriginalModel(model);
        setOriginalTemperature(temperature);
      }
      
      // Show success notification
      notify.success('Coach prompt configuration saved successfully');
    } catch {
      setError('Failed to update coach prompt configuration');
      notify.error('Failed to save coach prompt configuration');
    } finally {
      setSaving(false);
    }
  };

  // Handle nudge toggle
  const handleNudgeToggle = (nudgeId) => {
    const newEnabledNudges = enabledNudges.includes(nudgeId)
      ? enabledNudges.filter(n => n !== nudgeId)
      : [...enabledNudges, nudgeId];
    
    setEnabledNudges(newEnabledNudges);
  };

  // Handle maxReturnNudges change
  const handleMaxReturnNudgesChange = (event) => {
    const value = parseInt(event.target.value, 10);
    if (!isNaN(value) && value >= 1) {
      // Cap at total number of nudges
      const maxAllowed = ALL_NUDGES.length;
      setMaxReturnNudges(Math.min(value, maxAllowed));
    }
  };

  // Handle cancel - reset to original values
  const handleCancel = () => {
    setEnabledNudges([...originalEnabledNudges]);
    setMaxReturnNudges(originalMaxReturnNudges);
    setCoachEnabled(originalCoachEnabled);
    setModel(originalModel);
    setTemperature(originalTemperature);
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges =
    JSON.stringify(enabledNudges.sort()) !== JSON.stringify(originalEnabledNudges.sort()) ||
    maxReturnNudges !== originalMaxReturnNudges ||
    coachEnabled !== originalCoachEnabled ||
    model !== originalModel ||
    temperature !== originalTemperature;

  // Handle Coach test run
  const handleRunCoach = async () => {
    if (!noteText.trim()) {
      setCoachError('Please enter observation text to test');
      return;
    }

    setRunningCoach(true);
    setCoachError('');
    setCoachResult(null);
    setShowRawJson(false);

    try {
      const trimmedText = noteText.trim();
      if (!trimmedText) {
        setCoachError('Please enter observation text to test');
        setRunningCoach(false);
        return;
      }

      const call = httpsCallable(cloudFunctions, 'aiCoachReview');
      const payload = { noteText: trimmedText, programId };
      const result = await call(payload);
      setCoachResult(result.data);
    } catch (error) {
      // Swallow detailed logs; surface clean error to UI
      // Extract Firebase error message properly
      const errorMessage = error?.code === 'functions/invalid-argument' 
        ? error?.message || 'Invalid request. Please check your input.'
        : error?.message || 'Failed to run coach review';
      setCoachError(errorMessage);
    } finally {
      setRunningCoach(false);
    }
  };

  if (!isAdmin) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Access denied. Admins only.</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', gap: 2, flexDirection: 'column' }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Coach Pepper is loading coach settings...
        </Typography>
      </Box>
    );
  }

  // Count based on original/saved enabled nudges, not current working state
  const enabledNudgeBlocksCount = originalEnabledNudges.filter(n => docState?.nudgeBlocks?.[n]).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Coach Configuration Section - Collapsible */}
      <Card sx={{ borderRadius: 2, mb: 2 }}>
        <ListItemButton
          onClick={() => setCoachConfigExpanded(!coachConfigExpanded)}
          sx={{ borderRadius: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>Coach Configuration</Typography>
          {hasUnsavedChanges && (
            <Chip 
              label="Unsaved changes" 
              size="small" 
              color="warning" 
              variant="outlined"
              sx={{ mr: 1 }}
            />
          )}
          {coachConfigExpanded ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={coachConfigExpanded}>
          <CardContent>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 3 }}>
              Configure program settings, coach features, and nudges
            </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Program Selector and Enable Toggle */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Program Settings</Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'nowrap', mt: 1 }}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel id="coach-program-select-label">Program</InputLabel>
                <Select
                  labelId="coach-program-select-label"
                  id="coach-program-select"
                  value={programId}
                  label="Program"
                  onChange={(e) => setProgramId(e.target.value)}
                  disabled={saving}
                >
                  <MenuItem value="toddler">toddler</MenuItem>
                  <MenuItem value="primary">primary</MenuItem>
                  <MenuItem value="elementary">elementary</MenuItem>
                  <MenuItem value="adolescent">adolescent</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel
                control={<Switch checked={coachEnabled} onChange={(e) => setCoachEnabled(e.target.checked)} disabled={saving} />}
                label={coachEnabled ? 'Coach enabled' : 'Coach disabled'}
              />
            </Box>
          </Box>

          <Divider />

          {/* Coach Nudges */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Coach Nudges</Typography>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel id="coach-model-label">Model</InputLabel>
                  <Select
                    labelId="coach-model-label"
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
                  label="Temp"
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  onWheel={(e) => e.target.blur()}
                  disabled={saving}
                  size="small"
                  sx={{ width: 80 }}
                  inputProps={{ min: 0, max: 2, step: 0.1 }}
                />
              </Box>
            </Box>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
              Toggle which nudges Coach can suggest. Disabled nudges are omitted from the system prompt.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
              {ALL_NUDGES.map((nudgeId) => {
                const isEnabled = enabledNudges.includes(nudgeId);
                return (
                  <Chip
                    key={nudgeId}
                    label={nudgeId}
                    clickable
                    onClick={() => handleNudgeToggle(nudgeId)}
                    color={isEnabled ? 'success' : 'error'}
                    variant={isEnabled ? 'filled' : 'outlined'}
                    disabled={saving}
                    sx={{
                      textDecoration: isEnabled ? 'none' : 'line-through',
                      '&:hover': {
                        cursor: (saving) ? 'not-allowed' : 'pointer'
                      }
                    }}
                  />
                );
              })}
            </Box>
          </Box>

          {/* Maximum Return Nudges */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Maximum Return Nudges</Typography>
            <TextField
              type="number"
              onWheel={(e) => e.target.blur()}
              value={maxReturnNudges}
              onChange={handleMaxReturnNudgesChange}
              slotProps={{ input: { min: 1, max: ALL_NUDGES.length, step: 1 } }}
              size="small"
              disabled={saving}
              sx={{ maxWidth: '120px' }}
            />
          </Box>

          <Divider />

          {/* Save/Cancel Buttons */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, pt: 1 }}>
            <Button
              variant="outlined"
              startIcon={<Cancel />}
              onClick={handleCancel}
              disabled={!hasUnsavedChanges || saving}
              color="error"
              sx={{ textTransform: 'none', minWidth: '100px' }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={handleSave}
              disabled={!hasUnsavedChanges || saving}
              sx={{ textTransform: 'none', minWidth: '100px' }}
            >
              Save
            </Button>
          </Box>
            </Box>
          </CardContent>
        </Collapse>
      </Card>

      {/* Collapsible Sections */}
      {/* Intro Block */}
      <Card sx={{ borderRadius: 2, mb: 2 }}>
        <ListItemButton
          onClick={() => setIntroExpanded(!introExpanded)}
          sx={{ borderRadius: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>Intro</Typography>
          {introExpanded ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={introExpanded}>
          <CardContent>
            <Box
              component="pre"
              sx={{
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                p: 1.5,
                bgcolor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 1,
                fontSize: '0.875rem'
              }}
            >
              {docState?.introBlock || '—'}
            </Box>
          </CardContent>
        </Collapse>
      </Card>

      {/* Nudge Blocks */}
      <Card sx={{ borderRadius: 2, mb: 2 }}>
        <ListItemButton
          onClick={() => setNudgeBlocksExpanded(!nudgeBlocksExpanded)}
          sx={{ borderRadius: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>Nudge Blocks</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mr: 1 }}>
            {enabledNudgeBlocksCount} enabled
          </Typography>
          {nudgeBlocksExpanded ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={nudgeBlocksExpanded}>
          <CardContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {ALL_NUDGES.map((nudgeId) => {
                const isEnabled = enabledNudges.includes(nudgeId);
                const nudgeBlock = docState?.nudgeBlocks?.[nudgeId];
                
                return (
                  <Box
                    key={nudgeId}
                    sx={{
                      p: 2,
                      border: `2px solid ${isEnabled ? '#059669' : '#e2e8f0'}`,
                      borderRadius: 1,
                      bgcolor: isEnabled ? '#f0fdf4' : '#f8fafc'
                    }}
                  >
                    <Chip
                      label={isEnabled ? nudgeId : `${nudgeId} (disabled)`}
                      size="small"
                      color={isEnabled ? 'success' : 'default'}
                      variant={isEnabled ? 'filled' : 'outlined'}
                      sx={{ mb: 1 }}
                    />
                    <Typography variant="body2" sx={{ color: isEnabled ? '#1e293b' : '#94a3b8' }}>
                      {nudgeBlock ? `• ${nudgeBlock}` : 'Not configured'}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Collapse>
      </Card>

      {/* Final Composed Prompt */}
      <Card sx={{ borderRadius: 2, mb: 2 }}>
        <ListItemButton
          onClick={() => setFinalPromptExpanded(!finalPromptExpanded)}
          sx={{ borderRadius: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>Final Composed Prompt</Typography>
          {finalPromptExpanded ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={finalPromptExpanded}>
          <CardContent>
            <Box
              component="pre"
              sx={{
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                p: 1.5,
                bgcolor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 1,
                fontSize: '0.875rem'
              }}
            >
              {docState?.finalPrompt || '—'}
            </Box>
          </CardContent>
        </Collapse>
      </Card>

      {/* Test Run Section */}
      <SectionCard title="Test Run" subtitle="Test Coach on sample observation text">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            multiline
            minRows={4}
            placeholder="Paste an observation to get nudges..."
            value={noteText}
            onChange={(e) => {
              setNoteText(e.target.value);
              setCoachError('');
              setCoachResult(null);
            }}
            disabled={runningCoach || saving}
            sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
          />
          
          {coachError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {coachError}
            </Alert>
          )}

          {coachResult && (
            <Card sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Coach Response
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => setShowRawJson(!showRawJson)}
                    sx={{ textTransform: 'none' }}
                  >
                    {showRawJson ? 'Hide' : 'View'} Raw JSON
                  </Button>
                </Box>

                {showRawJson ? (
                  <Box
                    component="pre"
                    sx={{
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      p: 1.5,
                      bgcolor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 1,
                      fontSize: '0.75rem',
                      maxHeight: '400px',
                      overflow: 'auto'
                    }}
                  >
                    {coachResult.rawResponse || JSON.stringify(coachResult, null, 2)}
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {coachResult.nudges && coachResult.nudges.length > 0 ? (
                      coachResult.nudges.map((nudge, index) => (
                        <Card
                          key={index}
                          sx={{
                            p: 1.5,
                            bgcolor: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 1
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                            <Chip
                              label={nudge.id}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                              Confidence: {(nudge.confidence * 100).toFixed(0)}%
                            </Typography>
                          </Box>
                          <Typography variant="body2" sx={{ color: '#1e293b' }}>
                            {nudge.reason}
                          </Typography>
                        </Card>
                      ))
                    ) : (
                      <Typography variant="body2" sx={{ color: '#64748b', fontStyle: 'italic' }}>
                        {coachEnabled
                          ? 'No nudges identified. The observation looks complete!'
                          : 'Coach is disabled for this program. Enable it above to run a test and see nudges.'}
                      </Typography>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={runningCoach ? <CircularProgress size={16} /> : <Bolt />}
              onClick={handleRunCoach}
              disabled={runningCoach || saving || !noteText.trim()}
              sx={{ textTransform: 'none' }}
            >
              {runningCoach ? 'Running Coach...' : 'Run Coach'}
            </Button>
          </Box>
        </Box>
      </SectionCard>

      {saving && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center', py: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">Saving...</Typography>
        </Box>
      )}
    </Box>
  );
}
