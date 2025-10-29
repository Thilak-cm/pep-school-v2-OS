import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, TextField, Divider,
  Alert, CircularProgress, Chip, ListItemButton, Collapse
} from '@mui/material';
import { Settings, Bolt, ExpandMore, ExpandLess, Save, Cancel } from '@mui/icons-material';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, cloudFunctions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import useNotify from '../notifications/useNotify';
import { COACH_MODEL_DISPLAY } from '../../../config/coachConstants';

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
  const isAdmin = userRole === 'admin';
  const notify = useNotify();

  // State management
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [docState, setDocState] = useState(null);
  const [enabledNudges, setEnabledNudges] = useState([]);
  const [maxReturnNudges, setMaxReturnNudges] = useState(1);
  const [saving, setSaving] = useState(false);
  
  // Track original values to detect changes
  const [originalEnabledNudges, setOriginalEnabledNudges] = useState([]);
  const [originalMaxReturnNudges, setOriginalMaxReturnNudges] = useState(1);
  
  // Collapsible section states
  const [introExpanded, setIntroExpanded] = useState(false);
  const [nudgeBlocksExpanded, setNudgeBlocksExpanded] = useState(false);
  const [finalPromptExpanded, setFinalPromptExpanded] = useState(false);
  
  // Coach test run states
  const [noteText, setNoteText] = useState('');
  const [coachResult, setCoachResult] = useState(null);
  const [runningCoach, setRunningCoach] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [coachError, setCoachError] = useState('');

  const coachRef = useMemo(() => doc(db, 'ai_prompts', 'coach'), []);

  // Load initial data from Firestore
  useEffect(() => {
    if (!isAdmin) return;
    
    (async () => {
      try {
        setLoading(true);
        const snap = await getDoc(coachRef);
        if (snap.exists()) {
          const data = snap.data() || {};
          setDocState({ id: snap.id, ...data });
          const initialEnabledNudges = data.enabledNudges || [];
          const initialMaxReturnNudges = data.maxReturnNudges || 1;
          setEnabledNudges(initialEnabledNudges);
          setMaxReturnNudges(initialMaxReturnNudges);
          // Store original values for change detection
          setOriginalEnabledNudges(initialEnabledNudges);
          setOriginalMaxReturnNudges(initialMaxReturnNudges);
        } else {
          setError('Coach prompt configuration not found in Firestore');
        }
      } catch (e) {
        console.error('Error loading coach prompt:', e);
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
      
      const payload = {
        enabledNudges,
        maxReturnNudges,
        disabledNudges,
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
      }
      
      // Show success notification
      notify.success('Coach prompt configuration saved successfully');
    } catch (e) {
      console.error('Error updating coach prompt:', e);
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
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = 
    JSON.stringify(enabledNudges.sort()) !== JSON.stringify(originalEnabledNudges.sort()) ||
    maxReturnNudges !== originalMaxReturnNudges;

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
      const payload = { noteText: trimmedText };
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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
        <CircularProgress />
      </Box>
    );
  }

  const disabledNudges = ALL_NUDGES.filter(n => !enabledNudges.includes(n));
  // Count based on original/saved enabled nudges, not current working state
  const enabledNudgeBlocksCount = originalEnabledNudges.filter(n => docState?.nudgeBlocks?.[n]).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Coach Nudges Section */}
      <SectionCard 
        title="Coach Nudges" 
        subtitle="Toggle which nudges Coach can suggest. Disabled nudges are omitted from the system prompt."
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>All nudges</Typography>
            <Chip label={`Model: ${COACH_MODEL_DISPLAY}`} size="small" color="default" variant="outlined" />
          </Box>
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
                      cursor: saving ? 'not-allowed' : 'pointer'
                    }
                  }}
                />
              );
            })}
          </Box>
          
          {/* Maximum Return Nudges */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Maximum Return Nudges</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <TextField
                type="number"
                value={maxReturnNudges}
                onChange={handleMaxReturnNudgesChange}
                slotProps={{ input: { min: 1, max: ALL_NUDGES.length, step: 1 } }}
                size="small"
                disabled={saving}
                sx={{ maxWidth: '120px' }}
              />
              <Button
                variant="outlined"
                startIcon={<Cancel />}
                onClick={handleCancel}
                disabled={!hasUnsavedChanges || saving}
                color="error"
                sx={{ textTransform: 'none' }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                startIcon={<Save />}
                onClick={handleSave}
                disabled={!hasUnsavedChanges || saving}
                sx={{ textTransform: 'none' }}
              >
                Save
              </Button>
            </Box>
          </Box>
        </Box>
      </SectionCard>

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
                        No nudges identified. The observation looks complete!
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
