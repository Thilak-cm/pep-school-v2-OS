import React from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Collapse,
  Chip
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
            
            {/* Creator and Type */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Creator</InputLabel>
                <Select
                  value={filters.creator}
                  label="Creator"
                  onChange={(e) => onFilterChange('creator', e.target.value)}
                >
                  <MenuItem value="">All Creators</MenuItem>
                  {uniqueCreators.map((creator) => (
                    <MenuItem key={creator} value={creator}>
                      {creator}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={filters.type}
                  label="Type"
                  onChange={(e) => onFilterChange('type', e.target.value)}
                >
                  <MenuItem value="">All Types</MenuItem>
                  <MenuItem value="voice">Voice Notes</MenuItem>
                  <MenuItem value="text">Text Notes</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        </Paper>
      </Collapse>
    </Box>
  );
};

export default FilterPanel;