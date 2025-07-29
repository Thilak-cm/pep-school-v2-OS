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
    creator: '',
    type: ''
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

    // Creator filter
    if (filters.creator) {
      filtered = filtered.filter(obs => {
        const creator = obs.teacherName || obs.teacherEmail || 'Unknown Teacher';
        return creator === filters.creator;
      });
    }

    // Type filter
    if (filters.type) {
      filtered = filtered.filter(obs => obs.type === filters.type);
    }

    return filtered;
  }, [observations, filters]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(filters.dateFrom || filters.dateTo || filters.creator || filters.type);
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
      creator: '',
      type: ''
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