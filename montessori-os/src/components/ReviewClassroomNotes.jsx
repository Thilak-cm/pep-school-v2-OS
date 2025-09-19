import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Button,
  CircularProgress,
  Stack,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import { Download, Refresh } from '@mui/icons-material';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import exportObservations from '../utils/export_observations';
import useNotify from '../notifications/useNotify';

const MENU_PROPS = {
  PaperProps: {
    style: {
      maxHeight: 48 * 6.5 + 8,
      width: 280
    }
  }
};

const getTimestampValue = (observation) => {
  const source = observation?.observedAt || observation?.timestamp;
  if (!source) return 0;
  if (source.seconds) return source.seconds * 1000;
  if (typeof source.toDate === 'function') return source.toDate().getTime();
  if (source instanceof Date) return source.getTime();
  const parsed = Date.parse(source);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const buildGroupedByClassroom = (notes = [], classrooms = []) => {
  const classroomMeta = new Map(
    classrooms.map((cls, index) => [cls.id, { label: cls.name || cls.id, order: index }])
  );

  const groups = new Map();

  notes.forEach((note) => {
    const rawId = note.classroomId || note.classroom || note.classroomName || 'Unspecified_Classroom';
    const id = String(rawId);
    if (!groups.has(id)) {
      const meta = classroomMeta.get(id);
      groups.set(id, {
        id,
        label: meta?.label || note.classroomName || id,
        order: meta?.order ?? Number.MAX_SAFE_INTEGER,
        observations: []
      });
    }
    groups.get(id).observations.push(note);
  });

  return Array.from(groups.values()).sort((a, b) => a.order - b.order);
};

function ReviewClassroomNotes({ currentUser }) {
  const notify = useNotify();
  const [classrooms, setClassrooms] = useState([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(true);
  const [selectedClassroomIds, setSelectedClassroomIds] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [fetchingNotes, setFetchingNotes] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('json');
  const [exportNotes, setExportNotes] = useState([]);
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');

  useEffect(() => {
    const fetchClassrooms = async () => {
      setLoadingClassrooms(true);
      try {
        const snapshot = await getDocs(collection(db, 'classrooms'));
        const list = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
        setClassrooms(list);
      } catch (err) {
        console.error('Error loading classrooms for export', err);
        notify.error('Unable to load classrooms right now. Please try again.', {
          id: 'export-classrooms-load-error',
          duration: 4000
        });
      } finally {
        setLoadingClassrooms(false);
      }
    };

    fetchClassrooms();
  }, []);

  const selectedClassrooms = useMemo(
    () => classrooms.filter(cls => selectedClassroomIds.includes(cls.id)),
    [classrooms, selectedClassroomIds]
  );

  const handleSelectChange = (event) => {
    const value = event.target.value;
    setSelectedClassroomIds(typeof value === 'string' ? value.split(',') : value);
  };

  const resetExportState = () => {
    setConfirmOpen(false);
    setExportNotes([]);
    setExportDateFrom('');
    setExportDateTo('');
    setExporting(false);
    setFetchingNotes(false);
  };

  const loadObservationsForSelection = async () => {
    const observations = [];

    await Promise.all(
      selectedClassrooms.map(async (classroom) => {
        const notesQuery = query(
          collectionGroup(db, 'observations'),
          where('classroomId', '==', classroom.id)
        );
        const snapshot = await getDocs(notesQuery);
        snapshot.forEach(doc => {
          observations.push({ id: doc.id, classroomName: classroom.name, classroomId: classroom.id, ...doc.data() });
        });
      })
    );

    return observations.sort((a, b) => getTimestampValue(b) - getTimestampValue(a));
  };

  const handleExport = async (format = 'json') => {
    if (!selectedClassroomIds.length) {
      notify.warning('Select at least one classroom to export notes.', { id: 'export-classrooms-none', duration: 3000 });
      return;
    }

    setExportFormat(format);
    setExportNotes([]);
    setExportDateFrom('');
    setExportDateTo('');
    setConfirmOpen(true);
    setFetchingNotes(true);

    try {
      const observations = await loadObservationsForSelection();

      if (!observations.length) {
        resetExportState();
        notify.warning('No notes found for the selected classroom(s).', { id: 'export-classrooms-empty', duration: 3500 });
        return;
      }

      setExportNotes(observations);
    } catch (err) {
      console.error('Error exporting classroom notes', err);
      resetExportState();
      notify.error('Failed to prepare notes for export. Please try again.', { id: 'export-classrooms-prepare-error', duration: 4000 });
      return;
    } finally {
      setFetchingNotes(false);
    }
  };

  const handleExportCancel = () => {
    resetExportState();
  };

  const filterObservationsByDate = (notes) => {
    if (!notes || !notes.length) return [];
    const fromMs = exportDateFrom ? new Date(`${exportDateFrom}T00:00:00`).getTime() : null;
    const toMs = exportDateTo ? new Date(`${exportDateTo}T23:59:59`).getTime() : null;

    return notes.filter((note) => {
      const timestamp = getTimestampValue(note);
      if (!timestamp) return true;
      if (fromMs && timestamp < fromMs) return false;
      if (toMs && timestamp > toMs) return false;
      return true;
    });
  };

  const filteredExportNotes = useMemo(
    () => filterObservationsByDate(exportNotes),
    [exportNotes, exportDateFrom, exportDateTo]
  );

  const handleExportConfirm = () => {
    if (!exportNotes.length) {
      return;
    }

    const notesToExport = filteredExportNotes;

    if (!notesToExport.length) {
      return;
    }

    setExporting(true);

    try {
      const subjectTitle = selectedClassrooms.length === 1
        ? `${selectedClassrooms[0]?.name || 'Classroom'} Notes`
        : `Classroom Notes (${selectedClassrooms.length} classes)`;

      const groupedByClassroom = buildGroupedByClassroom(notesToExport, selectedClassrooms);

      const result = exportObservations({
        observations: notesToExport,
        currentUser,
        format: exportFormat,
        exportType: 'classroom_notes_export',
        subject: {
          type: 'classroom_collection',
          classroomIds: selectedClassroomIds,
          classroomNames: selectedClassrooms.map(cls => cls.name || cls.id),
          title: subjectTitle,
          groupedBy: 'classroom',
          selectedDateRange: {
            from: exportDateFrom || null,
            to: exportDateTo || null
          }
        },
        textHeader: subjectTitle,
        groupedObservations: groupedByClassroom
      });

      if (!result?.success) {
        throw new Error(result?.error || 'Export failed');
      }

      notify.success(`Exported ${result.observationCount} notes.`, {
        id: 'export-classrooms-success',
        duration: 3500
      });
      resetExportState();
    } catch (err) {
      console.error('Error exporting classroom notes', err);
      setExporting(false);
      notify.error('Failed to export notes. Please try again.', {
        id: 'export-classrooms-error',
        duration: 4000
      });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Card sx={{ borderRadius: 2 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, color: '#1e293b' }}>
              Review Classroom Notes
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
              Select one or more classrooms to export every student note for manual review.
            </Typography>
          </Box>

          {loadingClassrooms ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                Loading classrooms…
              </Typography>
            </Box>
          ) : (
            <FormControl fullWidth>
              <InputLabel id="classroom-multi-select-label">Classrooms</InputLabel>
              <Select
                labelId="classroom-multi-select-label"
                multiple
                value={selectedClassroomIds}
                onChange={handleSelectChange}
                label="Classrooms"
                renderValue={(selected) => {
                  if (!selected.length) return 'Select classrooms';
                  if (selected.length > 3) {
                    return `${selected.length} classrooms selected`;
                  }
                  const names = classrooms
                    .filter(cls => selected.includes(cls.id))
                    .map(cls => cls.name || cls.id);
                  return names.join(', ');
                }}
                MenuProps={MENU_PROPS}
              >
                {classrooms.map((classroom) => (
                  <MenuItem key={classroom.id} value={classroom.id}>
                    <Checkbox checked={selectedClassroomIds.includes(classroom.id)} />
                    <ListItemText
                      primary={classroom.name || 'Unnamed classroom'}
                      secondary={classroom.teacherNames?.join(', ')}
                    />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {selectedClassrooms.length > 0 && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" flex={1}>
                {selectedClassrooms.map(cls => (
                  <Chip key={cls.id} label={cls.name || cls.id} />
                ))}
              </Stack>
              <Button
                variant="text"
                startIcon={<Refresh />}
                onClick={() => setSelectedClassroomIds([])}
                disabled={fetchingNotes || !selectedClassroomIds.length}
                sx={{ alignSelf: { xs: 'flex-start', sm: 'auto' }, minWidth: 'unset' }}
              >
                Clear selection
              </Button>
            </Stack>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Download />}
              onClick={() => handleExport('json')}
              disabled={loadingClassrooms || fetchingNotes}
              sx={{ flex: 1 }}
            >
              Export as JSON
            </Button>
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={() => handleExport('txt')}
              disabled={loadingClassrooms || fetchingNotes}
              sx={{ flex: 1 }}
            >
              Export as TXT
            </Button>
          </Stack>

        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onClose={handleExportCancel}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: 420,
            width: 'calc(100% - 32px)',
            mx: 'auto'
          }
        }}
      >
        <DialogTitle sx={{ pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Download color="primary" />
            <Typography variant="h6">Confirm Export</Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {fetchingNotes ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                Preparing notes for export…
              </Typography>
            </Box>
          ) : (
            <>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Export {filteredExportNotes.length} {filteredExportNotes.length === 1 ? 'note' : 'notes'} across
                {' '}
                {selectedClassrooms.length === 1
                  ? `${selectedClassrooms[0]?.name || 'this classroom'}`
                  : `${selectedClassrooms.length} classrooms`}?
              </Typography>

              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  sx={{ mb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 500 }}
                >
                  Date Range (optional)
                </Typography>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    setExportDateFrom('');
                    setExportDateTo('');
                  }}
                  disabled={!exportDateFrom && !exportDateTo}
                  sx={{ alignSelf: 'flex-start', mb: 1, p: 0, minWidth: 'unset' }}
                >
                  Clear dates
                </Button>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="From Date"
                    type="date"
                    size="small"
                    value={exportDateFrom}
                    onChange={(e) => setExportDateFrom(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="To Date"
                    type="date"
                    size="small"
                    value={exportDateTo}
                    onChange={(e) => setExportDateTo(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    placeholder="Today"
                    sx={{ flex: 1, '& input::placeholder': { opacity: 0.6, color: 'text.disabled' } }}
                  />
                </Box>
              </Box>

              <Box
                sx={{
                  p: 2,
                  backgroundColor: '#f8fafc',
                  borderRadius: 2,
                  border: '1px solid #e2e8f0',
                  mb: 2
                }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Classrooms:</strong>{' '}
                  {selectedClassrooms.map(cls => cls.name || cls.id).join(', ')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Export Type:</strong> Selected Classrooms
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Count:</strong> {filteredExportNotes.length} out of {exportNotes.length} notes
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Date Range:</strong>{' '}
                  {exportDateFrom || exportDateTo
                    ? `${exportDateFrom || 'Start'} to ${exportDateTo || 'Today'}`
                    : 'All dates'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Format:</strong> {exportFormat.toUpperCase()} file (.{exportFormat})
                </Typography>
              </Box>

              {filteredExportNotes.length === 0 && exportNotes.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  No notes match the selected date range. Adjust the filters to proceed.
                </Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
          <Button
            onClick={handleExportCancel}
            variant="outlined"
            sx={{ flex: 1 }}
            disabled={exporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExportConfirm}
            variant="contained"
            sx={{ flex: 1 }}
            disabled={exporting || fetchingNotes || filteredExportNotes.length === 0}
            startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <Download />}
          >
            {exporting ? 'Exporting…' : `Export as ${exportFormat.toUpperCase()}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ReviewClassroomNotes;
