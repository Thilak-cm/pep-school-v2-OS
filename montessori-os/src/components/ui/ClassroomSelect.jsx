import React from 'react';
import {
  FormControl, InputLabel, Select, MenuItem, ListSubheader, FormHelperText
} from '@mui/material';

// Fixed display order for branches (product preference); unknown branches
// sort after these, in first-seen order.
const BRANCH_ORDER = ['hsr', 'whitefield', 'varthur', 'kokapet', 'sarjapura'];

function branchRank(branchId) {
  const index = BRANCH_ORDER.indexOf(branchId);
  return index === -1 ? BRANCH_ORDER.length : index;
}

// Branch IDs double as display labels (branch docs mostly lack a name field).
// Short IDs like "hsr" are acronyms; longer ones are place names.
function branchLabel(branchId) {
  if (!branchId) return 'Other';
  return branchId.length <= 3
    ? branchId.toUpperCase()
    : branchId.charAt(0).toUpperCase() + branchId.slice(1);
}

const BRANCH_HEADER_SX = {
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 700,
  fontSize: '0.7rem',
  lineHeight: '30px',
  color: 'text.secondary',
  bgcolor: 'grey.100',
  zIndex: 2,
};

const PROGRAM_HEADER_SX = {
  textTransform: 'capitalize',
  fontWeight: 600,
  fontSize: '0.7rem',
  lineHeight: '26px',
  color: 'text.secondary',
  bgcolor: 'grey.50',
  pl: 3,
  top: '30px',
  zIndex: 1,
};

/**
 * Build grouped MenuItem children for a classroom list.
 * Returns a flat array because MUI Select requires MenuItem children to be
 * direct (no fragments/wrappers). Headers are skipped when every option is in
 * the same branch so short lists stay uncluttered.
 */
function groupedClassroomItems(classroomList) {
  const branchIds = [...new Set(classroomList.map(c => c.branchId || ''))]
    .sort((a, b) => branchRank(a) - branchRank(b));
  const grouped = branchIds.length > 1;
  const items = [];
  for (const branchId of branchIds) {
    const branchClassrooms = classroomList.filter(x => (x.branchId || '') === branchId);
    if (!grouped) {
      for (const c of branchClassrooms) {
        items.push(
          <MenuItem key={c.id} value={c.id}>
            {(c.name || c.id)}{c.programId ? ` \u00b7 ${c.programId}` : ''}
          </MenuItem>
        );
      }
      continue;
    }
    items.push(
      <ListSubheader key={`branch-${branchId || 'other'}`} muiSkipListHighlight sx={BRANCH_HEADER_SX}>
        {branchLabel(branchId)}
      </ListSubheader>
    );
    const programIds = [...new Set(branchClassrooms.map(c => c.programId || 'other'))];
    for (const programId of programIds) {
      items.push(
        <ListSubheader
          key={`program-${branchId || 'other'}-${programId}`}
          muiSkipListHighlight
          sx={PROGRAM_HEADER_SX}
        >
          {programId}
        </ListSubheader>
      );
      for (const c of branchClassrooms.filter(x => (x.programId || 'other') === programId)) {
        items.push(
          <MenuItem key={c.id} value={c.id} sx={{ pl: 4 }}>
            {c.name || c.id}
          </MenuItem>
        );
      }
    }
  }
  return items;
}

/**
 * Reusable classroom dropdown with branch/program grouping.
 *
 * Props:
 *   classrooms   - array of classroom objects (id, name, branchId, programId, ...)
 *   value        - selected classroom id (string)
 *   onChange      - (classroomId: string) => void
 *   label        - input label (default "Classroom")
 *   error        - boolean
 *   helperText   - string shown below the select
 *   disabled     - boolean
 *   multiple     - boolean (for multi-select, value should be string[])
 *   size         - "small" | "medium"
 *   fullWidth    - boolean (default true)
 *   sx           - additional sx for FormControl
 *   emptyOptionLabel - when set, prepends a MenuItem with value "" (e.g. "All
 *                  classrooms") so the select can act as an optional filter
 */
export default function ClassroomSelect({
  classrooms = [],
  value,
  onChange,
  label = 'Classroom',
  error = false,
  helperText,
  disabled = false,
  multiple = false,
  size = 'small',
  fullWidth = true,
  sx,
  emptyOptionLabel,
}) {
  const labelId = `classroom-select-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <FormControl size={size} fullWidth={fullWidth} error={error} disabled={disabled} sx={sx}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        label={label}
        value={value}
        multiple={multiple}
        onChange={(e) => onChange(e.target.value)}
        MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
      >
        {emptyOptionLabel && <MenuItem value="">{emptyOptionLabel}</MenuItem>}
        {groupedClassroomItems(classrooms)}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
}
