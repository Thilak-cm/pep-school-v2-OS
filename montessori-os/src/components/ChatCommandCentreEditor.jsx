// ChatCommandCentreEditor.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, TextField, Divider,
  Alert, CircularProgress, FormControl, InputLabel, Select, MenuItem,
  ListItemButton, Collapse, Chip, Checkbox, FormControlLabel
} from '@mui/material';
import { Settings, ChevronDown as ExpandMore, ChevronUp as ExpandLess, Save, MessageCircle as Chat, XCircle as Cancel } from '../icons';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify';
import { isSuperAdmin } from '../utils/roleUtils';
import { CHAT_MODEL_INFO, DEFAULT_CHAT_MESSAGE_LIMIT, DEFAULT_OBSERVATION_WINDOW_DAYS, CHAT_SYSTEM_PROMPT } from '../../../functions/config/chatConstants';
import { AVAILABLE_MODELS } from '../../../scripts/config/modelConstants';
import { DEFAULT_CHAT_TOOL_IDS } from '../../../functions/config/toolCatalog.js';
import {
  CHAT_TOOL_OPTIONS,
  isValidChatAllowedTools,
  normalizeChatAllowedTools,
  sameChatAllowedTools,
  toggleChatAllowedTool,
} from './chatCommandCentreTools.js';

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
  const [observationWindowDays, setObservationWindowDays] = useState(DEFAULT_OBSERVATION_WINDOW_DAYS);
  const [systemPrompt, setSystemPrompt] = useState(CHAT_SYSTEM_PROMPT);
  const [allowedTools, setAllowedTools] = useState(() => [...DEFAULT_CHAT_TOOL_IDS]);

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
          const nextAllowedTools = normalizeChatAllowedTools(data.allowedTools);

          // Set state from Firestore data
          setModel(data.model || CHAT_MODEL_INFO.model);
          setTemperature(Number.isFinite(data.temperature) ? data.temperature : CHAT_MODEL_INFO.temperature);
          setMaxTokens(Number.isFinite(data.max_tokens) ? data.max_tokens : CHAT_MODEL_INFO.max_tokens);
          setChatMessageLimit(Number.isFinite(data.chatMessageLimit) ? data.chatMessageLimit : DEFAULT_CHAT_MESSAGE_LIMIT);
          setObservationWindowDays(Number.isFinite(data.observationWindowDays) ? data.observationWindowDays : DEFAULT_OBSERVATION_WINDOW_DAYS);
          setSystemPrompt(data.systemPrompt || CHAT_SYSTEM_PROMPT);
          setAllowedTools(nextAllowedTools);
          if (Array.isArray(data.allowedTools) && !isValidChatAllowedTools(data.allowedTools)) {
            setError('Some saved chat tools are unavailable or missing prerequisites. Review and save the tool selection to update it.');
          }
          
          setOriginalState({
            model: data.model || CHAT_MODEL_INFO.model,
            temperature: Number.isFinite(data.temperature) ? data.temperature : CHAT_MODEL_INFO.temperature,
            max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : CHAT_MODEL_INFO.max_tokens,
            chatMessageLimit: Number.isFinite(data.chatMessageLimit) ? data.chatMessageLimit : DEFAULT_CHAT_MESSAGE_LIMIT,
            observationWindowDays: Number.isFinite(data.observationWindowDays) ? data.observationWindowDays : DEFAULT_OBSERVATION_WINDOW_DAYS,
            systemPrompt: data.systemPrompt || CHAT_SYSTEM_PROMPT,
            allowedTools: nextAllowedTools,
          });
        } else {
          // Document doesn't exist, use defaults
          setModel(CHAT_MODEL_INFO.model);
          setTemperature(CHAT_MODEL_INFO.temperature);
          setMaxTokens(CHAT_MODEL_INFO.max_tokens);
          setChatMessageLimit(DEFAULT_CHAT_MESSAGE_LIMIT);
          setObservationWindowDays(DEFAULT_OBSERVATION_WINDOW_DAYS);
          setSystemPrompt(CHAT_SYSTEM_PROMPT);
          setAllowedTools([...DEFAULT_CHAT_TOOL_IDS]);
          
          setOriginalState({
            model: CHAT_MODEL_INFO.model,
            temperature: CHAT_MODEL_INFO.temperature,
            max_tokens: CHAT_MODEL_INFO.max_tokens,
            chatMessageLimit: DEFAULT_CHAT_MESSAGE_LIMIT,
            observationWindowDays: DEFAULT_OBSERVATION_WINDOW_DAYS,
            systemPrompt: CHAT_SYSTEM_PROMPT,
            allowedTools: [...DEFAULT_CHAT_TOOL_IDS],
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
      observationWindowDays !== originalState.observationWindowDays ||
      systemPrompt !== originalState.systemPrompt ||
      !sameChatAllowedTools(allowedTools, originalState.allowedTools)
    );
  }, [model, temperature, maxTokens, chatMessageLimit, observationWindowDays, systemPrompt, allowedTools, originalState]);

  const handleSave = async () => {
    if (!isValidChatAllowedTools(allowedTools)) {
      setError('Select only available chat tools and include required prerequisite tools.');
      return;
    }
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
        observationWindowDays: Number(observationWindowDays),
        systemPrompt: systemPrompt.trim(),
        allowedTools: [...allowedTools],
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
          observationWindowDays,
          systemPrompt,
          allowedTools: [...allowedTools],
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
    setObservationWindowDays(originalState.observationWindowDays);
    setSystemPrompt(originalState.systemPrompt);
    setAllowedTools([...originalState.allowedTools]);
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
            <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mb: 3 }}>
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
                <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mb: 2 }}>
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
                    <InputLabel id="observation-window-label">Observation Window (days)</InputLabel>
                    <Select
                      labelId="observation-window-label"
                      id="observation-window-select"
                      value={observationWindowDays}
                      label="Observation Window (days)"
                      onChange={(e) => setObservationWindowDays(Number(e.target.value))}
                      disabled={saving}
                    >
                      <MenuItem value={7}>Past 7 days</MenuItem>
                      <MenuItem value={14}>Past 14 days</MenuItem>
                      <MenuItem value={30}>Past 30 days</MenuItem>
                      <MenuItem value={60}>Past 60 days</MenuItem>
                      <MenuItem value={90}>Past 90 days</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              <Divider />

              {/* Agent Tools */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Allowed Agent Tools</Typography>
                  <Chip label={`${allowedTools.length} enabled`} size="small" variant="outlined" />
                </Box>
                <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mb: 1.5 }}>
                  Select which student-data tools Coach Pepper may use. Leaving every tool unchecked disables tool use.
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {CHAT_TOOL_OPTIONS.map((tool) => {
                    const checked = allowedTools.includes(tool.id);
                    const prerequisitesMet = !tool.prerequisites?.length
                      || tool.prerequisites.every((prerequisite) => allowedTools.includes(prerequisite));
                    return (
                      <FormControlLabel
                        key={tool.id}
                        control={(
                          <Checkbox
                            checked={checked}
                            disabled={saving || (!checked && !prerequisitesMet)}
                            onChange={() => setAllowedTools((current) => toggleChatAllowedTool(current, tool.id))}
                            size="small"
                          />
                        )}
                        label={(
                          <Box>
                            <Typography variant="body2">{tool.label}</Typography>
                            <Typography variant="caption" color="text.secondary">{tool.description}</Typography>
                          </Box>
                        )}
                        sx={{ alignItems: 'flex-start', mx: 0, mb: 0.5 }}
                      />
                    );
                  })}
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
            <Typography variant="body2" sx={{ color: 'var(--color-text-soft)', mb: 2 }}>
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
          sx={{ textTransform: 'none', minWidth: '100px', backgroundColor: 'var(--color-primary)', '&:hover': { backgroundColor: 'var(--color-primary-dark)' } }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}
