/**
 * Git Configuration Management
 *
 * This module provides functions for reading and parsing Git configuration
 * values for the git-did tool. It handles both user configuration (user.email)
 * and tool-specific configuration (did.*).
 *
 * @module core/git-config
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Get the current Git user's email address
 *
 * Reads the user.email configuration from Git config.
 * This is typically used as the default author filter.
 *
 * @returns {Promise<string|null>} User email or null if not configured
 *
 * @example
 * const email = await getCurrentUserEmail();
 * // => "user@example.com"
 */
export const getCurrentUserEmail = async () => {
  try {
    const { stdout } = await execFileAsync('git', ['config', 'user.email']);
    return stdout.trim();
  } catch {
    return null;
  }
};

/**
 * Read a git-did configuration value from git config
 *
 * Checks local, global, and system config in order of priority.
 * Configuration keys are prefixed with 'did.' automatically.
 *
 * @param {string} key - Configuration key (without 'did.' prefix)
 * @param {string} [defaultValue=null] - Default value if not found
 * @returns {Promise<string|null>} Configuration value or default
 *
 * @example
 * const days = await getGitConfig('defaultDays', '7');
 * // => "14" (if configured) or "7" (default)
 */
export const getGitConfig = async (key, defaultValue = null) => {
  try {
    // Try to get value without specifying scope (respects git config priority)
    const { stdout } = await execFileAsync('git', ['config', `did.${key}`]);
    return stdout.trim() || defaultValue;
  } catch {
    return defaultValue;
  }
};

/**
 * Read all git-did configuration values
 *
 * Loads all supported configuration keys from Git config.
 * Keys without values are omitted from the result.
 *
 * Supported configuration keys:
 * - defaultDays: Default number of days to look back
 * - defaultMode: Default display mode (default, project, short)
 * - colors: Color output mode (auto, always, never)
 * - defaultFormat: Default output format (text, json, markdown)
 * - defaultAuthor: Default author filter pattern
 *
 * @returns {Promise<Object>} Configuration object with found values
 *
 * @example
 * const config = await loadGitConfig();
 * // => { defaultDays: "7", colors: "auto", ... }
 */
export const loadGitConfig = async () => {
  const config = {};

  // Load all supported configuration keys
  const keys = [
    'defaultDays',
    'defaultMode',
    'colors',
    'defaultFormat',
    'defaultAuthor'
  ];

  await Promise.all(
    keys.map(async (key) => {
      const value = await getGitConfig(key);
      if (value !== null) {
        config[key] = value;
      }
    })
  );

  return config;
};

/**
 * Parse and validate configuration values
 *
 * Converts raw string configuration values to validated typed values.
 * Invalid values are omitted from the result.
 *
 * Validation rules:
 * - defaultDays: Must be positive integer
 * - defaultMode: Must be 'default', 'project', or 'short'
 * - colors: Must be 'auto', 'always', or 'never'
 * - defaultFormat: Must be 'text', 'json', or 'markdown'
 * - defaultAuthor: Any non-empty string
 *
 * @param {Object} config - Raw configuration from git config
 * @returns {Object} Parsed and validated configuration
 *
 * @example
 * const raw = { defaultDays: "14", defaultMode: "invalid", colors: "auto" };
 * const parsed = parseConfig(raw);
 * // => { defaultDays: 14, colors: "auto" }
 * // (invalid defaultMode is omitted)
 */
export const parseConfig = (config) => {
  const parsed = {};

  // defaultDays: integer
  if (config.defaultDays) {
    const days = parseInt(config.defaultDays, 10);
    if (!isNaN(days) && days > 0) {
      parsed.defaultDays = days;
    }
  }

  // defaultMode: 'default', 'project', or 'short'
  if (config.defaultMode) {
    const mode = config.defaultMode.toLowerCase();
    if (['default', 'project', 'short'].includes(mode)) {
      parsed.defaultMode = mode;
    }
  }

  // colors: 'auto', 'always', or 'never'
  if (config.colors) {
    const colors = config.colors.toLowerCase();
    if (['auto', 'always', 'never'].includes(colors)) {
      parsed.colors = colors;
    }
  }

  // defaultFormat: 'text', 'json', or 'markdown'
  if (config.defaultFormat) {
    const format = config.defaultFormat.toLowerCase();
    if (['text', 'json', 'markdown'].includes(format)) {
      parsed.defaultFormat = format;
    }
  }

  // defaultAuthor: string (email or name pattern)
  if (config.defaultAuthor) {
    parsed.defaultAuthor = config.defaultAuthor;
  }

  return parsed;
};
