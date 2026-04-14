// ChatCommandCentreEditor.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, TextField, Divider,
  Alert, CircularProgress, FormControl, InputLabel, Select, MenuItem,
  ListItemButton, Collapse, Chip
} from '@mui/material';
import { Settings, ExpandMore, ExpandLess, Save, Chat, Cancel } from '@mui/icons-material';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify';
import { isSuperAdmin } from '../utils/roleUtils';
import { CHAT_MODEL_INFO, DEFAULT_CHAT_MESSAGE_LIMIT, DEFAULT_OBSERVATION_LIMIT, CHAT_SYSTEM_PROMPT } from '../../../functions/config/chatConstants';
import { AVAILABLE_MODELS } from '../../../scripts/config/modelConstants';

// Program IDs
const PROGRAMS = [
  { id: 'toddler', label: 'Toddler' },
  { id: 'primary', label: 'Primary' },
  { id: 'elementary', label: 'Elementary' },
  { id: 'adolescent', label: 'Adolescent' },
];

export default function ChatCommandCentreEditor({ currentUser, userRole }) {
  const isAdmin = isSuperAdmin(userRole);
  const notify = useNotify();

  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [programId, setProgramId] = useState('toddler');
  const [saving, setSaving] = useState(false);

  // Chat configuration state
  const [model, setModel] = useState(CHAT_MODEL_INFO.model);
  const [temperature, setTemperature] = useState(CHAT_MODEL_INFO.temperature);
  const [maxTokens, setMaxTokens] = useState(CHAT_MODEL_INFO.max_tokens);
  const [chatMessageLimit, setChatMessageLimit] = useState(DEFAULT_CHAT_MESSAGE_LIMIT);
  const [observationLimit, setObservationLimit] = useState('all');
  const [systemPrompt, setSystemPrompt] = useState(CHAT_SYSTEM_PROMPT);

  // Track original values
  const [originalState, setOriginalState] = useState(null);

  // Collapsible section states
  const [configExpanded, setConfigExpanded] = useState(true);
  const [promptExpanded, setPromptExpanded] = useState(false);

  const chatRef = useMemo(() => doc(db, 'config', `chat_${programId}`), [programId]);

  // Load initial data from Firestore
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const snap = await getDoc(chatRef);
        if (snap.exists()) {
          const data = snap.data() || {};

          // Set state from Firestore data
          setModel(data.model || CHAT_MODEL_INFO.model);
          setTemperature(Number.isFinite(data.temperature) ? data.temperature : CHAT_MODEL_INFO.temperature);
          setMaxTokens(Number.isFinite(data.max_tokens) ? data.max_tokens : CHAT_MODEL_INFO.max_tokens);
          setChatMessageLimit(Number.isFinite(data.chatMessageLimit) ? data.chatMessageLimit : DEFAULT_CHAT_MESSAGE_LIMIT);
          setObservationLimit(data.observationLimit === 'all' ? 'all' : (Number.isFinite(data.observationLimit) ? data.observationLimit : DEFAULT_OBSERVATION_LIMIT));
          setSystemPrompt(data.systemPrompt || CHAT_SYSTEM_PROMPT);
          
          setOriginalState({
            model: data.model || CHAT_MODEL_INFO.model,
            temperature: Number.isFinite(data.temperature) ? data.temperature : CHAT_MODEL_INFO.temperature,
            max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : CHAT_MODEL_INFO.max_tokens,
            chatMessageLimit: Number.isFinite(data.chatMessageLimit) ? data.chatMessageLimit : DEFAULT_CHAT_MESSAGE_LIMIT,
            observationLimit: data.observationLimit === 'all' ? 'all' : (Number.isFinite(data.observationLimit) ? data.observationLimit : DEFAULT_OBSERVATION_LIMIT),
            systemPrompt: data.systemPrompt || CHAT_SYSTEM_PROMPT,
          });
        } else {
          // Document doesn't exist, use defaults
          setModel(CHAT_MODEL_INFO.model);
          setTemperature(CHAT_MODEL_INFO.temperature);
          setMaxTokens(CHAT_MODEL_INFO.max_tokens);
          setChatMessageLimit(DEFAULT_CHAT_MESSAGE_LIMIT);
          setObservationLimit('all');
          setSystemPrompt(CHAT_SYSTEM_PROMPT);
          
          setOriginalState({
            model: CHAT_MODEL_INFO.model,
            temperature: CHAT_MODEL_INFO.temperature,
            max_tokens: CHAT_MODEL_INFO.max_tokens,
            chatMessageLimit: DEFAULT_CHAT_MESSAGE_LIMIT,
            observationLimit: 'all',
            systemPrompt: CHAT_SYSTEM_PROMPT,
          });
        }
      } catch {
        setError('Failed to load chat configuration.');
      } finally {
        setLoading(false);
      }
    })();
  }, [programId, chatRef, isAdmin]);

  const hasChanges = useMemo(() => {
    if (!originalState) return false;
    return (
      model !== originalState.model ||
      temperature !== originalState.temperature ||
      maxTokens !== originalState.max_tokens ||
      chatMessageLimit !== originalState.chatMessageLimit ||
      observationLimit !== originalState.observationLimit ||
      systemPrompt !== originalState.systemPrompt
    );
  }, [model, temperature, maxTokens, chatMessageLimit, observationLimit, systemPrompt, originalState]);

  const handleSave = async () => {
    if (!hasChanges) {
      notify('No changes to save.', 'info');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const updateData = {
        title: 'Chat Command Centre',
        description: 'Configure AI chat settings for per-student conversations',
        programId: programId,
        model: model.trim(),
        temperature: Number(temperature),
        max_tokens: Number(maxTokens),
        chatMessageLimit: Number(chatMessageLimit),
        observationLimit: observationLimit === 'all' ? 'all' : Number(observationLimit),
        systemPrompt: systemPrompt.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: {
          uid: currentUser?.uid || '',
          email: currentUser?.email || '',
          name: currentUser?.displayName || '',
        },
      };

      await updateDoc(chatRef, updateData);
      
      // Reload to get updated document
      const snap = await getDoc(chatRef);
      if (snap.exists()) {
        // Update original values to mark as saved
        setOriginalState({
          model,
          temperature,
          max_tokens: maxTokens,
          chatMessageLimit,
          observationLimit,
          systemPrompt,
        });
      }

      notify.success('Chat configuration saved successfully!');
    } catch {
      setError('Failed to save chat configuration. Please try again.');
      notify.error('Failed to save chat configuration.');
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel - reset to original values
  const handleCancel = () => {
    if (!originalState) return;
    setModel(originalState.model);
    setTemperature(originalState.temperature);
    setMaxTokens(originalState.max_tokens);
    setChatMessageLimit(originalState.chatMessageLimit);
    setObservationLimit(originalState.observationLimit);
    setSystemPrompt(originalState.systemPrompt);
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', gap: 2, flexDirection: 'column' }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Coach Pepper is loading chat settings...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Chat Configuration Section - Collapsible */}
      <Card sx={{ borderRadius: 2, mb: 2 }}>
        <ListItemButton
          onClick={() => setConfigExpanded(!configExpanded)}
          sx={{ borderRadius: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>Chat Configuration</Typography>
          {hasChanges && (
            <Chip 
              label="Unsaved changes" 
              size="small" 
              color="warning" 
              variant="outlined"
              sx={{ mr: 1 }}
            />
          )}
          {configExpanded ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={configExpanded}>
          <CardContent>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 3 }}>
              Configure branch settings, model parameters, and context limits
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Program Selector */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Program Settings</Typography>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="program-select-label">Program</InputLabel>
                  <Select
                    labelId="program-select-label"
                    id="program-select"
                    value={programId}
                    label="Program"
                    onChange={(e) => setProgramId(e.target.value)}
                    disabled={saving}
                  >
                    {PROGRAMS.map((program) => (
                      <MenuItem key={program.id} value={program.id}>
                        {program.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Divider />

              {/* Model Configuration */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Model Configuration</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="model-select-label">Model</InputLabel>
                    <Select
                      labelId="model-select-label"
                      id="model-select"
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
                        <MenuItem key={m.id} value={m.id}>
                          {m.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    fullWidth
                    type="number"
                    label="Temperature"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    onWheel={(e) => e.target.blur()}
                    disabled={saving}
                    size="small"
                    inputProps={{ min: 0, max: 2, step: 0.1 }}
                    helperText="Controls randomness (0 = deterministic, 2 = very creative)"
                  />
                  <TextField
                    fullWidth
                    type="number" onWheel={(e) => e.target.blur()}
                    label="Max Tokens"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(Number(e.target.value))}
                    disabled={saving}
                    size="small"
                    inputProps={{ min: 1, max: 4000 }}
                    helperText="Maximum tokens in the response"
                  />
                </Box>
              </Box>

              <Divider />

              {/* Context Limits */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Context Limits</Typography>
                <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
                  Configure how many messages and observations to include in chat context
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    fullWidth
                    type="number" onWheel={(e) => e.target.blur()}
                    label="Chat Message Limit"
                    value={chatMessageLimit}
                    onChange={(e) => setChatMessageLimit(Number(e.target.value))}
                    disabled={saving}
                    size="small"
                    inputProps={{ min: 1, max: 50 }}
                    helperText="Number of recent chat messages to include in context"
                  />
                  <FormControl fullWidth size="small">
                    <InputLabel id="observation-limit-label">Observation Limit</InputLabel>
                    <Select
                      labelId="observation-limit-label"
                      id="observation-limit-select"
                      value={observationLimit}
                      label="Observation Limit"
                      onChange={(e) => setObservationLimit(e.target.value)}
                      disabled={saving}
                    >
                      <MenuItem value="all">All observations</MenuItem>
                      <MenuItem value={10}>10 observations</MenuItem>
                      <MenuItem value={20}>20 observations</MenuItem>
                      <MenuItem value={30}>30 observations</MenuItem>
                      <MenuItem value={50}>50 observations</MenuItem>
                      <MenuItem value={100}>100 observations</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Collapse>
      </Card>

      {/* System Prompt Section - Collapsible */}
      <Card sx={{ borderRadius: 2, mb: 2 }}>
        <ListItemButton
          onClick={() => setPromptExpanded(!promptExpanded)}
          sx={{ borderRadius: 2 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>System Prompt</Typography>
          {promptExpanded ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={promptExpanded}>
          <CardContent>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
              The system prompt that defines Coach Pepper's behavior in conversations
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={12}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              disabled={saving}
              helperText="This prompt defines how Coach Pepper behaves in conversations"
            />
          </CardContent>
        </Collapse>
      </Card>

      {/* Save/Cancel Buttons */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
        <Button
          variant="outlined"
          startIcon={<Cancel />}
          onClick={handleCancel}
          disabled={!hasChanges || saving}
          color="error"
          sx={{ textTransform: 'none', minWidth: '100px' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave}
          disabled={!hasChanges || saving}
          sx={{ textTransform: 'none', minWidth: '100px', backgroundColor: '#4f46e5', '&:hover': { backgroundColor: '#4338ca' } }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}
