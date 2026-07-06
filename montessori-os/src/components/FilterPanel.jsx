import React, { useState, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Collapse,
  Chip,
  Autocomplete,
  Popper,
  ListItem,
  ListItemText
} from '@mui/material';
import { X as Clear, Search, Mic, Pencil as EditNote, X as Close, BookOpen as MenuBook, Image as PermMedia, FileText as ReportIcon } from '../icons';
import { IconButton } from '@mui/material';
import { fuzzySearchTeachers } from '../utils/fuzzySearch';

/**
 * FilterPanel component for observation filtering
 * @param {Object} props - Component props
 * @param {boolean} props.showFilters - Whether filters are visible
 * @param {Object} props.filters - Current filter values
 * @param {Array} props.uniqueCreators - Array of unique creator names (legacy)
 * @param {Array} props.classroomTeachers - Array of teachers with access to current classroom
 * @param {boolean} props.hasActiveFilters - Whether any filters are active
 * @param {number} props.filteredCount - Number of filtered results
 * @param {number} [props.totalCount] - Total results before filters (optional)
 * @param {Function} props.onFilterChange - Handler for filter changes
 * @param {Function} props.onClearFilters - Handler for clearing all filters
 * @param {Function} props.onToggleFilters - Handler for toggling filter visibility
 */
