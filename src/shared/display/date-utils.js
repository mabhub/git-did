/**
 * Date utilities for formatting and parsing dates
 * @module date-utils
 */

/**
 * Day names for formatting dates
 */
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Milliseconds per day constant
 */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse and validate a date string in YYYY-MM-DD format
 * @param {string} dateString - Date string to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
export const parseDate = (dateString) => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    return null;
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return null;
  }

  // Verify that the date wasn't normalized (e.g., 2025-02-30 -> 2025-03-02)
  if (formatDate(date) !== dateString) {
    return null;
  }

  return date;
};

/**
 * Format a date to YYYY-MM-DD
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get the day name for a given date
 * @param {Date} date - Date to get day name for
 * @returns {string} Day name (e.g., "Monday")
 */
export const getDayName = (date) => {
  return DAY_NAMES[date.getDay()];
};

/**
 * Calculate the number of days between two dates
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {number} Number of days between dates (absolute value)
 */
export const daysBetween = (date1, date2) => {
  return Math.abs(Math.floor((date2.getTime() - date1.getTime()) / MS_PER_DAY));
};

/**
 * Calculate date range from days parameter or since/until options
 * @param {number} days - Number of days (legacy parameter)
 * @param {string} [since] - Start date (YYYY-MM-DD)
 * @param {string} [until] - End date (YYYY-MM-DD)
 * @returns {Object} Date range with since and until dates
 * @throws {Error} If --since date format is invalid
 * @throws {Error} If --until date format is invalid
 * @throws {Error} If --since date is after --until date
 */
export const calculateDateRange = (days, since, until) => {
  let sinceDate, untilDate;

  // If since is provided, use it
  if (since) {
    sinceDate = parseDate(since);
    if (!sinceDate) {
      throw new Error(`Invalid --since date format. Use YYYY-MM-DD (e.g., ${formatDate(new Date())})`);
    }
  }

  // If until is provided, use it; otherwise use today
  if (until) {
    untilDate = parseDate(until);
    if (!untilDate) {
      throw new Error(`Invalid --until date format. Use YYYY-MM-DD (e.g., ${formatDate(new Date())})`);
    }
  } else {
    untilDate = new Date();
  }

  // If since is not provided, calculate it from days
  if (!sinceDate) {
    sinceDate = new Date(untilDate.getTime() - days * MS_PER_DAY);
  }

  // Validate that since is before until
  if (sinceDate > untilDate) {
    throw new Error('--since date must be before --until date');
  }

  return {
    since: sinceDate,
    until: untilDate,
    sinceStr: formatDate(sinceDate),
    untilStr: formatDate(untilDate)
  };
};
