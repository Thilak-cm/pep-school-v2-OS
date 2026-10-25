// StudentAssessmentSheet.jsx - #313: Per-student assessment drawer with history + append/correct
import React, { useState, useMemo } from 'react';
import { Box, Button, SwipeableDrawer, TextField, Typography } from '@mui/material';
import Chip from '@mui/material/Chip';
import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../firebase';
import useNotify from '../notifications/useNotify.js';

// "Current value" contract (#313)
function currentValues(obs) {
  const attempts = obs.attempts || [];
  if (attempts.length > 0) return attempts[attempts.length - 1].values || {};
  const result = {};
  for (const r of (obs.results || [])) result[r.resultNumber] = r.sourceValue;
  return result;
}

export default function StudentAssessmentSheet({
  open, onClose, observation, studentName, userRole, onUpdated,
}) {
  const notify = useNotify();
  const [formValues, setFormValues] = useState({});
  const [dateTaken, setDateTaken] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [showAppendForm, setShowAppendForm] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctResult, setCorrectResult] = useState(null);
  const [correctValue, setCorrectValue] = useState('');
  const [correctSaving, setCorrectSaving] = useState(false);

  const isAdmin = userRole === 'classroomadmin' || userRole === 'superadmin';
  const isTeacher = userRole === 'teacher';
  const obs = observation || {};
  const definitions = obs.resultDefinitions || [];
  const attempts = obs.attempts || [];
  const gradeStatus = obs.gradeStatus || 'graded';
  const isAbsent = gradeStatus === 'absent';
  const current = currentValues(obs);

  // Build history chain: original + attempts
  const historyChain = useMemo(() => {
    const chain = [];
    // Original from results[]
    const origValues = {};
    for (const r of (obs.results || [])) origValues[r.resultNumber] = r.sourceValue;
    chain.push({ label: 'Original', values: origValues, kind: gradeStatus === 'absent' ? 'absent' : 'original' });
    // Attempts
    for (const attempt of attempts) {
      chain.push({
        label: `Attempt ${attempt.n}`,
        values: attempt.values || {},
        kind: attempt.kind,
        date: attempt.dateTaken,
      });
    }
    return chain;
  }, [obs.results, attempts, gradeStatus]);

  // All result fields + date filled?
  const allFieldsFilled = definitions.every(
    (d) => (formValues[d.number] || '').trim(),
  ) && dateTaken;

  const handleSave = async () => {
    if (!allFieldsFilled || saving) return;
    setSaving(true);
    try {
      const fn = httpsCallable(cloudFunctions, 'appendAssessmentAttempt');
      await fn({
        observationId: obs.observationId || obs.id,
        values: Object.fromEntries(
          definitions.map((d) => [String(d.number), formValues[d.number]?.trim()]),
        ),
        dateTaken,
      });
      notify.success('Grade saved');
      onUpdated?.();
      setTimeout(() => onClose?.(), 250);
    } catch (err) {
      notify.error(err.message || 'Failed to save grade');
    } finally {
      setSaving(false);
    }
  };

  const handleCorrect = async () => {
    if (!correctValue.trim() || correctSaving || !correctResult) return;
    setCorrectSaving(true);
    try {
      const fn = httpsCallable(cloudFunctions, 'correctAssessmentGrade');
      await fn({
        observationId: obs.observationId || obs.id,
        resultNumber: correctResult.number,
        correctedValue: correctValue.trim(),
      });
      notify.success('Grade corrected');
      onUpdated?.();
      setCorrecting(false);
      setCorrectResult(null);
      setCorrectValue('');
    } catch (err) {
      notify.error(err.message || 'Failed to correct grade');
    } finally {
      setCorrectSaving(false);
    }
  };

  // Auto-open form when student is absent
  const shouldShowForm = showAppendForm || isAbsent;

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={!!open}
      onClose={() => onClose?.()}
      onOpen={() => {}}
      disableSwipeToOpen
      PaperProps={{
        sx: {
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          maxHeight: 'calc(100dvh - 48px)',
          overflow: 'auto',
        },
      }}
    >
      {/* Handle bar */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
        <Box sx={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'var(--color-border)' }} />
      </Box>

      <Box sx={{ px: 2.5, pb: 3 }}>
        {/* Student name + assessment */}
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>
          {studentName}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'var(--color-text-soft)' }}>
            {obs.assessmentName}
          </Typography>
          {obs.criticality === 'high' && (
            <Chip label="High" size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, backgroundColor: 'var(--color-indigo-bg)', color: 'var(--color-primary)' }} />
          )}
        </Box>

        {/* History chip chain */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {historyChain.map((entry, i) => {
            const isLatest = i === historyChain.length - 1 && entry.kind !== 'absent';
            const firstDef = definitions[0];
            const displayVal = firstDef ? (entry.values?.[firstDef.number] ?? '') : '';
            return (
              <Chip
                key={i}
                label={`${entry.label}${displayVal ? `: ${displayVal}` : ''}`}
                size="small"
                variant={isLatest ? 'filled' : 'outlined'}
                sx={{
                  fontSize: '0.72rem',
                  ...(isLatest ? { backgroundColor: 'var(--color-primary)', color: '#fff' } : {}),
                  ...(entry.kind === 'absent' ? { borderColor: 'var(--color-warning)', color: 'var(--color-warning)' } : {}),
                }}
              />
            );
          })}
        </Box>

        {/* Current values display */}
        {!shouldShowForm && (
          <Box sx={{ mb: 2 }}>
            {definitions.map((d) => (
              <Box key={d.number} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid var(--color-border)' }}>
                <Typography variant="body2" sx={{ color: 'var(--color-text-soft)' }}>{d.description}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{current[d.number] ?? '-'}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Append form */}
        {shouldShowForm && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
            {definitions.map((d) => (
              <TextField
                key={d.number}
                label={d.description}
                placeholder={`e.g. 72%`}
                size="small"
                fullWidth
                value={formValues[d.number] || ''}
                onChange={(e) => setFormValues((prev) => ({ ...prev, [d.number]: e.target.value }))}
              />
            ))}
            <TextField
              label="Date taken"
              type="date"
              size="small"
              fullWidth
              value={dateTaken}
              onChange={(e) => setDateTaken(e.target.value)}
              inputProps={{ max: new Date().toISOString().slice(0, 10) }}
            />
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!allFieldsFilled || saving}
              sx={{ mt: 0.5 }}
            >
              {saving ? 'Saving...' : isAbsent ? 'Save grade' : `Save attempt ${attempts.length + 1}`}
            </Button>
          </Box>
        )}

        {/* Add attempt button (when graded and form not showing) */}
        {!shouldShowForm && !isAbsent && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => setShowAppendForm(true)}
            sx={{ mb: 1.5, borderStyle: 'dashed' }}
          >
            + Add attempt {attempts.length + 1}
          </Button>
        )}

        {/* Lock note for teachers */}
        {isTeacher && (
          <Typography variant="caption" sx={{ color: 'var(--color-text-soft)', display: 'block', mt: 1 }}>
            Saved results are locked. To correct a grade, contact an admin.
          </Typography>
        )}

        {/* Admin correction */}
        {isAdmin && !correcting && (
          <Button
            variant="text"
            size="small"
            onClick={() => setCorrecting(true)}
            sx={{ mt: 1, color: 'var(--color-text-soft)', textTransform: 'none' }}
          >
            Correct original grade
          </Button>
        )}

        {isAdmin && correcting && (
          <Box sx={{ mt: 1.5, p: 1.5, border: '1px solid var(--color-border)', borderRadius: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
              Correct original grade
            </Typography>
            {definitions.map((d) => (
              <Button
                key={d.number}
                variant={correctResult?.number === d.number ? 'contained' : 'outlined'}
                size="small"
                onClick={() => { setCorrectResult(d); setCorrectValue(current[d.number] || ''); }}
                sx={{ mr: 0.5, mb: 0.5 }}
              >
                {d.description}
              </Button>
            ))}
            {correctResult && (
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <TextField
                  label={`Corrected ${correctResult.description}`}
                  size="small"
                  fullWidth
                  value={correctValue}
                  onChange={(e) => setCorrectValue(e.target.value)}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleCorrect}
                  disabled={!correctValue.trim() || correctSaving}
                >
                  {correctSaving ? '...' : 'Save'}
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </SwipeableDrawer>
  );
}
