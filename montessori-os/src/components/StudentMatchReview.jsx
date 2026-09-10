import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  Chip,
  Drawer,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemText,
  Radio,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { Search, Pencil as Edit, CircleAlert as ErrorIcon } from '../icons';
import { fuzzySearchStudents } from '../utils/fuzzySearch';
import { ZONE } from './BulkUploadPage.helpers';

// Zone-dependent row density ("Option D", issue #285): rows needing attention
// (none/review) render as expanded radio-style cards with candidates visible
// at a glance; confident auto rows compress into compact one-liners so a
// 30-name sheet stays scannable on a phone. Sort order none -> review -> auto
// puts the work at the top; sorting uses the ORIGINAL zone so rows never jump
// around as the teacher resolves them.
const ZONE_ORDER = { [ZONE.NONE]: 0, [ZONE.REVIEW]: 1, [ZONE.AUTO]: 2 };

const getStudentLabel = (student) => {
  if (!student) return '';
  return student.displayName
    || [student.firstName, student.lastName].filter(Boolean).join(' ')
    || student.id;
};

const spansMultipleClassrooms = (students) =>
  new Set((students || []).map((s) => s.classroomId)).size > 1;

const classroomLabel = (student) => student.classroomName || student.classroomId || '';

/**
 * Shared match-review list for spreadsheet uploads (bulk observations +
 * structured assessments). Fully controlled: receives engine output and the
 * current selections, reports taps via onSelect. Owns zero data fetching and
 * zero pool filtering - parents define the pool (issue #285 decision).
 *
 * @param {object} props
 * @param {Array} props.matches - matchStudentNames() output
 * @param {Object<string, object|null>} props.selections - csvName -> selected student
 * @param {(csvName: string, student: object) => void} props.onSelect
 * @param {object[]} props.pool - default picker/search scope (classroom-filtered)
 * @param {object[]} props.fullPool - "Search all classrooms" scope
 * @param {boolean} [props.disabled]
 */
