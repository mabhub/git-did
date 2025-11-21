/**
 * Text formatting utilities for display
 * @module text-utils
 */

import { basename } from 'node:path';

/**
 * Separator line length for text output
 */
export const SEPARATOR_LENGTH = 60;

/**
 * Create a separator line
 * @param {number} length - Length of separator
 * @param {string} char - Character to use (default: '─')
 * @returns {string} Separator line
 */
export const createSeparator = (length = SEPARATOR_LENGTH, char = '─') => {
  return char.repeat(length);
};

/**
 * Format repository path for display
 * Add directory name in parentheses if path is '.'
 * @param {string} repoPath - Repository path
 * @param {string} cwd - Current working directory
 * @returns {string} Formatted path for display
 */
export const formatRepoPath = (repoPath, cwd) => {
  if (repoPath === '.') {
    const dirName = basename(cwd);
    return `. (${dirName})`;
  }
  return repoPath;
};
