/**
 * File pattern matching utilities for ignore patterns
 * @module file-patterns
 */

import { readFile } from 'node:fs/promises';

/**
 * Parse .didignore file and return array of patterns
 * @param {string} filePath - Path to .didignore file
 * @returns {Promise<string[]>} Array of ignore patterns
 */
export const parseIgnoreFile = async (filePath) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')); // Remove empty lines and comments
  } catch {
    return []; // File doesn't exist or can't be read
  }
};

/**
 * Convert gitignore-style pattern to regex
 * @param {string} pattern - Gitignore-style pattern
 * @returns {RegExp|null} Regular expression matching the pattern, or null if invalid
 */
export const patternToRegex = (pattern) => {
  try {
    // Escape special regex characters except * and ?
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    // Handle directory-only patterns (ending with /)
    if (pattern.endsWith('/')) {
      regexPattern = `${regexPattern.slice(0, -2)}(/.*)?$`;
    } else {
      regexPattern = `${regexPattern}(/.*)?$`;
    }

    // Handle patterns starting with / (absolute from search root)
    if (pattern.startsWith('/')) {
      regexPattern = `^${regexPattern.slice(2)}`;
    } else {
      // Pattern can match anywhere in the path
      regexPattern = `(^|/)${regexPattern}`;
    }

    return new RegExp(regexPattern);
  } catch {
    // Invalid regex pattern, skip it
    console.warn(`Warning: Invalid pattern in .didignore: "${pattern}"`);
    return null;
  }
};

/**
 * Check if a path should be ignored based on ignore patterns
 * @param {string} path - Path to check (relative to search root)
 * @param {RegExp[]} ignoreRegexes - Array of ignore pattern regexes
 * @returns {boolean} True if path should be ignored
 */
export const shouldIgnorePath = (path, ignoreRegexes) => {
  return ignoreRegexes.some(regex => regex.test(path));
};

/**
 * Load ignore patterns from file and convert to regexes
 * @param {string} filePath - Path to .didignore file
 * @returns {Promise<RegExp[]>} Array of regex patterns
 */
export const loadIgnorePatterns = async (filePath) => {
  const patterns = await parseIgnoreFile(filePath);
  return patterns.map(patternToRegex).filter(Boolean); // Filter out null values
};

/**
 * Create an ignore matcher function from patterns
 * @param {RegExp[]} ignoreRegexes - Array of ignore pattern regexes
 * @returns {Function} Function that checks if a path should be ignored
 */
export const createIgnoreMatcher = (ignoreRegexes) => {
  return (path) => shouldIgnorePath(path, ignoreRegexes);
};
