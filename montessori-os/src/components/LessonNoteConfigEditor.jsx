import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Card,
  CardContent,
  Typography,
  TextField,
  IconButton,
  Button,
  Stack,
  Alert,
  Divider,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  CircularProgress,
  Collapse
} from '@mui/material';
import {
  Add,
  Delete,
  ArrowUpward,
  ArrowDownward,
  Save,
  ExpandMore,
  ExpandLess
} from '@mui/icons-material';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { isSuperAdmin } from '../utils/roleUtils';
import { LESSON_PROGRAM_DIMENSIONS } from '../utils/lessonNoteConstraints';
import useNotify from '../notifications/useNotify';

const PROGRAMS = ['toddler', 'primary', 'elementary', 'adolescent'];

const PROGRAM_LABELS = {
  toddler: 'Toddler',
  primary: 'Primary',
  elementary: 'Elementary',
  adolescent: 'Adolescent',
};

const TAB_SX = {
  minHeight: 48,
  '& .MuiTab-root': { textTransform: 'none', minHeight: 48, fontWeight: 600 },
  '& .MuiTabs-indicator': { height: 3, borderRadius: 2, backgroundColor: 'var(--color-primary)' }
};

const LessonNoteConfigEditor = ({ userRole }) => {
  const notify = useNotify();
  const isAdmin = isSuperAdmin(userRole);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [activeProgram, setActiveProgram] = useState('toddler');
  const [titlesByProgram, setTitlesByProgram] = useState(() => ({
    toddler: [],
    primary: [],
    elementary: [],
    adolescent: [],
  }));
  const [dimensionsByProgram, setDimensionsByProgram] = useState(() => ({
    toddler: [...(LESSON_PROGRAM_DIMENSIONS.toddler || LESSON_PROGRAM_DIMENSIONS.primary || [])],
    primary: [...(LESSON_PROGRAM_DIMENSIONS.primary || [])],
    elementary: [...(LESSON_PROGRAM_DIMENSIONS.elementary || [])],
    adolescent: [...(LESSON_PROGRAM_DIMENSIONS.adolescent || [])],
  }));

  const [originalTitles, setOriginalTitles] = useState(null);
  const [originalDimensions, setOriginalDimensions] = useState(null);
  const [titleSearch, setTitleSearch] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    type: null, // 'dimension' | 'title'
    programId: null,
    index: null,
    label: '',
  });
  const [dimsOpen, setDimsOpen] = useState(false);
  const [titlesOpen, setTitlesOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const ref = doc(db, 'config', 'lessonNote');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() || {};

          const sortTitles = (list) =>
            Array.isArray(list)
              ? [...list].map((t) => String(t || '')).sort((a, b) => a.localeCompare(b))
              : [];

          const nextTitles = {
            toddler: sortTitles(data.lesson_toddler_titles),
            primary: sortTitles(data.lesson_primary_titles),
            elementary: sortTitles(data.lesson_elementary_titles),
            adolescent: sortTitles(data.lesson_adolescent_titles),
          };

          const nextDims = {
            toddler: Array.isArray(data.lesson_toddler_dimensions)
              ? [...data.lesson_toddler_dimensions]
              : [...(LESSON_PROGRAM_DIMENSIONS.toddler || LESSON_PROGRAM_DIMENSIONS.primary || [])],
            primary: Array.isArray(data.lesson_primary_dimensions)
              ? [...data.lesson_primary_dimensions]
              : [...(LESSON_PROGRAM_DIMENSIONS.primary || [])],
            elementary: Array.isArray(data.lesson_elementary_dimensions)
              ? [...data.lesson_elementary_dimensions]
              : [...(LESSON_PROGRAM_DIMENSIONS.elementary || [])],
            adolescent: Array.isArray(data.lesson_adolescent_dimensions)
              ? [...data.lesson_adolescent_dimensions]
              : [...(LESSON_PROGRAM_DIMENSIONS.adolescent || [])],
          };

          setTitlesByProgram(nextTitles);
          setDimensionsByProgram(nextDims);
          setOriginalTitles(nextTitles);
          setOriginalDimensions(nextDims);
        } else {
          // No config doc yet – keep defaults and let admin save or run seed script
          notify.info('Lesson note config not found. You can run the seed script or create it here.');
          const nextDims = {
            toddler: [...(LESSON_PROGRAM_DIMENSIONS.toddler || LESSON_PROGRAM_DIMENSIONS.primary || [])],
            primary: [...(LESSON_PROGRAM_DIMENSIONS.primary || [])],
            elementary: [...(LESSON_PROGRAM_DIMENSIONS.elementary || [])],
            adolescent: [...(LESSON_PROGRAM_DIMENSIONS.adolescent || [])],
          };
          setDimensionsByProgram(nextDims);
          setOriginalTitles({ ...titlesByProgram });
          setOriginalDimensions(nextDims);
        }
      } catch {
        setError('Failed to load lesson note configuration.');
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleProgramChange = (_, value) => {
    if (!value) return;
    setActiveProgram(value);
    setTitleSearch('');
  };

  const updateTitles = (programId, updater) => {
    setTitlesByProgram((prev) => ({
      ...prev,
      [programId]: (() => {
        const base = prev[programId] || [];
        const next = updater(base);
        return [...next].map((t) => String(t || '')).sort((a, b) => a.localeCompare(b));
      })(),
    }));
  };

  const updateDimensions = (programId, updater) => {
    setDimensionsByProgram((prev) => ({
      ...prev,
      [programId]: updater(prev[programId] || []),
    }));
  };

  const addTitle = () => {
    const programId = activeProgram;
    updateTitles(programId, (list) => [...list, '']);
  };

  const updateTitleAt = (index, value) => {
    const programId = activeProgram;
    updateTitles(programId, (list) => {
      const next = [...list];
      next[index] = value;
      return next;
    });
  };

  const addDimension = () => {
    const programId = activeProgram;
    updateDimensions(programId, (list) => [...list, '']);
  };

  const updateDimensionAt = (index, value) => {
    const programId = activeProgram;
    updateDimensions(programId, (list) => {
      const next = [...list];
      next[index] = value;
      return next;
    });
  };

  const moveDimension = (index, direction) => {
    const programId = activeProgram;
    updateDimensions(programId, (list) => {
      const next = [...list];
      const target = index + direction;
      if (target < 0 || target >= next.length) return next;
      const tmp = next[target];
      next[target] = next[index];
      next[index] = tmp;
      return next;
    });
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!originalTitles || !originalDimensions) return false;
    const serialize = (obj) => JSON.stringify(obj);
    return (
      serialize(titlesByProgram) !== serialize(originalTitles) ||
      serialize(dimensionsByProgram) !== serialize(originalDimensions)
    );
  }, [titlesByProgram, dimensionsByProgram, originalTitles, originalDimensions]);

  const currentTitles = titlesByProgram[activeProgram] || [];
  const currentDimensions = dimensionsByProgram[activeProgram] || [];
  const canRemoveDimension = currentDimensions.length > 1;

  const filteredTitles = useMemo(() => {
    const q = titleSearch.trim().toLowerCase();
    if (!q) return currentTitles;
    return currentTitles.filter((t) => String(t).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titlesByProgram, activeProgram, titleSearch]);

  const openDeleteDialog = (type, index, label, programId) => {
    setDeleteDialog({
      open: true,
      type,
      index,
      label: label || '',
      programId: programId || activeProgram,
    });
  };

  const handleCloseDeleteDialog = () => {
    setDeleteDialog({
      open: false,
      type: null,
      index: null,
      label: '',
      programId: null,
    });
  };

  const handleConfirmDelete = () => {
    const { type, index, programId, label: _label } = deleteDialog;
    if (index == null || !programId || !type) {
      handleCloseDeleteDialog();
      return;
    }

    if (type === 'dimension') {
      updateDimensions(programId, (list) => {
        if (list.length <= 1) return list;
        return list.filter((_, idx) => idx !== index);
      });
      notify.success('Dimension removed from config');
    } else if (type === 'title') {
      updateTitles(programId, (list) => list.filter((_, idx) => idx !== index));
      notify.success('Lesson title removed from config');
    }

    handleCloseDeleteDialog();
  };

  const handleSave = async () => {
    if (!isAdmin || saving) return;

    try {
      setSaving(true);
      setError('');

      // Enforce non-empty dimensions per program
      for (const pid of PROGRAMS) {
        const dims = dimensionsByProgram[pid] || [];
        const nonEmpty = dims.map((d) => String(d || '').trim()).filter(Boolean);
        if (nonEmpty.length === 0) {
          throw new Error(`Please configure at least one dimension for ${PROGRAM_LABELS[pid]}.`);
        }
      }

      const payload = {
        lesson_toddler_titles: (titlesByProgram.toddler || []).map((t) => String(t || '').trim()).filter(Boolean),
        lesson_primary_titles: (titlesByProgram.primary || []).map((t) => String(t || '').trim()).filter(Boolean),
        lesson_elementary_titles: (titlesByProgram.elementary || []).map((t) => String(t || '').trim()).filter(Boolean),
        lesson_adolescent_titles: (titlesByProgram.adolescent || []).map((t) => String(t || '').trim()).filter(Boolean),

        lesson_toddler_dimensions: (dimensionsByProgram.toddler || [])
          .map((d) => String(d || '').trim())
          .filter(Boolean),
        lesson_primary_dimensions: (dimensionsByProgram.primary || [])
          .map((d) => String(d || '').trim())
          .filter(Boolean),
        lesson_elementary_dimensions: (dimensionsByProgram.elementary || [])
          .map((d) => String(d || '').trim())
          .filter(Boolean),
        lesson_adolescent_dimensions: (dimensionsByProgram.adolescent || [])
          .map((d) => String(d || '').trim())
          .filter(Boolean),
      };

      const ref = doc(db, 'config', 'lessonNote');
      await setDoc(ref, payload, { merge: true });

      setOriginalTitles({ ...titlesByProgram });
      setOriginalDimensions({ ...dimensionsByProgram });
      notify.success('Lesson note configuration saved');
    } catch (_e) {
      setError(_e?.message || 'Failed to save lesson note configuration.');
    } finally {
      setSaving(false);
    }
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
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          minHeight: 200,
        }}
      >
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Coach Pepper is loading lesson note configuration...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {error && (
        <Alert severity="error" onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Program tabs */}
      <Card sx={{ borderRadius: 2 }}>
        <CardContent sx={{ p: 1.5 }}>
          <Box
            sx={{
              borderRadius: 1,
              backgroundColor: 'white',
              border: '1px solid var(--color-border)',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}
          >
            <Tabs
              value={activeProgram}
              onChange={handleProgramChange}
              variant="scrollable"
              scrollButtons="auto"
              sx={TAB_SX}
            >
              {PROGRAMS.map((pid) => (
                <Tab key={pid} value={pid} label={PROGRAM_LABELS[pid]} />
              ))}
            </Tabs>
          </Box>
        </CardContent>
      </Card>

      {/* Dimensions card (collapsible) */}
      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Dimensions
            </Typography>
            <IconButton
              size="small"
              onClick={() => setDimsOpen((v) => !v)}
            >
              {dimsOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          </Box>
          <Collapse in={dimsOpen}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.5,
              }}
            >
              <Chip
                label={`${currentDimensions.length} dimension${currentDimensions.length === 1 ? '' : 's'}`}
                size="small"
                color="default"
                variant="outlined"
              />
              <Button
                size="small"
                startIcon={<Add />}
                variant="outlined"
                onClick={addDimension}
                disabled={saving}
                sx={{ textTransform: 'none' }}
              >
                Add dimension
              </Button>
            </Box>
            <Stack spacing={1.5}>
              {currentDimensions.map((value, index) => (
                <Box
                  key={`${activeProgram}-dimension-${index}`}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    value={value}
                    onChange={(e) => updateDimensionAt(index, e.target.value)}
                    placeholder="Dimension label"
                  />
                  <Tooltip title="Move up">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => moveDimension(index, -1)}
                        disabled={saving || index === 0}
                      >
                        <ArrowUpward fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Move down">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => moveDimension(index, 1)}
                        disabled={saving || index === currentDimensions.length - 1}
                      >
                        <ArrowDownward fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title={canRemoveDimension ? 'Remove dimension' : 'At least one dimension is required'}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={() =>
                          openDeleteDialog('dimension', index, value, activeProgram)
                        }
                        disabled={saving || !canRemoveDimension}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              ))}
            </Stack>
          </Collapse>
        </CardContent>
      </Card>

      {/* Lesson titles card (collapsible) */}
      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Lesson Titles
            </Typography>
            <IconButton
              size="small"
              onClick={() => setTitlesOpen((v) => !v)}
            >
              {titlesOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          </Box>
          <Collapse in={titlesOpen}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 2,
                gap: 1,
              }}
            >
              <TextField
                size="small"
                fullWidth
                placeholder="Search lesson titles"
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
              />
              <Button
                size="small"
                startIcon={<Add />}
                variant="outlined"
                onClick={addTitle}
                disabled={saving}
                sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
              >
                Add title
              </Button>
            </Box>
            {filteredTitles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No titles configured yet. Add a few suggestions to get started.
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 260, overflowY: 'auto', pr: 0.5 }}>
                <Stack spacing={1.5}>
                  {filteredTitles.map((value, index) => {
                    const originalIndex = currentTitles.indexOf(value);
                    const idx = originalIndex === -1 ? index : originalIndex;
                    return (
                      <Box
                        key={`${activeProgram}-title-${index}-${value}`}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <TextField
                          fullWidth
                          size="small"
                          value={value}
                          onChange={(e) => updateTitleAt(idx, e.target.value)}
                          placeholder="Lesson title"
                        />
                        <Tooltip title="Remove title">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() =>
                                openDeleteDialog('title', idx, value, activeProgram)
                              }
                              disabled={saving}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            )}
          </Collapse>
        </CardContent>
      </Card>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave}
          disabled={saving || !hasUnsavedChanges}
          sx={{ textTransform: 'none', minWidth: 120 }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </Box>

      <Dialog
        open={deleteDialog.open}
        onClose={handleCloseDeleteDialog}
      >
        <DialogTitle>Confirm delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteDialog.type === 'dimension'
              ? `Remove this dimension from ${PROGRAM_LABELS[deleteDialog.programId] || 'this program'}?`
              : `Remove this lesson title from ${PROGRAM_LABELS[deleteDialog.programId] || 'this program'}?`}
          </DialogContentText>
          {deleteDialog.label && (
            <Box sx={{ mt: 1.5 }}>
              <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                {deleteDialog.label}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog}>
            Cancel
          </Button>
          <Button
            color="error"
            onClick={handleConfirmDelete}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LessonNoteConfigEditor;
