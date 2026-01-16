/**
 * Date formatting utilities for standardized date display throughout the app
 * Format: "Jan 2nd 2026" for date-only, "Jan 2nd 2026, 3:45 PM" for dates with time
 */

/**
 * Get ordinal suffix for a day number (1st, 2nd, 3rd, 4th, etc.)
 * @param {number} day - Day of the month (1-31)
 * @returns {string} Ordinal suffix ('st', 'nd', 'rd', or 'th')
 */
export const getOrdinalSuffix = (day) => {
  if (day >= 11 && day <= 13) {
    return 'th';
  }
  const lastDigit = day % 10;
  switch (lastDigit) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
};

/**
 * Convert a timestamp to a Date object, handling various formats
 * @param {*} timestamp - Firebase timestamp, Date object, or timestamp value
 * @returns {Date|null} Date object or null if invalid
 */
const normalizeToDate = (timestamp) => {
  if (!timestamp) return null;
  
  if (timestamp instanceof Date) {
    return timestamp;
  }
  
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  
  if (timestamp.seconds !== undefined) {
    return new Date(timestamp.seconds * 1000);
  }
  
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  
  if (typeof timestamp === 'string') {
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  return null;
};

/**
 * Format time in 12-hour format with AM/PM
 * @param {Date} date - Date object
 * @returns {string} Formatted time string (e.g., "3:45 PM")
 */
const formatTime = (date) => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour12 = ((hours + 11) % 12) + 1;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const minutesStr = minutes.toString().padStart(2, '0');
  return `${hour12}:${minutesStr} ${ampm}`;
};

/**
 * Format date in standardized format: "Jan 2nd 2026" or "Jan 2nd 2026, 3:45 PM"
 * @param {*} timestamp - Firebase timestamp, Date object, or timestamp value
 * @param {boolean} includeTime - Whether to include time in the output
 * @returns {string} Formatted date string
 */
export const formatDate = (timestamp, includeTime = false) => {
  const date = normalizeToDate(timestamp);
  
  if (!date || isNaN(date.getTime())) {
    return 'Invalid date';
  }
  
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const ordinalSuffix = getOrdinalSuffix(day);
  
  const datePart = `${month} ${day}${ordinalSuffix} ${year}`;
  
  if (includeTime) {
    const timePart = formatTime(date);
    return `${datePart}, ${timePart}`;
  }
  
  return datePart;
};

/**
 * Format timestamp for display (includes time by default)
 * Compatible with existing formatTimestamp function signature
 * @param {*} timestamp - Firebase timestamp, Date object, or timestamp value
 * @returns {string} Formatted timestamp string
 */
export const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'No timestamp';
  return formatDate(timestamp, true);
};
