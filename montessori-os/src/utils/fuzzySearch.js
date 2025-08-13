import Fuse from 'fuse.js';

/**
 * Fuzzy search utility using Fuse.js
 * Provides consistent fuzzy matching across all search bars in the app
 */

/**
 * Create a fuzzy search instance for a specific data type
 * @param {Array} data - Array of objects to search through
 * @param {Object} options - Fuse.js options
 * @returns {Fuse} Configured Fuse instance
 */
export const createFuzzySearch = (data, options = {}) => {
  const defaultOptions = {
    // Threshold: 0.0 = perfect match, 1.0 = very loose match
    threshold: 0.3,
    // Include score in results
    includeScore: true,
    // Include matches in results
    includeMatches: true,
    // Minimum character length to start searching
    minMatchCharLength: 1,
    // Ignore location (better for short strings)
    ignoreLocation: true,
    // Use extended search (supports regex-like syntax)
    useExtendedSearch: false,
    // Distance between matches
    distance: 100,
    // ... other options
  };

  return new Fuse(data, { ...defaultOptions, ...options });
};

/**
 * Search classrooms with fuzzy matching
 * @param {Array} classrooms - Array of classroom objects
 * @param {string} query - Search query
 * @returns {Array} Filtered classrooms with scores
 */
export const fuzzySearchClassrooms = (classrooms, query) => {
  if (!query || !query.trim()) return classrooms;
  
  const fuse = createFuzzySearch(classrooms, {
    keys: [
      { name: 'name', weight: 1.0 },
      { name: 'id', weight: 0.5 }
    ]
  });
  
  return fuse.search(query).map(result => result.item);
};

/**
 * Search students with fuzzy matching
 * @param {Array} students - Array of student objects
 * @param {string} query - Search query
 * @returns {Array} Filtered students with scores
 */
export const fuzzySearchStudents = (students, query) => {
  if (!query || !query.trim()) return students;
  
  const fuse = createFuzzySearch(students, {
    keys: [
      { name: 'name', weight: 1.0 },
      { name: 'displayName', weight: 1.0 },
      { name: 'firstName', weight: 0.8 },
      { name: 'lastName', weight: 0.8 },
      { name: 'classroom_name', weight: 0.6 }
    ]
  });
  
  return fuse.search(query).map(result => result.item);
};

/**
 * Search teachers with fuzzy matching
 * @param {Array} teachers - Array of teacher objects
 * @param {string} query - Search query
 * @returns {Array} Filtered teachers with scores
 */
export const fuzzySearchTeachers = (teachers, query) => {
  if (!query || !query.trim()) return teachers;
  
  const fuse = createFuzzySearch(teachers, {
    keys: [
      { name: 'displayName', weight: 1.0 },
      { name: 'name', weight: 1.0 },
      { name: 'email', weight: 0.7 }
    ]
  });
  
  return fuse.search(query).map(result => result.item);
};

/**
 * Search feedback with fuzzy matching
 * @param {Array} feedback - Array of feedback objects
 * @param {string} query - Search query
 * @returns {Array} Filtered feedback with scores
 */
export const fuzzySearchFeedback = (feedback, query) => {
  if (!query || !query.trim()) return feedback;
  
  const fuse = createFuzzySearch(feedback, {
    keys: [
      { name: 'message', weight: 1.0 },
      { name: 'userDisplayName', weight: 0.8 },
      { name: 'userEmail', weight: 0.6 },
      { name: 'category', weight: 0.5 }
    ]
  });
  
  return fuse.search(query).map(result => result.item);
};

/**
 * Generic fuzzy search for any data type
 * @param {Array} data - Array of objects to search
 * @param {string} query - Search query
 * @param {Array} keys - Array of key objects with weights
 * @returns {Array} Filtered data
 */
export const genericFuzzySearch = (data, query, keys) => {
  if (!query || !query.trim()) return data;
  
  const fuse = createFuzzySearch(data, { keys });
  return fuse.search(query).map(result => result.item);
};

/**
 * Highlight search matches in text (for future use)
 * @param {string} text - Original text
 * @param {Array} matches - Fuse.js match results
 * @returns {string} Text with highlighted matches
 */
export const highlightMatches = (text, matches) => {
  if (!matches || !matches.length) return text;
  
  let highlightedText = text;
  matches.forEach(match => {
    const regex = new RegExp(`(${match.value})`, 'gi');
    highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
  });
  
  return highlightedText;
};
