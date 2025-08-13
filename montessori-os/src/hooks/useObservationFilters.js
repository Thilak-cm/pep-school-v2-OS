import { useState, useEffect, useMemo } from 'react';

/**
 * Custom hook for managing observation filters
 * @param {Array} observations - Array of observations to filter
 * @returns {Object} Filter state and handlers
 */
export const useObservationFilters = (observations = []) => {
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

  // Apply filters to observations
  const filteredObservations = useMemo(() => {
    let filtered = [...observations];

    // Date filters
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(obs => {
        const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
        return obsDate >= fromDate;
      });
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(obs => {
        const obsDate = obs.timestamp?.toDate ? obs.timestamp.toDate() : new Date(obs.timestamp?.seconds * 1000);
        return obsDate <= toDate;
      });
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
    if (filters.types && filters.types.length > 0) {
      const selectedTypes = new Set(filters.types);
      filtered = filtered.filter(obs => selectedTypes.has(obs.type));
    }

    return filtered;
  }, [observations, filters]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.dateFrom ||
      filters.dateTo ||
      (filters.creators && filters.creators.length > 0) ||
      (filters.types && filters.types.length > 0)
    );
  }, [filters]);

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