// ChatCommandCentreEditor.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, TextField, Divider,
  Alert, CircularProgress, FormControl, InputLabel, Select, MenuItem,
  ListItemButton, Collapse
} from '@mui/material';
import { Settings, ExpandMore, ExpandLess, Save } from '@mui/icons-material';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import useNotify from '../notifications/useNotify';
import { isSuperAdmin } from '../utils/roleUtils';
import { CHAT_MODEL_INFO, DEFAULT_CHAT_MESSAGE_LIMIT, DEFAULT_OBSERVATION_LIMIT, CHAT_SYSTEM_PROMPT } from '../../../functions/config/chatConstants';

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

// Branch IDs
const BRANCHES = [
  { id: 'hsr', label: 'HSR' },
  { id: 'whitefield', label: 'Whitefield' },
  { id: 'varthur', label: 'Varthur' },
  { id: 'hyderabad', label: 'Hyderabad' },
];

export default function ChatCommandCentreEditor({ currentUser, userRole }) {
  const isAdmin = isSuperAdmin(userRole);
  const notify = useNotify();

  if (!isAdmin) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="error">Access denied. Super admins only.</Typography>
      </Box>
    );
  }

  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docState, setDocState] = useState(null);
  const [branchId, setBranchId] = useState('hsr');
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

  const chatRef = useMemo(() => doc(db, 'ai_prompts', `chat_${branchId}`), [branchId]);

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
          setDocState(data);
          
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
          setDocState(null);
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
      } catch (err) {
        console.error('Error loading chat config:', err);
        setError('Failed to load chat configuration.');
      } finally {
        setLoading(false);
      }
    })();
  }, [branchId, chatRef, isAdmin]);

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
        branchId: branchId,
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
      
      setOriginalState({
        model,
        temperature,
        max_tokens: maxTokens,
        chatMessageLimit,
        observationLimit,
        systemPrompt,
      });

      notify('Chat configuration saved successfully!', 'success');
    } catch (err) {
      console.error('Error saving chat config:', err);
      setError('Failed to save chat configuration. Please try again.');
      notify('Failed to save chat configuration.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', gap: 2, flexDirection: 'column' }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Loading chat configuration...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Settings sx={{ fontSize: 32, color: '#6366f1' }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b' }}>
            Chat Command Centre
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            Configure AI chat settings for per-student conversations
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Branch Selector */}
      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Branch Selection
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel id="branch-select-label">Branch</InputLabel>
            <Select
              labelId="branch-select-label"
              id="branch-select"
              value={branchId}
              label="Branch"
              onChange={(e) => setBranchId(e.target.value)}
              disabled={saving}
            >
              {BRANCHES.map((branch) => (
                <MenuItem key={branch.id} value={branch.id}>
                  {branch.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* Configuration Section */}
      <SectionCard
        title="Model Configuration"
        subtitle="Configure the AI model and parameters"
      >
        <ListItemButton
          onClick={() => setConfigExpanded(!configExpanded)}
          sx={{ px: 0, py: 1 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Model Settings
            </Typography>
            {configExpanded ? <ExpandLess /> : <ExpandMore />}
          </Box>
        </ListItemButton>
        <Collapse in={configExpanded}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              fullWidth
              label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={saving}
              size="small"
              helperText="OpenAI model to use (e.g., gpt-4o, gpt-4o-mini)"
            />
            <TextField
              fullWidth
              type="number"
              label="Temperature"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              disabled={saving}
              size="small"
              inputProps={{ min: 0, max: 2, step: 0.1 }}
              helperText="Controls randomness (0 = deterministic, 2 = very creative)"
            />
            <TextField
              fullWidth
              type="number"
              label="Max Tokens"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              disabled={saving}
              size="small"
              inputProps={{ min: 1, max: 4000 }}
              helperText="Maximum tokens in the response"
            />
            <TextField
              fullWidth
              type="number"
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
        </Collapse>
      </SectionCard>

      {/* System Prompt Section */}
      <SectionCard
        title="System Prompt"
        subtitle="The system prompt that defines the AI assistant's behavior"
      >
        <ListItemButton
          onClick={() => setPromptExpanded(!promptExpanded)}
          sx={{ px: 0, py: 1 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              System Prompt Editor
            </Typography>
            {promptExpanded ? <ExpandLess /> : <ExpandMore />}
          </Box>
        </ListItemButton>
        <Collapse in={promptExpanded}>
          <TextField
            fullWidth
            multiline
            rows={12}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            disabled={saving}
            sx={{ mt: 2 }}
            helperText="This prompt defines how the AI assistant behaves in conversations"
          />
        </Collapse>
      </SectionCard>

      {/* Save Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          sx={{ backgroundColor: '#4f46e5', '&:hover': { backgroundColor: '#4338ca' } }}
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </Box>
    </Box>
  );
}
