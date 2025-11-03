#!/usr/bin/env node

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Command } from 'commander';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Read package.json version
 * @returns {Promise<string>} Package version
 */
const getPackageVersion = async () => {
  try {
    const packageJsonPath = join(__dirname, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
};

/**
 * Parse and validate a date string in YYYY-MM-DD format
 * @param {string} dateString - Date string to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
const parseDate = (dateString) => {
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
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Calculate date range from days parameter or since/until options
 * @param {number} days - Number of days (legacy parameter)
 * @param {string} [since] - Start date (YYYY-MM-DD)
 * @param {string} [until] - End date (YYYY-MM-DD)
 * @returns {Object} Date range with since and until dates
 */
const calculateDateRange = (days, since, until) => {
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
    sinceDate = new Date(untilDate.getTime() - days * 24 * 60 * 60 * 1000);
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

/**
 * Detect terminal color capabilities
 * @returns {Object} Terminal capabilities
 */
const detectTerminalCapabilities = () => {
  const { COLORTERM, TERM, NO_COLOR, FORCE_COLOR } = process.env;

  // Check if color is explicitly disabled or forced
  if (NO_COLOR !== undefined) return { colors: false, truecolor: false };
  if (FORCE_COLOR !== undefined) return { colors: true, truecolor: COLORTERM === 'truecolor' };

  // Check if stdout is a TTY (interactive terminal)
  const isTTY = process.stdout.isTTY;

  // Check for truecolor support
  const truecolor = COLORTERM === 'truecolor' || COLORTERM === '24bit';

  // Check for 256 color support
  const colors256 = TERM && (TERM.includes('256') || TERM.includes('xterm'));

  return {
    colors: isTTY,
    truecolor,
    colors256,
    basic: isTTY && !colors256 && !truecolor
  };
};

/**
 * ANSI color codes
 */
const ANSI = {
  reset: '\x1b[0m',
  // Basic colors (work on all terminals)
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  // 256 colors
  color256: (code) => `\x1b[38;5;${code}m`,
  // True color (RGB)
  rgb: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`
};

/**
 * Get color for commit hash
 * @param {Object} caps - Terminal capabilities
 * @returns {string} Color code
 */
const getHashColor = (caps) => {
  if (!caps.colors) return '';
  if (caps.truecolor) return ANSI.rgb(135, 206, 250); // Light sky blue
  if (caps.colors256) return ANSI.color256(117); // Sky blue
  return ANSI.cyan;
};

/**
 * Get color for commit message
 * @param {Object} caps - Terminal capabilities
 * @returns {string} Color code
 */
const getMessageColor = (caps) => {
  if (!caps.colors) return '';
  // Neutral color that works on both dark and light backgrounds
  if (caps.truecolor) return ANSI.rgb(180, 180, 180); // Medium gray
  if (caps.colors256) return ANSI.color256(250); // Light gray
  return ANSI.gray;
};

/**
 * Get color for time based on time of day
 * @param {string} time - Time in HH:MM format
 * @param {Object} caps - Terminal capabilities
 * @returns {string} Color code
 */
const getTimeColor = (time, caps) => {
  if (!caps.colors) return '';

  const [hours] = time.split(':').map(Number);

  // Morning (6-12): Yellow/Gold tones
  if (hours >= 6 && hours < 12) {
    if (caps.truecolor) return ANSI.rgb(255, 215, 0); // Gold
    if (caps.colors256) return ANSI.color256(220); // Gold
    return ANSI.yellow;
  }

  // Afternoon (12-18): Green tones
  if (hours >= 12 && hours < 18) {
    if (caps.truecolor) return ANSI.rgb(144, 238, 144); // Light green
    if (caps.colors256) return ANSI.color256(120); // Light green
    return ANSI.green;
  }

  // Evening (18-22): Orange/Magenta tones
  if (hours >= 18 && hours < 22) {
    if (caps.truecolor) return ANSI.rgb(255, 165, 100); // Light orange
    if (caps.colors256) return ANSI.color256(215); // Orange
    return ANSI.yellow;
  }

  // Night (22-6): Blue/Purple tones
  if (caps.truecolor) return ANSI.rgb(147, 112, 219); // Medium purple
  if (caps.colors256) return ANSI.color256(141); // Purple
  return ANSI.magenta;
};

/**
 * Get color for days ago based on commit recency
 * @param {number} daysAgo - Number of days since last commit
 * @param {Object} caps - Terminal capabilities
 * @returns {string} Color code
 */
const getDaysAgoColor = (daysAgo, caps) => {
  if (!caps.colors) return '';

  // Very recent (0-1 days): Bright green
  if (daysAgo <= 1) {
    if (caps.truecolor) return ANSI.rgb(50, 255, 50); // Bright green
    if (caps.colors256) return ANSI.color256(46); // Bright green
    return ANSI.green;
  }

  // Recent (2-7 days): Light green
  if (daysAgo <= 7) {
    if (caps.truecolor) return ANSI.rgb(144, 238, 144); // Light green
    if (caps.colors256) return ANSI.color256(120); // Light green
    return ANSI.green;
  }

  // Moderate (8-14 days): Yellow/Gold
  if (daysAgo <= 14) {
    if (caps.truecolor) return ANSI.rgb(255, 215, 0); // Gold
    if (caps.colors256) return ANSI.color256(220); // Gold
    return ANSI.yellow;
  }

  // Old (15-30 days): Orange
  if (daysAgo <= 30) {
    if (caps.truecolor) return ANSI.rgb(255, 165, 0); // Orange
    if (caps.colors256) return ANSI.color256(214); // Orange
    return ANSI.yellow;
  }

  // Very old (>30 days): Red/Magenta
  if (caps.truecolor) return ANSI.rgb(255, 100, 100); // Light red
  if (caps.colors256) return ANSI.color256(203); // Light red
  return ANSI.magenta;
};

/**
 * Colorize text
 * @param {string} text - Text to colorize
 * @param {string} colorCode - ANSI color code
 * @param {Object} caps - Terminal capabilities
 * @returns {string} Colorized text
 */
const colorize = (text, colorCode, caps) => {
  if (!caps.colors || !colorCode) return text;
  return `${colorCode}${text}${ANSI.reset}`;
};

/**
 * Format repository path for display
 * Add directory name in parentheses if path is '.'
 * @param {string} repoPath - Repository path
 * @returns {string} Formatted path for display
 */
const formatRepoPath = (repoPath) => {
  if (repoPath === '.') {
    const dirName = basename(process.cwd());
    return `. (${dirName})`;
  }
  return repoPath;
};

/**
 * Parse .didignore file and return array of patterns
 * @param {string} filePath - Path to .didignore file
 * @returns {Promise<string[]>} Array of ignore patterns
 */
const parseIgnoreFile = async (filePath) => {
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
const patternToRegex = (pattern) => {
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
const shouldIgnorePath = (path, ignoreRegexes) => {
  return ignoreRegexes.some(regex => regex.test(path));
};

/**
 * Check if a directory is a Git repository
 * @param {string} dirPath - Directory path
 * @returns {Promise<boolean>}
 */
const isGitRepository = async (dirPath) => {
  try {
    const gitPath = join(dirPath, '.git');
    const stats = await stat(gitPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
};

/**
 * Get the date of the last commit in a Git repository
 * @param {string} repoPath - Repository path
 * @returns {Promise<Date|null>}
 */
const getLastCommitDate = async (repoPath) => {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'log', '-1', '--format=%ct']);
    const timestamp = parseInt(stdout.trim(), 10);
    return new Date(timestamp * 1000);
  } catch {
    return null;
  }
};

/**
 * Get the current Git user's email
 * @returns {Promise<string|null>}
 */
const getCurrentUserEmail = async () => {
  try {
    const { stdout } = await execFileAsync('git', ['config', 'user.email']);
    return stdout.trim();
  } catch {
    return null;
  }
};

/**
 * Detect if the script was called as a Git subcommand
 * @returns {boolean} True if called via 'git did', false if called directly as 'git-did'
 */
const _isCalledViaGit = () => {
  // Git sets GIT_EXEC_PATH when running commands as subcommands
  return process.env.GIT_EXEC_PATH !== undefined;
};

/**
 * Read a git-did configuration value from git config
 * Checks local, global, and system config in order of priority
 * @param {string} key - Configuration key (without 'did.' prefix)
 * @param {string} [defaultValue] - Default value if not found
 * @returns {Promise<string|null>} Configuration value or default
 */
const getGitConfig = async (key, defaultValue = null) => {
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
 * @returns {Promise<Object>} Configuration object
 */
const loadGitConfig = async () => {
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
 * @param {Object} config - Raw configuration from git config
 * @returns {Object} Parsed and validated configuration
 */
const parseConfig = (config) => {
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

/**
 * Get user commits in the repository for a given period
 * @param {string} repoPath - Repository path
 * @param {string} author - Author pattern (email or partial name)
 * @param {string} sinceDate - Start date (YYYY-MM-DD)
 * @param {string} untilDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array<{hash: string, message: string, date: string, time: string, timestamp: number}>>}
 */
const getUserCommits = async (repoPath, author, sinceDate, untilDate) => {
  try {
    const format = '%h|%s|%as|%at|%aI'; // short hash|subject|date YYYY-MM-DD|timestamp|ISO
    const { stdout } = await execFileAsync('git', [
      '-C',
      repoPath,
      'log',
      `--author=${author}`,
      `--since=${sinceDate}`,
      `--until=${untilDate}`,
      `--abbrev=7`,
      `--format=${format}`
    ]);

    if (!stdout.trim()) return [];

    return stdout
      .trim()
      .split('\n')
      .map(line => {
        const parts = line.split('|');
        const hash = parts[0];
        const date = parts[2];
        const timestamp = parts[3];
        const isoDate = parts[4];
        // Message is everything between first and third pipe (handles pipes in message)
        const message = parts.slice(1, -3).join('|');
        const time = isoDate.split('T')[1].substring(0, 5); // Extract HH:MM
        return { hash, message, date, time, timestamp: parseInt(timestamp, 10) };
      });
  } catch {
    return [];
  }
};

/**
 * Check if the repository has had activity in a date range
 * @param {string} repoPath - Repository path
 * @param {Date} sinceDate - Start date
 * @param {Date} untilDate - End date
 * @returns {Promise<boolean>}
 */
const hasRecentActivity = async (repoPath, sinceDate, untilDate) => {
  const lastCommitDate = await getLastCommitDate(repoPath);
  if (!lastCommitDate) return false;

  return lastCommitDate >= sinceDate && lastCommitDate <= untilDate;
};

/**
 * Recursively traverse the directory tree and find active Git repositories
 * @param {string} dirPath - Directory path to traverse
 * @param {Date} sinceDate - Start date for activity check
 * @param {Date} untilDate - End date for activity check
 * @param {Set<string>} visited - Set of already visited paths (to avoid loops)
 * @param {string} rootPath - Root path for relative path calculation
 * @param {RegExp[]} ignoreRegexes - Array of ignore pattern regexes
 * @returns {Promise<string[]>}
 */
const findActiveGitRepos = async (dirPath, sinceDate, untilDate, visited = new Set(), rootPath = null, ignoreRegexes = []) => {
  const activeRepos = [];

  // Set root path on first call
  if (rootPath === null) {
    rootPath = dirPath;
  }

  // Avoid infinite loops with symbolic links
  try {
    await stat(dirPath);
  } catch {
    return activeRepos;
  }

  if (visited.has(dirPath)) return activeRepos;
  visited.add(dirPath);

  // Check if this path should be ignored
  const relativePath = relative(rootPath, dirPath);
  if (relativePath && shouldIgnorePath(relativePath, ignoreRegexes)) {
    return activeRepos;
  }

  try {
    // Check if it's a Git repository
    if (await isGitRepository(dirPath)) {
      const hasActivity = await hasRecentActivity(dirPath, sinceDate, untilDate);
      if (hasActivity) {
        activeRepos.push(dirPath);
      }
      // Don't descend into subdirectories of a Git repository
      return activeRepos;
    }

    // Read directory contents
    const entries = await readdir(dirPath, { withFileTypes: true });

    // Recursively traverse subdirectories in parallel
    const subdirPromises = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => {
        const fullPath = join(dirPath, entry.name);
        return findActiveGitRepos(fullPath, sinceDate, untilDate, visited, rootPath, ignoreRegexes)
          .catch(error => {
            // Ignore permission errors, etc.
            if (error.code !== 'EACCES' && error.code !== 'EPERM') {
              console.error(`Error traversing ${fullPath}:`, error.message);
            }
            return [];
          });
      });

    const subResults = await Promise.all(subdirPromises);
    subResults.forEach(subRepos => activeRepos.push(...subRepos));
  } catch (error) {
    if (error.code !== 'EACCES' && error.code !== 'EPERM') {
      console.error(`Error reading ${dirPath}:`, error.message);
    }
  }

  return activeRepos;
};

/**
 * Format results as JSON
 * @param {Object} data - Data to format
 * @returns {string} JSON formatted output
 */
const formatAsJSON = (data) => {
  return JSON.stringify(data, null, 2);
};

/**
 * Format results as Markdown
 * @param {Object} data - Data to format
 * @returns {string} Markdown formatted output
 */
const formatAsMarkdown = (data) => {
  const { repos, mode, days, author, duration } = data;
  let markdown = `# Git Activity Report\n\n`;
  markdown += `- **Period**: Last ${days} day${days !== 1 ? 's' : ''}\n`;
  markdown += `- **Mode**: ${mode}\n`;
  if (author) markdown += `- **Author**: ${author}\n`;

  // Count repos based on mode
  let repoCount = 0;
  if (mode === 'default' && data.commitsByDate) {
    const uniqueRepos = new Set();
    Object.values(data.commitsByDate).forEach(dateData => {
      Object.keys(dateData).forEach(repo => uniqueRepos.add(repo));
    });
    repoCount = uniqueRepos.size;
  } else if (repos) {
    repoCount = repos.length;
  }

  markdown += `- **Repositories found**: ${repoCount}\n`;
  markdown += `- **Execution time**: ${duration}s\n\n`;

  if (repoCount === 0) {
    markdown += `No active repositories found.\n`;
    return markdown;
  }

  markdown += `---\n\n`;

  // Default mode (chronological): group by date, then by project
  if (mode === 'default' && data.commitsByDate) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dates = Object.keys(data.commitsByDate).sort();

    for (const date of dates) {
      const dateObj = new Date(date);
      const dayName = dayNames[dateObj.getDay()];
      markdown += `## ${date} (${dayName})\n\n`;

      const reposForDate = Object.keys(data.commitsByDate[date]);
      for (const repo of reposForDate) {
        markdown += `### ${repo}\n\n`;
        const commits = data.commitsByDate[date][repo];
        // Display commits in chronological order (oldest first)
        for (const commit of commits.slice().reverse()) {
          markdown += `- **${commit.time}** \`${commit.hash}\` - ${commit.message}\n`;
        }
        markdown += `\n`;
      }
    }
  }
  // Project mode or short mode: group by project
  else {
    for (const repo of repos) {
      markdown += `## ${repo.path}\n\n`;
      markdown += `- **Last commit**: ${repo.daysAgo} day${repo.daysAgo !== 1 ? 's' : ''} ago (${repo.lastCommitDate})\n`;

      // In short mode, only show last commit date
      if (mode === 'short' || !repo.commits || repo.commits.length === 0) {
        markdown += `\n`;
        continue;
      }

      // Project mode: show commits grouped by date
      markdown += `\n### Your commits\n\n`;
      const commitsByDate = {};
      repo.commits.forEach(commit => {
        if (!commitsByDate[commit.date]) commitsByDate[commit.date] = [];
        commitsByDate[commit.date].push(commit);
      });

      const dates = Object.keys(commitsByDate).sort();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      for (const date of dates) {
        const dateObj = new Date(date);
        const dayName = dayNames[dateObj.getDay()];
        markdown += `#### ${date} (${dayName})\n\n`;
        // Display commits in chronological order (oldest first)
        for (const commit of commitsByDate[date].slice().reverse()) {
          markdown += `- **${commit.time}** \`${commit.hash}\` - ${commit.message}\n`;
        }
        markdown += `\n`;
      }
    }
  }

  return markdown;
};

/**
 * Main function
 * @param {Object} options - Command options
 * @param {string} options.path - Starting path for repository search
 * @param {number} options.days - Number of days to look back
 * @param {string} [options.since] - Start date (YYYY-MM-DD)
 * @param {string} [options.until] - End date (YYYY-MM-DD)
 * @param {boolean} options.project - Enable project mode (group by project first)
 * @param {boolean} options.short - Short mode (only show last commit date)
 * @param {string} [options.author] - Filter commits by author
 * @param {string} [options.format] - Output format (text, json, markdown)
 * @param {boolean} [options.color] - Color option (true to force, false to disable, undefined for auto)
 */
const main = async (options) => {
  // Load configuration from git config
  const gitConfig = parseConfig(await loadGitConfig());

  // Merge configuration: CLI options take priority over git config
  const config = {
    path: options.path,
    days: options.days ?? gitConfig.defaultDays ?? 7,
    since: options.since,
    until: options.until,
    project: options.project ?? (gitConfig.defaultMode === 'project'),
    short: options.short ?? (gitConfig.defaultMode === 'short'),
    author: options.author ?? gitConfig.defaultAuthor,
    format: options.format ?? gitConfig.defaultFormat ?? 'text',
    color: options.color
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

  const { path: startPath, days, since, until, project: projectMode, short: shortMode, author: customAuthor, format, color } = config;

  // Calculate date range
  let dateRange;
  try {
    dateRange = calculateDateRange(days, since, until);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  // Detect terminal capabilities and handle color options
  let terminalCaps = detectTerminalCapabilities();
  if (color === true) {
    // Force color
    terminalCaps = { ...terminalCaps, colors: true };
  } else if (color === false) {
    // Disable color
    terminalCaps = { colors: false, truecolor: false, colors256: false, basic: false };
  }

  // Load .didignore file from the search root
  const ignoreFilePath = join(startPath, '.didignore');
  const ignorePatterns = await parseIgnoreFile(ignoreFilePath);
  const ignoreRegexes = ignorePatterns.map(patternToRegex).filter(Boolean);

  // Only show progress messages in text format
  if (format === 'text') {
    if (ignorePatterns.length > 0) {
      console.log(`🚫 Loaded ${ignorePatterns.length} ignore pattern(s) from .didignore\n`);
    }
    console.log(`🔍 Searching for active Git repositories in: ${startPath}`);
    if (since || until) {
      console.log(`📅 Activity from ${dateRange.sinceStr} to ${dateRange.untilStr}\n`);
    } else {
      console.log(`📅 Activity in the last ${days} day${days !== 1 ? 's' : ''}\n`);
    }
  }

  const startTime = Date.now();
  const repos = await findActiveGitRepos(startPath, dateRange.since, dateRange.until, new Set(), null, ignoreRegexes);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Prepare data structure for output
  const mode = projectMode ? 'project' : (shortMode ? 'short' : 'default');
  const outputData = {
    repos: [],
    mode,
    days,
    since: dateRange.sinceStr,
    until: dateRange.untilStr,
    duration,
    startPath
  };

  if (repos.length === 0) {
    if (format === 'text') {
      console.log(`❌ No active Git repositories found.`);
    } else if (format === 'json') {
      console.log(formatAsJSON(outputData));
    } else if (format === 'markdown') {
      console.log(formatAsMarkdown(outputData));
    }
  } else {
    if (format === 'text') {
      console.log(`✅ ${repos.length} active Git repositor${repos.length > 1 ? 'ies' : 'y'} found:\n`);
    }

    // Determine the author to use (needed for all modes except short-only)
    let author = null;
    if (!shortMode || projectMode) {
      if (customAuthor) {
        author = customAuthor;
        if (format === 'text') {
          console.log(`👤 Filtering commits for author: ${author}\n`);
        }
      } else {
        author = await getCurrentUserEmail();
        if (!author) {
          console.error('⚠️  Unable to retrieve current Git user email');
          console.error('    Make sure git config user.email is configured');
          console.error('    Or use the --author option to specify an author\n');
        }
      }
    }

    // Default mode (chrono): chronological display by day, then by project
    if (!projectMode && !shortMode && author) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const commitsByDateAndRepo = {};

      // Collect all commits from all repositories in parallel
      const commitsPromises = repos.map(repo => getUserCommits(repo, author, dateRange.sinceStr, dateRange.untilStr));
      const allCommits = await Promise.all(commitsPromises);

      // Organize commits by date and repo
      allCommits.forEach((userCommits, index) => {
        const repo = repos[index];
        for (const commit of userCommits) {
          if (!commitsByDateAndRepo[commit.date]) {
            commitsByDateAndRepo[commit.date] = {};
          }
          if (!commitsByDateAndRepo[commit.date][repo]) {
            commitsByDateAndRepo[commit.date][repo] = [];
          }
          commitsByDateAndRepo[commit.date][repo].push(commit);
        }
      });

      // Display in chronological order (oldest first)
      const dates = Object.keys(commitsByDateAndRepo).sort();

      if (dates.length === 0) {
        if (format === 'text') {
          console.log('❌ No commits found for this author in the specified period.\n');
        }
        outputData.author = author;
        outputData.commitsByDate = {};
      } else {
        outputData.author = author;
        outputData.commitsByDate = commitsByDateAndRepo;
        outputData.repos = Object.keys(commitsByDateAndRepo.flatMap ? commitsByDateAndRepo : {}).reduce((unique, date) => {
          Object.keys(commitsByDateAndRepo[date]).forEach(repo => {
            if (!unique.includes(repo)) unique.push(repo);
          });
          return unique;
        }, []);

        if (format === 'text') {
          for (const date of dates) {
            const dateObj = new Date(date);
            const dayName = dayNames[dateObj.getDay()];
            console.log(`📅 ${date} (${dayName})`);
            console.log('─'.repeat(60));

            const reposForDate = Object.keys(commitsByDateAndRepo[date]);
            for (const repo of reposForDate) {
              console.log(`\n  📁 ${formatRepoPath(repo)}`);
              const commits = commitsByDateAndRepo[date][repo];
              // Display commits in chronological order (oldest first)
              for (const commit of commits.reverse()) {
                const timeColored = colorize(commit.time, getTimeColor(commit.time, terminalCaps), terminalCaps);
                const hashColored = colorize(commit.hash, getHashColor(terminalCaps), terminalCaps);
                const messageColored = colorize(commit.message, getMessageColor(terminalCaps), terminalCaps);
                console.log(`     ${timeColored} ${hashColored} - ${messageColored}`);
              }
            }
            console.log('\n');
          }
        } else if (format === 'json') {
          console.log(formatAsJSON(outputData));
        } else if (format === 'markdown') {
          console.log(formatAsMarkdown(outputData));
        }
      }
    }
    // Project mode or short mode
    else {
      // Fetch all last commit dates in parallel
      const lastCommitDatesPromises = repos.map(repo => getLastCommitDate(repo));
      const lastCommitDates = await Promise.all(lastCommitDatesPromises);

      // Fetch all user commits in parallel if in project mode (and not short-only)
      let allUserCommits = [];
      if (projectMode && !shortMode && author) {
        const userCommitsPromises = repos.map(repo => getUserCommits(repo, author, dateRange.sinceStr, dateRange.untilStr));
        allUserCommits = await Promise.all(userCommitsPromises);
      }

      // Display results
      for (let i = 0; i < repos.length; i++) {
        const repo = repos[i];
        const lastCommit = lastCommitDates[i];
        const daysAgo = Math.floor((Date.now() - lastCommit.getTime()) / (24 * 60 * 60 * 1000));

        if (format === 'text') {
          console.log(`  📁 ${formatRepoPath(repo)}`);
          const daysAgoText = `${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`;
          const daysAgoColored = colorize(daysAgoText, getDaysAgoColor(daysAgo, terminalCaps), terminalCaps);
          const dateText = colorize(formatDate(lastCommit), getMessageColor(terminalCaps), terminalCaps);
          console.log(`     └─ Last commit: ${daysAgoColored} (${dateText})`);
        }

        // Project mode: display author's commits grouped by date (only if not short mode)
        if (projectMode && !shortMode && author) {
          const userCommits = allUserCommits[i];
          if (userCommits.length > 0 && format === 'text') {
            console.log(`\n     Your commits:`);

            // Group commits by date
            const commitsByDate = userCommits.reduce((acc, commit) => {
              if (!acc[commit.date]) {
                acc[commit.date] = [];
              }
              acc[commit.date].push(commit);
              return acc;
            }, {});

            // Display commits grouped by date (text format only)
            if (format === 'text') {
              const dates = Object.keys(commitsByDate).sort();
              const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

              for (const date of dates) {
                // Calculate day of week
                const dateObj = new Date(date);
                const dayName = dayNames[dateObj.getDay()];

                console.log(`\n        📅 ${date} (${dayName})`);
                // Display commits in chronological order (oldest first)
                for (const commit of commitsByDate[date].slice().reverse()) {
                  const timeColored = colorize(commit.time, getTimeColor(commit.time, terminalCaps), terminalCaps);
                  const hashColored = colorize(commit.hash, getHashColor(terminalCaps), terminalCaps);
                  const messageColored = colorize(commit.message, getMessageColor(terminalCaps), terminalCaps);
                  console.log(`           ${timeColored} ${hashColored} - ${messageColored}`);
                }
              }
              console.log('');
            }
          }
        }
      }

      // Collect data for non-text formats
      if (format !== 'text') {
        outputData.repos = repos.map((repo, i) => ({
          path: repo,
          lastCommitDate: formatDate(lastCommitDates[i]),
          daysAgo: Math.floor((Date.now() - lastCommitDates[i].getTime()) / (24 * 60 * 60 * 1000)),
          commits: projectMode && !shortMode && author ? allUserCommits[i] : []
        }));

        // Output for non-text formats
        if (format === 'json') {
          console.log(formatAsJSON(outputData));
        } else if (format === 'markdown') {
          console.log(formatAsMarkdown(outputData));
        }
      }
    }
  }

  if (format === 'text') {
    console.log(`\n⏱️  Execution time: ${duration}s`);
  }
};

// CLI setup with commander
const program = new Command();

const packageVersion = await getPackageVersion();

program
  .name('git-did')
  .description('Git activity tracker for standup meetings and project monitoring')
  .version(packageVersion)
  .argument('[days]', 'Number of days to look back')
  .argument('[path]', 'Starting path for repository search', '.')
  .option('-p, --project', 'Enable project mode (group by project first, then by date)')
  .option('-s, --short', 'Short mode (only show last commit date without details)')
  .option('-a, --author <email>', 'Filter commits by author (email or partial name)')
  .option('-f, --format <type>', 'Output format: text, json, or markdown')
  .option('--since <date>', 'Start date for activity search (YYYY-MM-DD)')
  .option('--until <date>', 'End date for activity search (YYYY-MM-DD, default: today)')
  .option('--color', 'Force color output (even for non-TTY)')
  .option('--no-color', 'Disable color output')
  .action(async (daysArg, pathArg, options) => {
    try {
      // Smart argument parsing: detect if first arg is a number or a path
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

      await main({
        path,
        days,
        since: options.since,
        until: options.until,
        project: options.project,
        short: options.short,
        author: options.author,
        format: options.format,
        color: options.color
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
