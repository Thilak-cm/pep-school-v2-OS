import React, { useState, useMemo } from 'react';
import { Box, Typography, Button, TextField } from '@mui/material';
import { NUDGE_IDS, CHIPS, MICROCOPY_KEYS } from './constants';

// Microcopy comes directly from constants.MICROCOPY_KEYS mapping by nudge id

function humanizeDuration(chip) {
  if (!chip) return '';
  if (chip.endsWith('m+')) return chip.replace('m+', '+ min');
  return chip.replace('m', ' min');
}

// Build a truncated preview for very long notes: show ellipsis + last 5 words or 30 chars
function buildPreviewParts(noteText, appendedText) {
  const raw = String(noteText || '').trim();
  const words = raw.split(/\s+/).filter(Boolean);
  const isLong = words.length > 50 || raw.length > 200; // heuristic for "very big"
  let originalPreview = raw;
  if (isLong) {
    if (words.length >= 5) {
      originalPreview = `… ${words.slice(-5).join(' ')}`;
    } else {
      const tail = raw.slice(-30);
      originalPreview = `… ${tail}`;
    }
  }
  return { originalPreview, appended: appendedText };
}

export default function CoachNudge({ noteText, onApply, onSkip, forcedNudges, maxNudges, initialSelections = {}, onSelectionsChange }) {
  // Allowed IDs universe
  const ALL_IDS = [
    NUDGE_IDS.DURATION,
    NUDGE_IDS.MODALITY,
    NUDGE_IDS.INDEPENDENCE,
    NUDGE_IDS.EVIDENCE,
    NUDGE_IDS.SUBJECTIVE,
  ];
  const PRIORITY = [
    NUDGE_IDS.DURATION,
    NUDGE_IDS.MODALITY,
    NUDGE_IDS.INDEPENDENCE,
    NUDGE_IDS.EVIDENCE,
    NUDGE_IDS.SUBJECTIVE,
  ];
  const sampledIds = useMemo(() => {
    const desired = Array.isArray(forcedNudges) ? forcedNudges.filter((id) => ALL_IDS.includes(id)) : [];
    const dedup = Array.from(new Set(desired));
    dedup.sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
    if (Number.isInteger(maxNudges) && maxNudges > 0) return dedup.slice(0, maxNudges);
    return dedup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedNudges, maxNudges]);

  // Track if save attempt has been made (only after save attempt)
  const [saveAttempted, setSaveAttempted] = useState(false);

  const mergedInitialSelections = useMemo(() => {
    const incoming = initialSelections || {};
    return {
      [NUDGE_IDS.DURATION]: { range: incoming[NUDGE_IDS.DURATION]?.range },
      [NUDGE_IDS.MODALITY]: { modality: incoming[NUDGE_IDS.MODALITY]?.modality },
      [NUDGE_IDS.INDEPENDENCE]: { independence: incoming[NUDGE_IDS.INDEPENDENCE]?.independence },
      [NUDGE_IDS.EVIDENCE]: {
        attempts: incoming[NUDGE_IDS.EVIDENCE]?.attempts,
        correct: incoming[NUDGE_IDS.EVIDENCE]?.correct,
        quote: incoming[NUDGE_IDS.EVIDENCE]?.quote ?? '',
      },
      [NUDGE_IDS.SUBJECTIVE]: { objective_line: incoming[NUDGE_IDS.SUBJECTIVE]?.objective_line ?? '' },
    };
  }, [initialSelections]);

  const [selections, setSelections] = useState(mergedInitialSelections);

  const updateSelections = (updater) => {
    setSelections((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (onSelectionsChange) onSelectionsChange(next);
      return next;
    });
  };

  // Compose appended lines from current selections
  const appendedLines = useMemo(() => {
    const out = [];
    if (sampledIds.includes(NUDGE_IDS.DURATION)) {
      const r = selections[NUDGE_IDS.DURATION]?.range;
      if (r && CHIPS[NUDGE_IDS.DURATION].includes(r)) out.push(`Duration: ${humanizeDuration(r)}`);
    }
    if (sampledIds.includes(NUDGE_IDS.MODALITY)) {
      const m = selections[NUDGE_IDS.MODALITY]?.modality;
      if (m && CHIPS[NUDGE_IDS.MODALITY].includes(m)) out.push(`Modality: ${m}`);
    }
    if (sampledIds.includes(NUDGE_IDS.INDEPENDENCE)) {
      const g = selections[NUDGE_IDS.INDEPENDENCE]?.independence;
      if (g && CHIPS[NUDGE_IDS.INDEPENDENCE].includes(g)) out.push(`Independence: ${g}`);
    }
    if (sampledIds.includes(NUDGE_IDS.EVIDENCE)) {
      const a = selections[NUDGE_IDS.EVIDENCE]?.attempts;
      const c = selections[NUDGE_IDS.EVIDENCE]?.correct;
      const q = selections[NUDGE_IDS.EVIDENCE]?.quote;
      const hasCounts = Number.isInteger(a) && Number.isInteger(c);
      const hasQuote = q && String(q).trim();
      if (hasCounts || hasQuote) {
        const parts = [];
        if (hasCounts) {
          parts.push(`Evidence: ${c}/${a} correct`);
        } else {
          parts.push('Evidence:');
        }
        if (hasQuote) {
          parts.push(`- ${String(q).trim()}`);
        }
        out.push(parts.join(' '));
      }
    }
    if (sampledIds.includes(NUDGE_IDS.SUBJECTIVE)) {
      const l = selections[NUDGE_IDS.SUBJECTIVE]?.objective_line;
      if (l && String(l).trim()) out.push(`Objective note: ${String(l).trim()}`);
    }
    return out;
  }, [selections, sampledIds]);

  // Full text that will actually be saved (always full original + appended lines)
  const fullUpdatedText = useMemo(() => {
    const original = String(noteText || '').trimEnd();
    if (!appendedLines.length) return original;
    // Always add a --- divider between original note and the appended lines
    // This allows parsing the text later to separate original from enhanced content
    let gap = '';
    if (original.length > 0) {
      if (/\n$/.test(original)) gap = '\n---\n';
      else gap = '\n----\n';
    } else {
      gap = '---\n';
    }
    return `${original}${gap}${appendedLines.join('\n')}`;
  }, [noteText, appendedLines]);

  // Preview: truncated original + faint divider + appended lines
  const previewParts = useMemo(() => buildPreviewParts(noteText, appendedLines.join('\n')), [noteText, appendedLines]);

  // Check if any enhancement has been selected
  const hasAnySelection = useMemo(() => {
    // Check duration
    if (sampledIds.includes(NUDGE_IDS.DURATION)) {
      const r = selections[NUDGE_IDS.DURATION]?.range;
      if (r && CHIPS[NUDGE_IDS.DURATION].includes(r)) return true;
    }
    // Check modality
    if (sampledIds.includes(NUDGE_IDS.MODALITY)) {
      const m = selections[NUDGE_IDS.MODALITY]?.modality;
      if (m && CHIPS[NUDGE_IDS.MODALITY].includes(m)) return true;
    }
    // Check independence
    if (sampledIds.includes(NUDGE_IDS.INDEPENDENCE)) {
      const g = selections[NUDGE_IDS.INDEPENDENCE]?.independence;
      if (g && CHIPS[NUDGE_IDS.INDEPENDENCE].includes(g)) return true;
    }
    // Check evidence (either counts or quote)
    if (sampledIds.includes(NUDGE_IDS.EVIDENCE)) {
      const a = selections[NUDGE_IDS.EVIDENCE]?.attempts;
      const c = selections[NUDGE_IDS.EVIDENCE]?.correct;
      const q = selections[NUDGE_IDS.EVIDENCE]?.quote;
      if (Number.isInteger(a) && Number.isInteger(c)) return true;
      if (q && String(q).trim()) return true;
    }
    // Check subjective/objective
    if (sampledIds.includes(NUDGE_IDS.SUBJECTIVE)) {
      const l = selections[NUDGE_IDS.SUBJECTIVE]?.objective_line;
      if (l && String(l).trim()) return true;
    }
    return false;
  }, [selections, sampledIds]);

  return (
    <Box sx={{ p: { xs: 0.25, sm: 0.75 } }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Coach Pepper thinks this note can be improved!
      </Typography>

      {/* Render controls per selected nudge (PRD priority order) */}
      {sampledIds.map((id) => {
        const copy = MICROCOPY_KEYS[id] || '';
        return (
          <Box key={id} sx={{ mb: 2.25 }}>
            {copy && (
              <Typography variant="subtitle2" sx={{ mb: 0.75, color: 'var(--color-text)', fontWeight: 600 }}>
                {copy}
              </Typography>
            )}
            {id === NUDGE_IDS.DURATION && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {CHIPS[NUDGE_IDS.DURATION].map((c) => (
                  <Button
                    key={c}
                    size="small"
                    variant={selections[NUDGE_IDS.DURATION]?.range === c ? 'contained' : 'outlined'}
                    sx={{ px: 1.75, py: 0.4, borderRadius: 1.5 }}
                    onClick={() => updateSelections((s) => ({ ...s, [NUDGE_IDS.DURATION]: { range: c } }))}
                  >
                    {c}
                  </Button>
                ))}
              </Box>
            )}
            {id === NUDGE_IDS.MODALITY && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {CHIPS[NUDGE_IDS.MODALITY].map((c) => (
                  <Button
                    key={c}
                    size="small"
                    variant={selections[NUDGE_IDS.MODALITY]?.modality === c ? 'contained' : 'outlined'}
                    sx={{ px: 1.75, py: 0.4, borderRadius: 1.5 }}
                    onClick={() => updateSelections((s) => ({ ...s, [NUDGE_IDS.MODALITY]: { modality: c } }))}
                  >
                    {c}
                  </Button>
                ))}
              </Box>
            )}
            {id === NUDGE_IDS.INDEPENDENCE && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {CHIPS[NUDGE_IDS.INDEPENDENCE].map((c) => (
                  <Button
                    key={c}
                    size="small"
                    variant={selections[NUDGE_IDS.INDEPENDENCE]?.independence === c ? 'contained' : 'outlined'}
                    sx={{ px: 1.75, py: 0.4, borderRadius: 1.5 }}
                    onClick={() => updateSelections((s) => ({ ...s, [NUDGE_IDS.INDEPENDENCE]: { independence: c } }))}
                  >
                    {c}
                  </Button>
                ))}
              </Box>
            )}
            {id === NUDGE_IDS.EVIDENCE && (() => {
              const a = selections[NUDGE_IDS.EVIDENCE]?.attempts;
              const c = selections[NUDGE_IDS.EVIDENCE]?.correct;
              const aInt = Number.isInteger(a);
              const cInt = Number.isInteger(c);
              const oneFilled = (aInt && !cInt) || (!aInt && cInt);
              const tooMany = aInt && cInt && c > a;
              const invalid = saveAttempted && (oneFilled || tooMany);
              const helper = saveAttempted && oneFilled
                ? 'Please provide both values'
                : (saveAttempted && tooMany ? '# correct cannot exceed # attempts' : '');
              return (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <TextField
                      placeholder="__"
                      size="small"
                      type="number" onWheel={(e) => e.target.blur()}
                      inputProps={{ min: 0, style: { textAlign: 'center', width: '60px' } }}
                      sx={{
                        width: '76px',
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': {
                            borderColor: invalid ? 'var(--color-red-darker)' : 'var(--color-neutral-dark)',
                          },
                          borderRadius: 1.25,
                        },
                      }}
                      value={selections[NUDGE_IDS.EVIDENCE]?.correct ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                        updateSelections((s) => {
                          const updated = { 
                            ...s, 
                            [NUDGE_IDS.EVIDENCE]: { 
                              ...(s[NUDGE_IDS.EVIDENCE]||{}), 
                              correct: Number.isNaN(val) ? undefined : val 
                            } 
                          };
                          // Clear validation if both fields are now valid
                          const newAttempts = updated[NUDGE_IDS.EVIDENCE]?.attempts;
                          const newCorrect = Number.isNaN(val) ? undefined : val;
                          const bothFilled = Number.isInteger(newAttempts) && Number.isInteger(newCorrect);
                          const bothValid = bothFilled && newCorrect <= newAttempts;
                          if (bothValid && saveAttempted) {
                            setSaveAttempted(false);
                          }
                          return updated;
                        });
                      }}
                      error={invalid && oneFilled}
                    />
                    <Typography variant="body1" sx={{ color: 'var(--color-neutral-muted)', fontWeight: 500 }}>
                      /
                    </Typography>
                    <TextField
                      placeholder="__"
                      size="small"
                      type="number" onWheel={(e) => e.target.blur()}
                      inputProps={{ min: 0, style: { textAlign: 'center', width: '60px' } }}
                      sx={{
                        width: '76px',
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': {
                            borderColor: invalid ? 'var(--color-red-darker)' : 'var(--color-neutral-dark)',
                          },
                          borderRadius: 1.25,
                        },
                      }}
                      value={selections[NUDGE_IDS.EVIDENCE]?.attempts ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                        updateSelections((s) => {
                          const updated = { 
                            ...s, 
                            [NUDGE_IDS.EVIDENCE]: { 
                              ...(s[NUDGE_IDS.EVIDENCE]||{}), 
                              attempts: Number.isNaN(val) ? undefined : val 
                            } 
                          };
                          // Clear validation if both fields are now valid
                          const newAttempts = Number.isNaN(val) ? undefined : val;
                          const newCorrect = updated[NUDGE_IDS.EVIDENCE]?.correct;
                          const bothFilled = Number.isInteger(newAttempts) && Number.isInteger(newCorrect);
                          const bothValid = bothFilled && newCorrect <= newAttempts;
                          if (bothValid && saveAttempted) {
                            setSaveAttempted(false);
                          }
                          return updated;
                        });
                      }}
                      error={invalid && oneFilled}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                      correct
                    </Typography>
                  </Box>
                  {invalid && helper && (
                    <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
                      {helper}
                    </Typography>
                  )}
                  <TextField
                    label="Add quote (optional)"
                    size="small"
                    fullWidth
                    sx={{ mt: 1 }}
                    value={selections[NUDGE_IDS.EVIDENCE]?.quote ?? ''}
                    onChange={(e) => updateSelections((s) => ({ ...s, [NUDGE_IDS.EVIDENCE]: { ...(s[NUDGE_IDS.EVIDENCE]||{}), quote: e.target.value } }))}
                  />
                </Box>
              );
            })()}
            {id === NUDGE_IDS.SUBJECTIVE && (
              <TextField
                label="Objective one-liner"
                size="small"
                fullWidth
                value={selections[NUDGE_IDS.SUBJECTIVE]?.objective_line ?? ''}
                onChange={(e) => updateSelections((s) => ({ ...s, [NUDGE_IDS.SUBJECTIVE]: { objective_line: e.target.value } }))}
              />
            )}
          </Box>
        );
      })}

      <Typography variant="subtitle2" sx={{ mb: 0.75, color: 'var(--color-text)', fontWeight: 700 }}>
        Final note
      </Typography>
      <Box aria-label="Updated note preview" sx={{
        mb: 2,
        border: '1px solid var(--color-border)',
        borderRadius: 2,
        p: 1.25,
        backgroundColor: 'var(--color-paper)'
      }}>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'var(--grey-900)' }}>
          {previewParts.originalPreview}
        </Typography>
        {/* faint divider between original and appended content */}
        {appendedLines.length > 0 && (
          <Box sx={{ my: 1, borderTop: '1px dashed var(--color-border)' }} />
        )}
        {appendedLines.length > 0 && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: 'var(--grey-900)' }}>
            {appendedLines.join('\n')}
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 1,
          mt: 1.5,
          flexWrap: 'nowrap',
          width: '100%'
        }}
      >
        <Button
          variant="outlined"
          onClick={onSkip}
          sx={{
            flex: 1,
            minWidth: 0,
            height: 42,
            fontWeight: 600,
            fontSize: '0.88rem',
            whiteSpace: 'nowrap',
            borderRadius: 1.5,
            borderColor: 'var(--grey-300)',
            color: 'var(--color-primary)'
          }}
        >
          Save without nudge
        </Button>
        <Button
          variant="contained"
            onClick={() => {
              if (!onApply) return;
              
              // Check if evidence validation is needed
              if (sampledIds.includes(NUDGE_IDS.EVIDENCE)) {
                const a = selections[NUDGE_IDS.EVIDENCE]?.attempts;
                const c = selections[NUDGE_IDS.EVIDENCE]?.correct;
                const aInt = Number.isInteger(a);
                const cInt = Number.isInteger(c);
                const oneFilled = (aInt && !cInt) || (!aInt && cInt);
                const tooMany = aInt && cInt && c > a;
                
                // Show validation errors if there are issues
                if (oneFilled || tooMany) {
                  setSaveAttempted(true);
                  return; // Don't save if validation fails
                }
              }
              
              // Flatten structured selections for saving
              const out = {};
              if (sampledIds.includes(NUDGE_IDS.DURATION)) {
                const r = selections[NUDGE_IDS.DURATION]?.range;
                if (r && CHIPS[NUDGE_IDS.DURATION].includes(r)) out.duration_range = r;
              }
              if (sampledIds.includes(NUDGE_IDS.MODALITY)) {
                const m = selections[NUDGE_IDS.MODALITY]?.modality;
                if (m && CHIPS[NUDGE_IDS.MODALITY].includes(m)) out.modality = m;
              }
              if (sampledIds.includes(NUDGE_IDS.INDEPENDENCE)) {
                const g = selections[NUDGE_IDS.INDEPENDENCE]?.independence;
                if (g && CHIPS[NUDGE_IDS.INDEPENDENCE].includes(g)) out.independence = g;
              }
              if (sampledIds.includes(NUDGE_IDS.EVIDENCE)) {
                const a = selections[NUDGE_IDS.EVIDENCE]?.attempts;
                const c = selections[NUDGE_IDS.EVIDENCE]?.correct;
                const q = selections[NUDGE_IDS.EVIDENCE]?.quote;
                if (Number.isInteger(a) && Number.isInteger(c)) {
                  out.evidence_attempts = a;
                  out.evidence_correct = c;
                }
                if (q && String(q).trim()) {
                  out.evidence_quote = String(q).trim();
                }
              }
              if (sampledIds.includes(NUDGE_IDS.SUBJECTIVE)) {
                const l = selections[NUDGE_IDS.SUBJECTIVE]?.objective_line;
                if (l && String(l).trim()) out.objective_line = String(l).trim();
              }
              onApply({ updated_text: fullUpdatedText, selections: out });
            }}
          disabled={(() => {
            // Disable if nothing is selected
            if (!hasAnySelection) return true;
            // Disable if evidence validation fails (one field filled or correct > attempts)
            if (sampledIds.includes(NUDGE_IDS.EVIDENCE)) {
              const a = selections[NUDGE_IDS.EVIDENCE]?.attempts;
              const c = selections[NUDGE_IDS.EVIDENCE]?.correct;
              const aInt = Number.isInteger(a);
              const cInt = Number.isInteger(c);
              const oneFilled = (aInt && !cInt) || (!aInt && cInt);
              const tooMany = aInt && cInt && c > a;
              if (oneFilled || tooMany) return true;
            }
            return false;
          })()}
          sx={{
            flex: 1,
            minWidth: 0,
            height: 42,
            fontWeight: 700,
            fontSize: '0.9rem',
            borderRadius: 1.5,
            boxShadow: 'none',
            whiteSpace: 'nowrap'
          }}
        >
          Apply and Save
        </Button>
      </Box>
    </Box>
  );
}
