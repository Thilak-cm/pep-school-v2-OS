import React, { useState, useMemo } from 'react';
import { Box, Typography, Button, TextField } from '@mui/material';
import { NUDGE_IDS, CHIPS, MICROCOPY_KEYS } from './constants';

// Simple UI strings mapped from microcopy keys in PRD
const MICROCOPY_TEXT = Object.freeze({
  about_how_long: 'About how long?',
  how_was_this_done: 'How was this done?',
  add_tiny_evidence: 'Add a tiny evidence point?',
  objective_line_invite: 'Adjective spotted. Add one objective line?',
});

function humanizeDuration(chip) {
  if (!chip) return '';
  if (chip.endsWith('m+')) return chip.replace('m+', '+ min');
  return chip.replace('m', ' min');
}

function previewWithAppend(noteText, appendLine, opts = {}) {
  const { maxWordsBeforeEllipsis = 30, lastWords = 10 } = opts;
  const words = String(noteText || '').trim().split(/\s+/).filter(Boolean);
  const needsEllipsis = words.length > maxWordsBeforeEllipsis;
  const base = needsEllipsis ? `… ${words.slice(-lastWords).join(' ')}` : words.join(' ');
  const sep = base.endsWith('\n') ? '' : '\n';
  return `${base}${sep}${appendLine}`;
}

export default function CoachNudge({ noteText, onApply, onSkip }) {
  const nudgeId = NUDGE_IDS.DURATION;
  const chips = CHIPS[nudgeId];
  const microcopyKey = MICROCOPY_KEYS[nudgeId];
  const microcopy = MICROCOPY_TEXT[microcopyKey] || '';

  const [selected, setSelected] = useState(chips[2] /* '10–20m' as a reasonable default */);

  const appendLine = useMemo(() => (
    selected ? `Duration: ${humanizeDuration(selected)}` : ''
  ), [selected]);

  const preview = useMemo(() => (
    appendLine ? previewWithAppend(noteText, appendLine) : String(noteText || '')
  ), [noteText, appendLine]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Coach Pepper thinks this note can be improved!
      </Typography>
      {microcopy && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {microcopy}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {chips.map((c) => (
          <Button
            key={c}
            size="small"
            variant={selected === c ? 'contained' : 'outlined'}
            onClick={() => setSelected(c)}
          >
            {c}
          </Button>
        ))}
      </Box>

      <TextField
        label="Updated note preview"
        fullWidth
        multiline
        minRows={4}
        value={preview}
        InputProps={{ readOnly: true }}
        sx={{ mb: 2 }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button variant="text" onClick={onSkip}>Save without</Button>
        <Button
          variant="contained"
          onClick={() => onApply && onApply({ duration_range: selected, updated_text: preview })}
          disabled={!selected}
        >
          Apply and Save
        </Button>
      </Box>
    </Box>
  );
}
