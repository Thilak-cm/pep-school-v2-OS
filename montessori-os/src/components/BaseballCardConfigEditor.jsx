import React, { useEffect, useCallback, useState } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { isSuperAdmin } from '../utils/roleUtils';
import { BASEBALL_CARD_DEFAULTS } from '../../../scripts/config/baseballCardConstants';
import { AVAILABLE_MODELS } from '../../../scripts/config/modelConstants';
import { BASEBALL_SYSTEM_PROMPT_FALLBACK } from '../../../scripts/config/baseballCardPrompt';
import useNotify from '../notifications/useNotify';

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
    title: "Coach Pepper's summary",
    description: 'Last six weeks baseball card summary',
    systemPrompt: BASEBALL_SYSTEM_PROMPT_FALLBACK,
  });
  const [editingPrompt, setEditingPrompt] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // PEP-139: single config doc has both prompt and model fields
      const configSnap = await getDoc(doc(db, 'config', 'baseball_card'));

      if (configSnap.exists()) {
        const data = configSnap.data() || {};
        setConfig({
          model: data.model || BASEBALL_CARD_DEFAULTS.model,
          temperature: Number.isFinite(data.temperature) ? data.temperature : BASEBALL_CARD_DEFAULTS.temperature,
          windowDays: Number.isFinite(data.windowDays) ? data.windowDays : BASEBALL_CARD_DEFAULTS.windowDays,
          timezone: data.timezone || BASEBALL_CARD_DEFAULTS.timezone,
          max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens,
        });
        setPrompt({
          title: data.title || "Coach Pepper\u2019s summary",
          description: data.description || 'Last six weeks baseball card summary',
          systemPrompt: data.systemPrompt || BASEBALL_SYSTEM_PROMPT_FALLBACK,
        });
      } else {
        setConfig({ ...BASEBALL_CARD_DEFAULTS });
        setPrompt({
          title: "Coach Pepper\u2019s summary",
          description: 'Last six weeks baseball card summary',
          systemPrompt: BASEBALL_SYSTEM_PROMPT_FALLBACK,
        });
      }
    } catch {
      notify.error('Failed to load baseball card settings.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      // PEP-139: single config doc has both prompt and model fields
      await setDoc(doc(db, 'config', 'baseball_card'), {
        model: config.model || BASEBALL_CARD_DEFAULTS.model,
        temperature: Number.isFinite(config.temperature) ? config.temperature : BASEBALL_CARD_DEFAULTS.temperature,
        windowDays: Number.isFinite(config.windowDays) ? config.windowDays : BASEBALL_CARD_DEFAULTS.windowDays,
        timezone: config.timezone || BASEBALL_CARD_DEFAULTS.timezone,
        max_tokens: Number.isFinite(config.max_tokens) ? config.max_tokens : BASEBALL_CARD_DEFAULTS.max_tokens,
        title: prompt.title || "Coach Pepper's summary",
        description: prompt.description || '',
        systemPrompt: prompt.systemPrompt || BASEBALL_SYSTEM_PROMPT_FALLBACK,
        updatedBy: currentUser?.uid || null,
        updatedAt: new Date(),
      }, { merge: true });
      notify.success('Baseball card settings saved.');
    } catch {
      notify.error('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const _HandleResetDefaults = () => {
    setConfig({ ...BASEBALL_CARD_DEFAULTS });
    setPrompt((prev) => ({
      ...prev,
      systemPrompt: BASEBALL_SYSTEM_PROMPT_FALLBACK,
    }));
  };

  const windowDaysValue = Number.isFinite(config.windowDays) ? config.windowDays : BASEBALL_CARD_DEFAULTS.windowDays;
  const promptPreviewParts = (prompt.systemPrompt || '').split('<WINDOW_DAYS>');

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
              border: '1px solid var(--color-border)',
              borderRadius: 2,
              backgroundColor: 'var(--color-bg)',
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
                  color: 'var(--grey-900)',
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
                          borderColor: 'var(--color-blue-soft)',
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
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Model Configuration
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel id="baseball-model-label">Model</InputLabel>
              <Select
                labelId="baseball-model-label"
                value={config.model}
                label="Model"
                onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
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
              label="Temperature"
              type="number" onWheel={(e) => e.target.blur()}
              inputProps={{ step: 0.1, min: 0, max: 2 }}
              value={config.temperature}
              onChange={(e) => setConfig((prev) => ({ ...prev, temperature: Number(e.target.value) }))}
              disabled={saving}
              size="small"
              fullWidth
            />
            <TextField
              label="Window Days"
              type="number" onWheel={(e) => e.target.blur()}
              inputProps={{ min: 1 }}
              value={config.windowDays}
              onChange={(e) => setConfig((prev) => ({ ...prev, windowDays: Number(e.target.value) }))}
              disabled={saving}
              size="small"
              fullWidth
            />
            <TextField
              label="Max Tokens"
              type="number" onWheel={(e) => e.target.blur()}
              inputProps={{ min: 50 }}
              value={config.max_tokens}
              onChange={(e) => setConfig((prev) => ({ ...prev, max_tokens: Number(e.target.value) }))}
              disabled={saving}
              size="small"
              fullWidth
            />
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
