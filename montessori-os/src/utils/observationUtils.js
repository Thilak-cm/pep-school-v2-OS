import React from 'react';
import { Mic, TextFields } from '@mui/icons-material';

/**
 * Format timestamp for display
 * @param {Object} timestamp - Firebase timestamp object
 * @returns {string} Formatted timestamp string
 */
export const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'No timestamp';
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000).toLocaleString();
  }
  if (timestamp.toDate) {
    return timestamp.toDate().toLocaleString();
  }
  return 'Invalid timestamp';
};

/**
 * Get icon for observation type
 * @param {string} type - Observation type ('voice' or 'text')
 * @returns {React.Element} MUI Icon component
 */
export const getObservationTypeIcon = (type) => {
  return type === 'voice' ? <Mic sx={{ fontSize: 16 }} /> : <TextFields sx={{ fontSize: 16 }} />;
};

/**
 * Get display text for observation type
 * @param {string} type - Observation type ('voice' or 'text')
 * @returns {string} Display text
 */
export const getObservationTypeText = (type) => {
  return type === 'voice' ? 'Voice Note' : 'Text Note';
};

/**
 * Get creator name from observation
 * @param {Object} observation - Observation object
 * @returns {string} Creator name or fallback
 */
export const getCreatorName = (observation) => {
  return observation.teacherName || observation.teacherEmail || 'Unknown Teacher';
};

/**
 * Check if observation can be edited within time limit
 * @param {Object} observation - Observation object
 * @param {number} timeLimitHours - Time limit in hours (default 24)
 * @returns {boolean} Whether observation can be edited
 */
export const isWithinEditTimeLimit = (observation, timeLimitHours = 24) => {
  if (!observation.timestamp) return false;
  
  const obsDate = observation.timestamp.toDate ? 
    observation.timestamp.toDate() : 
    new Date(observation.timestamp.seconds * 1000);
  
  const timeLimitMs = timeLimitHours * 60 * 60 * 1000;
  const now = new Date();
  
  return (now - obsDate) <= timeLimitMs;
};

/**
 * Truncate text for preview
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (default 100)
 * @returns {string} Truncated text with ellipsis if needed
 */
export const truncateText = (text, maxLength = 100) => {
  if (!text) return '';
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
};

/**
 * Sort observations by timestamp (newest first)
 * @param {Array} observations - Array of observations
 * @returns {Array} Sorted observations
 */
export const sortObservationsByDate = (observations) => {
  return [...observations].sort((a, b) => {
    const dateA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp?.seconds * 1000);
    const dateB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp?.seconds * 1000);
    return dateB - dateA; // Newest first
  });
};

/**
 * Group observations by date
 * @param {Array} observations - Array of observations
 * @returns {Object} Observations grouped by date string
 */
export const groupObservationsByDate = (observations) => {
  return observations.reduce((groups, obs) => {
    const date = obs.timestamp?.toDate ? 
      obs.timestamp.toDate() : 
      new Date(obs.timestamp?.seconds * 1000);
    
    const dateKey = date.toDateString();
    
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    
    groups[dateKey].push(obs);
    return groups;
  }, {});
}; 