function StudentMatchReview({ matches, selections, onSelect, pool, fullPool, disabled = false }) {
  const [picker, setPicker] = useState(null); // csvName being edited, or null
  const pickerLabelRef = useRef(''); // retains label during Drawer close animation
  if (picker) pickerLabelRef.current = picker;
  const [query, setQuery] = useState('');
  const [searchAll, setSearchAll] = useState(false);

  const sortedMatches = useMemo(
    () => [...(matches || [])].sort((a, b) => ZONE_ORDER[a.zone] - ZONE_ORDER[b.zone]),
    [matches],
  );

  // Two source names resolving to the same student is a data conflict that
  // hard-blocks commit in both flows (issue #285 decision). Parents gate the
  // commit button; this component surfaces the per-row warning.
  const duplicateIds = useMemo(() => {
    const counts = {};
    for (const student of Object.values(selections || {})) {
      if (student?.id) counts[student.id] = (counts[student.id] || 0) + 1;
    }
    return new Set(Object.keys(counts).filter((id) => counts[id] > 1));
  }, [selections]);

  const showClassroomsInCards = useMemo(() => spansMultipleClassrooms(pool), [pool]);

  const pickerScope = searchAll ? fullPool : pool;
  const showClassroomsInPicker = spansMultipleClassrooms(pickerScope);
  const pickerResults = useMemo(() => {
    const scope = searchAll ? fullPool : pool;
    const results = query.trim()
      ? fuzzySearchStudents(scope, query)
      : [...(scope || [])].sort((a, b) => getStudentLabel(a).localeCompare(getStudentLabel(b)));
    return results.slice(0, 30);
  }, [pool, fullPool, searchAll, query]);

  const openPicker = (csvName) => {
    if (disabled) return;
    setQuery('');
    setSearchAll(false);
    setPicker(csvName);
  };

  const handlePick = (student) => {
    if (picker) onSelect(picker, student);
    setPicker(null);
  };

  const renderDuplicateWarning = (selected) => (
    selected && duplicateIds.has(selected.id) ? (
      <Alert severity="error" icon={<ErrorIcon size={18} />} sx={{ mt: 1, py: 0 }}>
        Another name is also matched to {getStudentLabel(selected)}
      </Alert>
    ) : null
  );

  const renderCandidateRow = (csvName, student, selected) => {
    const isSelected = selected?.id === student.id;
    return (
      <ListItemButton
        key={student.id}
        dense
        disabled={disabled}
        selected={isSelected}
        onClick={() => onSelect(csvName, student)}
        sx={{ borderRadius: 1 }}
      >
        <Radio checked={isSelected} size="small" tabIndex={-1} disableRipple sx={{ p: 0.5, mr: 1 }} />
        <ListItemText
          primary={getStudentLabel(student)}
          secondary={showClassroomsInCards ? classroomLabel(student) : null}
          primaryTypographyProps={{ fontSize: '0.95rem' }}
        />
      </ListItemButton>
    );
  };

  const renderExpandedCard = (result) => {
    const { csvName, zone, candidates } = result;
    const selected = selections?.[csvName] || null;
    // A manual pick from the search sheet may not be in the candidate list -
    // still show it as the selected row so the card reflects reality.
    const rows = selected && !candidates.some((c) => c.id === selected.id)
      ? [selected, ...candidates]
      : candidates;
    const needsAction = !selected;

    return (
      <Card
        key={csvName}
        variant="outlined"
        sx={{ p: 1.5, borderColor: needsAction ? 'warning.main' : 'divider' }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            &ldquo;{csvName}&rdquo;
          </Typography>
          {needsAction ? (
            <Chip label={zone === ZONE.NONE ? 'No match found' : 'Pick a student'} size="small" color="warning" />
          ) : (
            <Chip label="Matched" size="small" variant="outlined" />
          )}
        </Stack>
        <List dense disablePadding>
          {rows.map((student) => renderCandidateRow(csvName, student, selected))}
          <ListItemButton dense disabled={disabled} onClick={() => openPicker(csvName)} sx={{ borderRadius: 1 }}>
            <Search size={16} style={{ marginRight: 12, opacity: 0.6 }} />
            <ListItemText
              primary="Someone else…"
              primaryTypographyProps={{ fontSize: '0.95rem', color: 'primary' }}
            />
          </ListItemButton>
        </List>
        {renderDuplicateWarning(selected)}
      </Card>
    );
  };

  const renderCompactRow = (result) => {
    const { csvName } = result;
    const selected = selections?.[csvName] || null;
    return (
      <Box key={csvName}>
        <ListItemButton
          dense
          disabled={disabled}
          onClick={() => openPicker(csvName)}
          sx={{ borderRadius: 1, px: 1.5 }}
        >
          <ListItemText
            primary={getStudentLabel(selected)}
            secondary={`"${csvName}"`}
            primaryTypographyProps={{ fontSize: '0.95rem' }}
            secondaryTypographyProps={{ fontSize: '0.8rem', fontStyle: 'italic' }}
          />
          <Edit size={16} style={{ opacity: 0.5, flexShrink: 0 }} />
        </ListItemButton>
        {renderDuplicateWarning(selected)}
      </Box>
    );
  };

  return (
    <Stack spacing={1.5}>
      {sortedMatches.map((result) => (
        result.zone === ZONE.AUTO ? renderCompactRow(result) : renderExpandedCard(result)
      ))}

      <Drawer
        anchor="bottom"
        open={Boolean(picker)}
        onClose={() => setPicker(null)}
        PaperProps={{ sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12, maxHeight: '75vh' } }}
      >
        <Box sx={{ p: 2, pb: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Match &ldquo;{pickerLabelRef.current}&rdquo; to
          </Typography>
          <TextField
            fullWidth
            size="small"
            autoFocus
            placeholder="Search students"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{ startAdornment: <Search size={16} style={{ marginRight: 8, opacity: 0.5 }} /> }}
          />
          {fullPool && fullPool.length > (pool?.length || 0) && (
            <FormControlLabel
              control={(
                <Switch
                  size="small"
                  checked={searchAll}
                  onChange={(e) => setSearchAll(e.target.checked)}
                />
              )}
              label={<Typography variant="caption">Search all classrooms</Typography>}
              sx={{ mt: 0.5 }}
            />
          )}
        </Box>
        <List dense sx={{ overflowY: 'auto', px: 1, pb: 2 }}>
          {pickerResults.map((student) => (
            <ListItemButton key={student.id} onClick={() => handlePick(student)} sx={{ borderRadius: 1 }}>
              <ListItemText
                primary={getStudentLabel(student)}
                secondary={showClassroomsInPicker ? classroomLabel(student) : null}
              />
            </ListItemButton>
          ))}
          {pickerResults.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
              No students found
            </Typography>
          )}
        </List>
      </Drawer>
    </Stack>
  );
}

export default StudentMatchReview;
