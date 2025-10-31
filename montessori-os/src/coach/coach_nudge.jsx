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

export default function CoachNudge({ noteText, onApply, onSkip, forcedNudges, maxNudges }) {
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
  }, [forcedNudges, maxNudges]);

  // Track if save attempt has been made (only after save attempt)
  const [saveAttempted, setSaveAttempted] = useState(false);

  // Selections per nudge (no defaults)
  const [selections, setSelections] = useState({
    [NUDGE_IDS.DURATION]: { range: undefined },
    [NUDGE_IDS.MODALITY]: { modality: undefined },
    [NUDGE_IDS.INDEPENDENCE]: { independence: undefined },
    [NUDGE_IDS.EVIDENCE]: { attempts: undefined, correct: undefined, quote: '' },
    [NUDGE_IDS.SUBJECTIVE]: { objective_line: '' },
  });

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
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Coach Pepper thinks this note can be improved!
      </Typography>
      {sampledIds.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {`Here ${sampledIds.length === 1 ? 'is' : 'are'} ${sampledIds.length} way${sampledIds.length === 1 ? '' : 's'} I think this note can be enhanced.`}
        </Typography>
      )}

      {/* Render controls per selected nudge (PRD priority order) */}
      {sampledIds.map((id) => {
        const copy = MICROCOPY_KEYS[id] || '';
        return (
          <Box key={id} sx={{ mb: 2 }}>
            {copy && (
              <Typography variant="subtitle2" sx={{ mb: 1, color: '#1e293b', fontWeight: 600 }}>
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
                    onClick={() => setSelections((s) => ({ ...s, [NUDGE_IDS.DURATION]: { range: c } }))}
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
                    onClick={() => setSelections((s) => ({ ...s, [NUDGE_IDS.MODALITY]: { modality: c } }))}
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
                    onClick={() => setSelections((s) => ({ ...s, [NUDGE_IDS.INDEPENDENCE]: { independence: c } }))}
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
                      type="number"
                      inputProps={{ min: 0, style: { textAlign: 'center', width: '60px' } }}
                      sx={{ 
                        width: '80px',
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': {
                            borderColor: invalid ? '#d32f2f' : '#d0d7de',
                          },
                        },
                      }}
                      value={selections[NUDGE_IDS.EVIDENCE]?.correct ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                        setSelections((s) => {
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
                    <Typography variant="body1" sx={{ color: '#6b7280', fontWeight: 500 }}>
                      /
                    </Typography>
                    <TextField
                      placeholder="__"
                      size="small"
                      type="number"
                      inputProps={{ min: 0, style: { textAlign: 'center', width: '60px' } }}
                      sx={{ 
                        width: '80px',
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': {
                            borderColor: invalid ? '#d32f2f' : '#d0d7de',
                          },
                        },
                      }}
                      value={selections[NUDGE_IDS.EVIDENCE]?.attempts ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                        setSelections((s) => {
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
                    onChange={(e) => setSelections((s) => ({ ...s, [NUDGE_IDS.EVIDENCE]: { ...(s[NUDGE_IDS.EVIDENCE]||{}), quote: e.target.value } }))}
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
                onChange={(e) => setSelections((s) => ({ ...s, [NUDGE_IDS.SUBJECTIVE]: { objective_line: e.target.value } }))}
              />
            )}
          </Box>
        );
      })}

      <Typography variant="subtitle2" sx={{ mb: 1, color: '#1e293b', fontWeight: 700 }}>
        Final note
      </Typography>
      <Box aria-label="Updated note preview" sx={{
        mb: 2,
        border: '1px solid #e2e8f0',
        borderRadius: 2,
        p: 1.5,
        backgroundColor: '#fff'
      }}>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: '#0f172a' }}>
          {previewParts.originalPreview}
        </Typography>
        {/* faint divider between original and appended content */}
        {appendedLines.length > 0 && (
          <Box sx={{ my: 1, borderTop: '1px dashed #e2e8f0' }} />
        )}
        {appendedLines.length > 0 && (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: '#0f172a' }}>
            {appendedLines.join('\n')}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button variant="text" onClick={onSkip}>Save without</Button>
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
        >
          Apply and Save
        </Button>
      </Box>
    </Box>
  );
}
