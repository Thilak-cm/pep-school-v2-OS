import React, { useState, useMemo } from 'react'; 
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Collapse,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Autocomplete,
  Popper,
  ListItem,
  ListItemText
} from '@mui/material';
import { Clear, Search } from '@mui/icons-material';

/**
 * FilterPanel component for observation filtering
 * @param {Object} props - Component props
 * @param {boolean} props.showFilters - Whether filters are visible
 * @param {Object} props.filters - Current filter values
 * @param {Array} props.uniqueCreators - Array of unique creator names (legacy)
 * @param {Array} props.classroomTeachers - Array of teachers with access to current classroom
 * @param {boolean} props.hasActiveFilters - Whether any filters are active
 * @param {number} props.filteredCount - Number of filtered results
 * @param {Function} props.onFilterChange - Handler for filter changes
 * @param {Function} props.onClearFilters - Handler for clearing all filters
 * @param {Function} props.onToggleFilters - Handler for toggling filter visibility
 */
const FilterPanel = ({
  showFilters,
  filters,
  uniqueCreators = [],
  classroomTeachers = [],
  hasActiveFilters,
  filteredCount,
  onFilterChange,
  onClearFilters,
  onToggleFilters
}) => {
  const [creatorSearch, setCreatorSearch] = useState('');
  
  // Filter teachers based on search input for fuzzy matching
  const filteredTeachers = useMemo(() => {
    if (!creatorSearch.trim()) return classroomTeachers;
    
    const query = creatorSearch.toLowerCase();
    return classroomTeachers.filter(teacher => {
      const name = teacher.displayName || teacher.name || teacher.email || '';
      return name.toLowerCase().includes(query);
    });
  }, [classroomTeachers, creatorSearch]);
  return (
    <Box>
      {/* Filter Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {hasActiveFilters && (
            <Chip 
              label={`${filteredCount} filtered`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Box>
      </Box>

      {/* Filter Panel */}
      <Collapse in={showFilters}>
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Filter Observations
              </Typography>
              {hasActiveFilters && (
                <Button
                  startIcon={<Clear />}
                  size="small"
                  onClick={onClearFilters}
                  color="secondary"
                  variant="outlined"
                >
                  Clear All
                </Button>
              )}
            </Box>
            
            {/* Date Range */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="From Date"
                type="date"
                size="small"
                value={filters.dateFrom}
                onChange={(e) => onFilterChange('dateFrom', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="To Date"
                type="date"
                size="small"
                value={filters.dateTo}
                onChange={(e) => onFilterChange('dateTo', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
            </Box>
            
            {/* Creator (multi) and Type (multi) as toggle button groups */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary' }}>
                  Creator
                </Typography>
                {classroomTeachers.length > 0 ? (
                  <Autocomplete
                    multiple
                    options={filteredTeachers}
                    getOptionLabel={(option) => option.displayName || option.name || option.email || 'Unknown Teacher'}
                    value={filters.creators}
                    onChange={(_, newValues) => onFilterChange('creators', newValues)}
                    inputValue={creatorSearch}
                    onInputChange={(_, newInputValue) => setCreatorSearch(newInputValue)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Search teachers..."
                        size="small"
                        InputProps={{
                          ...params.InputProps,
                          startAdornment: (
                            <>
                              <Search sx={{ color: 'text.secondary', mr: 1, fontSize: 20 }} />
                              {params.InputProps.startAdornment}
                            </>
                          )
                        }}
                      />
                    )}
                    renderOption={(props, option) => (
                      <ListItem {...props}>
                        <ListItemText
                          primary={option.displayName || option.name || option.email || 'Unknown Teacher'}
                        />
                      </ListItem>
                    )}
                    filterOptions={(x) => x} // Disable built-in filtering since we handle it manually
                    noOptionsText="No teachers found"
                    loading={false}
                    sx={{ minWidth: 200 }}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No teachers assigned to this classroom
                  </Typography>
                )}
              </Box>

              <Box>
                <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary' }}>
                  Type
                </Typography>
                <ToggleButtonGroup
                  value={filters.types}
                  onChange={(_, newValues) => onFilterChange('types', newValues)}
                  size="small"
                  color="primary"
                  aria-label="Filter by note type"
                  sx={{ flexWrap: 'wrap' }}
                >
                  <ToggleButton value="voice" aria-label="Voice notes" sx={{ m: 0.5 }}>
                    Voice Notes
                  </ToggleButton>
                  <ToggleButton value="text" aria-label="Text notes" sx={{ m: 0.5 }}>
                    Text Notes
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>
          </Box>
        </Paper>
      </Collapse>
    </Box>
  );
};

export default FilterPanel;