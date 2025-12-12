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
  Divider
} from '@mui/material';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { isSuperAdmin } from '../utils/roleUtils';
import { BASEBALL_CARD_DEFAULTS } from '../../../config/baseballCardConstants';
import useNotify from '../notifications/useNotify';

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

  useEffect(() => {
    load();
  }, [load]);

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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Baseball Card Config
            </Typography>
            <Button
              size="small"
              variant={editingConfig ? 'outlined' : 'text'}
              onClick={() => setEditingConfig((prev) => !prev)}
              sx={{ textTransform: 'none' }}
            >
              {editingConfig ? 'Done' : 'Edit'}
            </Button>
          </Box>
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
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Window (days)"
                type="number"
                inputProps={{ min: 1 }}
                value={config.windowDays}
                onChange={(e) => setConfig((prev) => ({ ...prev, windowDays: Number(e.target.value) }))}
                disabled={!editingConfig}
                fullWidth
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Prompt
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Title"
              value={prompt.title}
              onChange={(e) => setPrompt((prev) => ({ ...prev, title: e.target.value }))}
              fullWidth
            />
          <TextField
            label="Description"
            value={prompt.description}
            onChange={(e) => setPrompt((prev) => ({ ...prev, description: e.target.value }))}
            fullWidth
          />
            <TextField
              label="System Prompt"
              value={prompt.systemPrompt}
              onChange={(e) => setPrompt((prev) => ({ ...prev, systemPrompt: e.target.value }))}
              fullWidth
              multiline
              minRows={8}
            />
          </Stack>

          <Divider sx={{ my: 1 }} />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="flex-end">
            <Button variant="contained" onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={18} /> : null}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
