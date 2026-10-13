import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import reportCaughtError from '../utils/reportCaughtError';

export const EMPTY_FILTERS = {
  dateFrom: '',
  dateTo: '',
  creators: [],
  types: [],
  curriculumAreas: [],
};

/**
 * Compute the Firestore disjunction product for preflight validation.
 * Firestore caps combined `in` clause disjunctions at 30.
 * Product is computed generically: multiply the lengths of all array-valued
 * filter fields that map to `in` clauses (authors, types). Non-array filters
 * (dates) don't multiply.
 */
export function computeDisjunctionProduct(filters) {
  const authorCount = filters.creators?.length || 0;
  const typeCount = filters.types?.length || 0;
  if (authorCount === 0 && typeCount === 0) return 0;
  if (authorCount === 0) return typeCount;
  if (typeCount === 0) return authorCount;
  return authorCount * typeCount;
}

/**
 * Convert UI filter state to the shape expected by timelineQueries filter params.
 * Returns null if no server-filterable fields are active.
 */
export function buildServerFilters(filters) {
  const result = {};
  let hasAny = false;

  if (filters.creators?.length) {
    result.authors = filters.creators.map((t) => t.id);
    hasAny = true;
  }
  if (filters.types?.length) {
    result.types = [...filters.types];
    hasAny = true;
  }
  if (filters.dateFrom) {
    const [year, month, day] = filters.dateFrom.split('-').map(Number);
    result.dateFrom = new Date(year, month - 1, day, 0, 0, 0, 0);
    hasAny = true;
  }
  if (filters.dateTo) {
    const [year, month, day] = filters.dateTo.split('-').map(Number);
    result.dateTo = new Date(year, month - 1, day, 23, 59, 59, 999);
    hasAny = true;
  }

  return hasAny ? result : null;
}

const DISJUNCTION_CAP = 30;

/**
 * Custom hook for managing observation filters with dual-mode state:
 * - `filters` (draft): free chip-toggling, no queries fired
 * - `committedFilters`: updated only on Apply; drives server-side queries
 */
export const useObservationFilters = (_observations = [], noteTypeFilter = null) => {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [committedFilters, setCommittedFilters] = useState({ ...EMPTY_FILTERS });
  const [preflightError, setPreflightError] = useState(null);
  const initialNoteTypeApplied = useRef(false);


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

  const applyFilters = (inputObservations = [], overrideNoteTypeFilter = noteTypeFilter) => {
    let filtered = [...inputObservations];

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
    if ((filters.types && filters.types.length > 0) || overrideNoteTypeFilter) {
      const selectedTypes = new Set(filters.types || []);
      if (overrideNoteTypeFilter === 'lesson') {
        selectedTypes.add('lesson');
        selectedTypes.add('practice');
      }
      if (overrideNoteTypeFilter === 'textVoice') {
        selectedTypes.add('voice');
        selectedTypes.add('text');
      }
      if (overrideNoteTypeFilter === 'media') {
        selectedTypes.add('media');
      }
      filtered = filtered.filter(obs => selectedTypes.has(obs.type));
    }

    // Curriculum area filter (PEP-33)
    if (filters.curriculumAreas && filters.curriculumAreas.length > 0) {
      const selectedAreas = new Set(filters.curriculumAreas);
      filtered = filtered.filter(obs => {
        if (obs.type !== 'media') return true;
        const area = obs.curriculumArea;
        if (!area) return true; // pass through media without analysis (PDFs, videos, older photos)
        return selectedAreas.has(area);
      });
    }

    return filtered;
  };

  // Check if any draft filters are active (for UI chip highlighting)
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.dateFrom ||
      filters.dateTo ||
      (filters.creators && filters.creators.length > 0) ||
      (filters.types && filters.types.length > 0) ||
      (filters.curriculumAreas && filters.curriculumAreas.length > 0)
    );
  }, [filters]);

  // Check if committed filters are active (driving a server-side query)
  const hasCommittedFilters = useMemo(() => {
    return !!(
      committedFilters.dateFrom ||
      committedFilters.dateTo ||
      (committedFilters.creators && committedFilters.creators.length > 0) ||
      (committedFilters.types && committedFilters.types.length > 0)
    );
  }, [committedFilters]);

  // Server-side filter object derived from committed state
  const serverFilters = useMemo(
    () => buildServerFilters(committedFilters),
    [committedFilters],
  );

  // Filter handlers
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
    setPreflightError(null);
  };

  /**
   * Commit draft filters for server-side query execution.
   * Returns false if preflight check fails (disjunction cap exceeded).
   */
  const commitFilters = useCallback(() => {
    const product = computeDisjunctionProduct(filters);
    if (product > DISJUNCTION_CAP) {
      setPreflightError('Too many filters selected - remove a few');
      reportCaughtError(
        new Error('disjunction-cap-exceeded'),
        'useObservationFilters',
        'preflight-cap-breach'
      );
      return false;
    }
    setPreflightError(null);
    setCommittedFilters({ ...filters });
    return true;
  }, [filters]);

  /**
   * Clear All: if committed filters are active, reset both draft and committed.
   * If only draft chips changed, just reset draft.
   */
  const handleClearFilters = useCallback(() => {
    setFilters({ ...EMPTY_FILTERS });
    setPreflightError(null);
    if (hasCommittedFilters) {
      setCommittedFilters({ ...EMPTY_FILTERS });
    }
  }, [hasCommittedFilters]);

  const toggleFilters = () => {
    setShowFilters(prev => !prev);
  };

  // Auto-commit for lesson/media carry-over entry path (implicit Apply on mount).
  // Bypasses commitFilters() UI path but still enforces the disjunction cap so
  // future noteTypeFilter values with large type sets don't silently exceed it.
  useEffect(() => {
    if (!noteTypeFilter || initialNoteTypeApplied.current) return;
    initialNoteTypeApplied.current = true;
    const types = [];
    if (noteTypeFilter === 'lesson') { types.push('lesson', 'practice'); }
    if (noteTypeFilter === 'media') { types.push('media'); }
    if (types.length > 0) {
      const newFilters = { ...EMPTY_FILTERS, types };
      if (computeDisjunctionProduct(newFilters) <= DISJUNCTION_CAP) {
        setFilters(newFilters);
        setCommittedFilters(newFilters);
      }
    }
  }, [noteTypeFilter]);

  return {
    // State
    showFilters,
    filters,
    committedFilters,
    serverFilters,
    hasActiveFilters,
    hasCommittedFilters,
    preflightError,

    // Handlers
    handleFilterChange,
    handleClearFilters,
    commitFilters,
    toggleFilters,
    setShowFilters,
    applyFilters
  };
};

export default useObservationFilters; 