const FilterPanel = ({
  showFilters,
  filters,
  _uniqueCreators = [],
  classroomTeachers = [],
  hasActiveFilters,
  filteredCount,
  totalCount,
  onFilterChange,
  onClearFilters,
  onToggleFilters,
  availableCurriculumAreas = [],
}) => {
  const [creatorSearch, setCreatorSearch] = useState('');
  const toDateRef = useRef(null);
  
  // Use fuzzy search for better teacher matching
  const filteredTeachers = useMemo(() => {
    return fuzzySearchTeachers(classroomTeachers, creatorSearch);
  }, [classroomTeachers, creatorSearch]);

  const voiceActive = filters.types?.includes('voice');
  const textActive = filters.types?.includes('text');
  const lessonActive = filters.types?.includes('lesson');
  const mediaActive = filters.types?.includes('media');
  const reportActive = filters.types?.includes('report');
  return (
    <Box>


      {/* Filter Panel */}
      <Collapse 
        in={showFilters}
        timeout={300}
        sx={{
          '& .MuiCollapse-wrapper': {
            transition: 'all 0.3s ease-in-out'
          }
        }}
      >
        <Paper sx={{ 
          p: 3, 
          mb: 2, 
          borderRadius: 3,
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          border: '1px solid',
          borderColor: 'divider',
          transform: showFilters ? 'translateY(0)' : 'translateY(-10px)',
          opacity: showFilters ? 1 : 0.8,
          transition: 'all 0.3s ease-in-out'
        }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Filter Notes
                </Typography>
                {hasActiveFilters && (
                  <Chip 
                    label="Active" 
                    size="small" 
                    color="success" 
                    variant="outlined"
                    sx={{ fontSize: '0.75rem' }}
                  />
                )}
              </Box>
              {/* Optional: X of Y notes shown under the title (Classroom Timeline request) */}
              {hasActiveFilters && typeof filteredCount === 'number' && typeof totalCount === 'number' && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                  Showing {filteredCount} of {totalCount} notes
                </Typography>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                  startIcon={<Clear />}
                  size="small"
                  onClick={onClearFilters}
                  color="secondary"
                  variant="outlined"
                  disabled={!hasActiveFilters}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 500
                  }}
                >
                  Clear All
                </Button>
                <IconButton
                  aria-label="Close filters"
                  title="Close filters"
                  size="small"
                  onClick={onToggleFilters}
                >
                  <Close size={20} />
                </IconButton>
              </Box>
            </Box>
            
            {/* Date Range - connected pill */}
            <Box>
              <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 500 }}>
                Date Range
              </Typography>
              <Box sx={{
                display: 'flex',
                border: '1px solid',
                borderColor: (filters.dateFrom || filters.dateTo) ? 'primary.main' : 'divider',
                borderRadius: 2,
                overflow: 'hidden',
                transition: 'border-color 0.2s ease',
              }}>
                <TextField
                  label="From"
                  type="date"
                  size="small"
                  value={filters.dateFrom}
                  onChange={(e) => {
                    onFilterChange('dateFrom', e.target.value);
                    if (e.target.value && !filters.dateTo) {
                      onFilterChange('dateTo', e.target.value);
                      setTimeout(() => {
                        try { toDateRef.current?.showPicker(); } catch { toDateRef.current?.focus(); }
                      }, 100);
                    }
                  }}
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    flex: 1,
                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '& .MuiInputBase-root': { borderRadius: 0 },
                  }}
                />
                <Box sx={{
                  width: '1px',
                  alignSelf: 'stretch',
                  bgcolor: (filters.dateFrom || filters.dateTo) ? 'primary.main' : 'divider',
                  my: 1,
                  transition: 'background-color 0.2s ease',
                }} />
                <TextField
                  label="To"
                  type="date"
                  size="small"
                  value={filters.dateTo}
                  onChange={(e) => onFilterChange('dateTo', e.target.value)}
                  inputRef={toDateRef}
                  inputProps={{ min: filters.dateFrom || undefined }}
                  InputLabelProps={{ shrink: true }}
                  sx={{
                    flex: 1,
                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '& .MuiInputBase-root': { borderRadius: 0 },
                  }}
                />
              </Box>
            </Box>
            
            {/* Creator (multi) and Type (multi) as toggle button groups */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 500 }}>
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
                              <Search size={20} style={{ color: 'var(--color-text-soft)', marginRight: 8 }} />
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
                <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 500 }}>
                  Note Type
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant={voiceActive ? 'contained' : 'outlined'}
                    size="small"
                    startIcon={<Mic />}
                    onClick={() => {
                      const currentTypes = filters.types || [];
                      const newTypes = currentTypes.includes('voice')
                        ? currentTypes.filter((t) => t !== 'voice')
                        : [...currentTypes, 'voice'];
                      onFilterChange('types', newTypes);
                    }}
                    sx={{
                      minWidth: 120,
                      height: 40,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 500,
                      borderWidth: 2,
                      position: 'relative',
                      overflow: 'hidden',
                      '&:hover': {
                        borderWidth: 2,
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      },
                      '&:active': {
                        transform: 'translateY(0px)',
                      },
                      transition: 'all 0.2s ease-in-out',
                      ...(voiceActive && {
                        backgroundColor: 'var(--color-primary)',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'var(--color-primary-dark)',
                        },
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                          pointerEvents: 'none',
                        },
                      }),
                    }}
                  >
                    Voice Notes
                  </Button>

                  <Button
                    variant={textActive ? 'contained' : 'outlined'}
                    size="small"
                    startIcon={<EditNote />}
                    onClick={() => {
                      const currentTypes = filters.types || [];
                      const newTypes = currentTypes.includes('text')
                        ? currentTypes.filter((t) => t !== 'text')
                        : [...currentTypes, 'text'];
                      onFilterChange('types', newTypes);
                    }}
                    sx={{
                      minWidth: 120,
                      height: 40,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 500,
                      borderWidth: 2,
                      position: 'relative',
                      overflow: 'hidden',
                      '&:hover': {
                        borderWidth: 2,
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      },
                      '&:active': {
                        transform: 'translateY(0px)',
                      },
                      transition: 'all 0.2s ease-in-out',
                      ...(textActive && {
                        backgroundColor: 'var(--color-secondary)',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'var(--color-secondary-dark)',
                        },
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                          pointerEvents: 'none',
                        },
                      }),
                    }}
                  >
                    Text Notes
                  </Button>

                  <Button
                    variant={lessonActive ? 'contained' : 'outlined'}
                    size="small"
                    startIcon={<MenuBook />}
                    onClick={() => {
                      const currentTypes = filters.types || [];
                      const newTypes = currentTypes.includes('lesson')
                        ? currentTypes.filter((t) => t !== 'lesson')
                        : [...currentTypes, 'lesson'];
                      onFilterChange('types', newTypes);
                    }}
                    sx={{
                      minWidth: 120,
                      height: 40,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 500,
                      borderWidth: 2,
                      position: 'relative',
                      overflow: 'hidden',
                      '&:hover': {
                        borderWidth: 2,
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      },
                      '&:active': {
                        transform: 'translateY(0px)',
                      },
                      transition: 'all 0.2s ease-in-out',
                      ...(lessonActive && {
                        backgroundColor: 'var(--color-primary-light)',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'var(--color-primary)',
                        },
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                          pointerEvents: 'none',
                        },
                      }),
                    }}
                  >
                    Lesson Notes
                  </Button>

                  <Button
                    variant={mediaActive ? 'contained' : 'outlined'}
                    size="small"
                    startIcon={<PermMedia />}
                    onClick={() => {
                      const currentTypes = filters.types || [];
                      const newTypes = currentTypes.includes('media')
                        ? currentTypes.filter((t) => t !== 'media')
                        : [...currentTypes, 'media'];
                      onFilterChange('types', newTypes);
                    }}
                    sx={{
                      minWidth: 120,
                      height: 40,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 500,
                      borderWidth: 2,
                      position: 'relative',
                      overflow: 'hidden',
                      '&:hover': {
                        borderWidth: 2,
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      },
                      '&:active': {
                        transform: 'translateY(0px)',
                      },
                      transition: 'all 0.2s ease-in-out',
                      ...(mediaActive && {
                        backgroundColor: 'var(--color-sky)',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'var(--color-blue-sky)',
                        },
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                          pointerEvents: 'none',
                        },
                      }),
                    }}
                  >
                    Media
                  </Button>

                  <Button
                    variant={reportActive ? 'contained' : 'outlined'}
                    size="small"
                    startIcon={<ReportIcon />}
                    onClick={() => {
                      const currentTypes = filters.types || [];
                      const newTypes = currentTypes.includes('report')
                        ? currentTypes.filter((t) => t !== 'report')
                        : [...currentTypes, 'report'];
                      onFilterChange('types', newTypes);
                    }}
                    sx={{
                      minWidth: 120,
                      height: 40,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 500,
                      borderWidth: 2,
                      position: 'relative',
                      overflow: 'hidden',
                      '&:hover': {
                        borderWidth: 2,
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      },
                      '&:active': {
                        transform: 'translateY(0px)',
                      },
                      transition: 'all 0.2s ease-in-out',
                      ...(reportActive && {
                        backgroundColor: 'var(--color-secondary)',
                        color: 'white',
                        '&:hover': {
                          backgroundColor: 'var(--color-secondary-dark)',
                        },
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                          pointerEvents: 'none',
                        },
                      }),
                    }}
                  >
                    Reports
                  </Button>
                </Box>

                {/* Removed helper text per request */}
              </Box>

              {/* Curriculum area filter (PEP-33) */}
              {availableCurriculumAreas.length > 0 && (
                <Box>
                  <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 500 }}>
                    Curriculum Area
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {availableCurriculumAreas.map((area) => {
                      const isActive = (filters.curriculumAreas || []).includes(area);
                      return (
                        <Chip
                          key={area}
                          label={area}
                          size="small"
                          onClick={() => {
                            const current = filters.curriculumAreas || [];
                            const next = isActive
                              ? current.filter((a) => a !== area)
                              : [...current, area];
                            onFilterChange('curriculumAreas', next);
                          }}
                          sx={{
                            fontWeight: 500,
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            ...(isActive ? {
                              bgcolor: 'var(--color-secondary-dark)',
                              color: '#fff', // #fff intentional — contrast text on dynamic colored background
                              '&:hover': { bgcolor: 'var(--color-green-deep)' },
                            } : {
                              bgcolor: 'var(--color-green-bg)',
                              color: 'var(--color-secondary-dark)',
                              border: '1px solid var(--color-green-mint)',
                              '&:hover': { bgcolor: 'var(--color-green-bg-mist)' },
                            }),
                          }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </Paper>
      </Collapse>
    </Box>
  );
};

export default FilterPanel;
