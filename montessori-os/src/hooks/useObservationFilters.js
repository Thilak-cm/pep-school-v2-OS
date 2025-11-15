import { useState, useMemo } from 'react';

/**
 * Custom hook for managing observation filters
 * @param {Array} observations - Array of observations to filter
 * @returns {Object} Filter state and handlers
 */
export const useObservationFilters = (observations = [], noteTypeFilter = null) => {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    creators: [], // multi-select
    types: [] // multi-select (e.g., ['voice', 'text'])
  });

  // Extract unique creators from observations
  const uniqueCreators = useMemo(() => {
    const creators = [...new Set(observations.map(obs => 
      obs.teacherName || obs.teacherEmail || 'Unknown Teacher'
    ))].sort();
    return creators;
  }, [observations]);

  // Helper function to get observation date
  const getObservationDate = (obs) => {
    if (obs.observedAt?.toDate) return obs.observedAt.toDate();
    if (obs.timestamp?.toDate) return obs.timestamp.toDate();
    if (obs.observedAt?.seconds) return new Date(obs.observedAt.seconds * 1000);
    if (obs.timestamp?.seconds) return new Date(obs.timestamp.seconds * 1000);
    if (obs.observedAt) return new Date(obs.observedAt);
    if (obs.timestamp) return new Date(obs.timestamp);
    return new Date(0); // fallback
  };

  // Helper function to parse filter date string to local date
  const parseFilterDate = (dateString) => {
    if (!dateString) return null;
    
    // Parse the date string and create a local date object
    // This ensures we're working with local timezone, not UTC
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed in Date constructor
  };

  // Apply filters to observations
  const filteredObservations = useMemo(() => {
    let filtered = [...observations];

    // Date filters
    if (filters.dateFrom) {
      const fromDate = parseFilterDate(filters.dateFrom);
      if (fromDate) {
        fromDate.setHours(0, 0, 0, 0); // Start of day (inclusive)
        filtered = filtered.filter(obs => {
          const obsDate = getObservationDate(obs);
          return obsDate >= fromDate;
        });
      }
    }

    if (filters.dateTo) {
      const toDate = parseFilterDate(filters.dateTo);
      if (toDate) {
        toDate.setHours(23, 59, 59, 999); // End of day (inclusive)
        filtered = filtered.filter(obs => {
          const obsDate = getObservationDate(obs);
          return obsDate <= toDate;
        });
      }
    }

    // Creators filter (multi) - now handles teacher objects
    if (filters.creators && filters.creators.length > 0) {
      const selectedTeacherIds = new Set(filters.creators.map(teacher => teacher.id));
      filtered = filtered.filter(obs => {
        const creatorId = obs.createdBy || obs.teacherId;
        return selectedTeacherIds.has(creatorId);
      });
    }

    // Types filter (multi)
    if ((filters.types && filters.types.length > 0) || noteTypeFilter) {
      const selectedTypes = new Set(filters.types || []);
      if (noteTypeFilter === 'lesson') {
        selectedTypes.add('lesson');
      }
      if (noteTypeFilter === 'textVoice') {
        selectedTypes.add('voice');
        selectedTypes.add('text');
      }
      filtered = filtered.filter(obs => selectedTypes.has(obs.type));
    }

    // Language filter removed

    return filtered;
  }, [observations, filters, noteTypeFilter]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.dateFrom ||
      filters.dateTo ||
      (filters.creators && filters.creators.length > 0) ||
      (filters.types && filters.types.length > 0) ||
      !!noteTypeFilter
    );
  }, [filters, noteTypeFilter]);

  // Filter handlers
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      creators: [],
      types: []
    });
  };

  const toggleFilters = () => {
    setShowFilters(prev => !prev);
  };

  return {
    // State
    showFilters,
    filters,
    uniqueCreators,
    filteredObservations,
    hasActiveFilters,
    
    // Handlers
    handleFilterChange,
    handleClearFilters,
    toggleFilters,
    setShowFilters
  };
};

export default useObservationFilters; 
