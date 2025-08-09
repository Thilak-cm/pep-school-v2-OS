import React from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Collapse,
  Chip,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { Clear } from '@mui/icons-material';

/**
 * FilterPanel component for observation filtering
 * @param {Object} props - Component props
 * @param {boolean} props.showFilters - Whether filters are visible
 * @param {Object} props.filters - Current filter values
 * @param {Array} props.uniqueCreators - Array of unique creator names
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
  hasActiveFilters,
  filteredCount,
  onFilterChange,
  onClearFilters,
  onToggleFilters
}) => {
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
                <ToggleButtonGroup
                  value={filters.creators}
                  onChange={(_, newValues) => onFilterChange('creators', newValues)}
                  size="small"
                  color="primary"
                  aria-label="Filter by creators"
                  sx={{ flexWrap: 'wrap' }}
                >
                  {uniqueCreators.map((creator) => (
                    <ToggleButton key={creator} value={creator} aria-label={creator} sx={{ m: 0.5 }}>
                      {creator}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
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