/**
 * JSON Formatter
 * 
 * This module provides JSON formatting for git-did output.
 * Pure function that converts structured data to JSON string.
 * 
 * @module shared/formatters/format-json
 */

/**
 * Format results as JSON
 * 
 * Converts the data structure to formatted JSON with 2-space indentation.
 * This is a pure function with no side effects.
 * 
 * @param {Object} data - Data to format
 * @param {Array} [data.repos] - Repository list (project/short modes)
 * @param {Object} [data.commitsByDate] - Commits grouped by date (default mode)
 * @param {string} data.mode - Display mode (default, project, short)
 * @param {number} data.days - Number of days in the period
 * @param {string} [data.author] - Author filter if used
 * @param {string} data.duration - Execution time in seconds
 * @returns {string} JSON formatted output
 * 
 * @example
 * const data = {
 *   repos: [{ path: 'my-repo', commits: [...] }],
 *   mode: 'project',
 *   days: 7,
 *   duration: '0.01'
 * };
 * const json = formatAsJSON(data);
 * // => "{\n  \"repos\": [...],\n  ...\n}"
 */
export const formatAsJSON = (data) => {
  return JSON.stringify(data, null, 2);
};
