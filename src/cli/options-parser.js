/**
 * CLI Options Parser
 *
 * This module handles command-line argument parsing and configuration merging.
 * Pure functions that process CLI arguments and git config.
 *
 * @module cli/options-parser
 */

/**
 * Merge CLI options with git configuration
 *
 * CLI options take priority over git config values.
 * Provides sensible defaults for all configuration options.
 *
 * @param {Object} cliOptions - Options from command line
 * @param {Object} gitConfig - Parsed git config values
 * @returns {Object} Merged configuration
 */
export const mergeConfig = (cliOptions, gitConfig) => {
  const config = {
    path: cliOptions.path,
    days: cliOptions.days ?? gitConfig.defaultDays ?? 7,
    since: cliOptions.since,
    until: cliOptions.until,
    project: cliOptions.project ?? (gitConfig.defaultMode === 'project'),
    short: cliOptions.short ?? (gitConfig.defaultMode === 'short'),
    author: cliOptions.author ?? gitConfig.defaultAuthor,
    format: cliOptions.format ?? gitConfig.defaultFormat ?? 'text',
    color: cliOptions.color
  };

  // Handle colors config: 'auto', 'always', 'never'
  if (gitConfig.colors && config.color === undefined) {
    if (gitConfig.colors === 'always') {
      config.color = true;
    } else if (gitConfig.colors === 'never') {
      config.color = false;
    }
    // 'auto' is the default behavior (undefined)
  }

  return config;
};

/**
 * Parse smart arguments (days and path can be in either order)
 *
 * Intelligently detects whether first argument is a number (days)
 * or a path string.
 *
 * @param {string} daysArg - First positional argument
 * @param {string} pathArg - Second positional argument
 * @returns {Object} Parsed { days, path }
 */
export const parseArguments = (daysArg, pathArg) => {
  let days, path;

  // If daysArg looks like a number, use it as days
  const parsedDays = parseInt(daysArg, 10);
  if (!isNaN(parsedDays) && String(parsedDays) === String(daysArg)) {
    days = parsedDays;
    path = pathArg || '.';
  }
  // Otherwise, treat daysArg as path (user provided path only)
  else if (daysArg) {
    days = undefined;
    path = daysArg;
  }
  // No arguments provided
  else {
    days = undefined;
    path = '.';
  }

  return { days, path };
};
