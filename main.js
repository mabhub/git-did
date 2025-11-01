#!/usr/bin/env node

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Command } from 'commander';

const execFileAsync = promisify(execFile);

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
 * Parse .standupignore file and return array of patterns
 * @param {string} filePath - Path to .standupignore file
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
 * @returns {RegExp} Regular expression matching the pattern
 */
const patternToRegex = (pattern) => {
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
 * Get user commits in the repository for a given period
 * @param {string} repoPath - Repository path
 * @param {string} author - Author pattern (email or partial name)
 * @param {number} days - Number of days
 * @returns {Promise<Array<{hash: string, message: string, date: string, time: string, timestamp: number}>>}
 */
const getUserCommits = async (repoPath, author, days) => {
  try {
    const since = `${days}.days.ago`;
    const format = '%h|%s|%as|%at|%aI'; // short hash|subject|date YYYY-MM-DD|timestamp|ISO
    const { stdout } = await execFileAsync('git', [
      '-C',
      repoPath,
      'log',
      `--author=${author}`,
      `--since=${since}`,
      `--format=${format}`
    ]);

    if (!stdout.trim()) return [];

    return stdout
      .trim()
      .split('\n')
      .map(line => {
        const [hash, message, date, timestamp, isoDate] = line.split('|');
        const time = isoDate.split('T')[1].substring(0, 5); // Extract HH:MM
        return { hash, message, date, time, timestamp: parseInt(timestamp, 10) };
      });
  } catch {
    return [];
  }
};

/**
 * Check if the repository has had activity in the last X days
 * @param {string} repoPath - Repository path
 * @param {number} days - Number of days
 * @returns {Promise<boolean>}
 */
const hasRecentActivity = async (repoPath, days) => {
  const lastCommitDate = await getLastCommitDate(repoPath);
  if (!lastCommitDate) return false;

  const now = new Date();
  const daysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return lastCommitDate >= daysAgo;
};

/**
 * Recursively traverse the directory tree and find active Git repositories
 * @param {string} dirPath - Directory path to traverse
 * @param {number} days - Number of days of activity
 * @param {Set<string>} visited - Set of already visited paths (to avoid loops)
 * @param {string} rootPath - Root path for relative path calculation
 * @param {RegExp[]} ignoreRegexes - Array of ignore pattern regexes
 * @returns {Promise<string[]>}
 */
const findActiveGitRepos = async (dirPath, days, visited = new Set(), rootPath = null, ignoreRegexes = []) => {
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
      const hasActivity = await hasRecentActivity(dirPath, days);
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
        return findActiveGitRepos(fullPath, days, visited, rootPath, ignoreRegexes)
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
  markdown += `- **Repositories found**: ${repos.length}\n`;
  markdown += `- **Execution time**: ${duration}s\n\n`;

  if (repos.length === 0) {
    markdown += `No active repositories found.\n`;
    return markdown;
  }

  markdown += `---\n\n`;

  if (mode === 'chrono' && data.commitsByDate) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dates = Object.keys(data.commitsByDate).sort().reverse();

    for (const date of dates) {
      const dateObj = new Date(date);
      const dayName = dayNames[dateObj.getDay()];
      markdown += `## ${date} (${dayName})\n\n`;

      const reposForDate = Object.keys(data.commitsByDate[date]);
      for (const repo of reposForDate) {
        markdown += `### ${repo}\n\n`;
        const commits = data.commitsByDate[date][repo];
        for (const commit of commits) {
          markdown += `- **${commit.time}** \`${commit.hash}\` - ${commit.message}\n`;
        }
        markdown += `\n`;
      }
    }
  } else {
    for (const repo of repos) {
      markdown += `## ${repo.path}\n\n`;
      markdown += `- **Last commit**: ${repo.daysAgo} day${repo.daysAgo !== 1 ? 's' : ''} ago (${repo.lastCommitDate})\n\n`;

      if (repo.commits && repo.commits.length > 0) {
        markdown += `### Your commits\n\n`;
        const commitsByDate = {};
        repo.commits.forEach(commit => {
          if (!commitsByDate[commit.date]) commitsByDate[commit.date] = [];
          commitsByDate[commit.date].push(commit);
        });

        const dates = Object.keys(commitsByDate).sort().reverse();
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        for (const date of dates) {
          const dateObj = new Date(date);
          const dayName = dayNames[dateObj.getDay()];
          markdown += `#### ${date} (${dayName})\n\n`;
          for (const commit of commitsByDate[date]) {
            markdown += `- **${commit.time}** \`${commit.hash}\` - ${commit.message}\n`;
          }
          markdown += `\n`;
        }
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
 * @param {boolean} options.standup - Enable standup mode
 * @param {boolean} options.chrono - Enable chronological mode
 * @param {string} [options.author] - Filter commits by author
 * @param {string} [options.format] - Output format (text, json, markdown)
 * @param {boolean} [options.color] - Color option (true to force, false to disable, undefined for auto)
 */
const main = async (options) => {
  const { path: startPath, days, standup: standupMode, chrono: chronoMode, author: customAuthor, format = 'text', color } = options;

  // Detect terminal capabilities and handle color options
  let terminalCaps = detectTerminalCapabilities();
  if (color === true) {
    // Force color
    terminalCaps = { ...terminalCaps, colors: true };
  } else if (color === false) {
    // Disable color
    terminalCaps = { colors: false, truecolor: false, colors256: false, basic: false };
  }

  // Load .standupignore file from the search root
  const ignoreFilePath = join(startPath, '.standupignore');
  const ignorePatterns = await parseIgnoreFile(ignoreFilePath);
  const ignoreRegexes = ignorePatterns.map(patternToRegex);

  // Only show progress messages in text format
  if (format === 'text') {
    if (ignorePatterns.length > 0) {
      console.log(`🚫 Loaded ${ignorePatterns.length} ignore pattern(s) from .standupignore\n`);
    }
    console.log(`� Searching for active Git repositories in: ${startPath}`);
    console.log(`📅 Activity in the last ${days} day${days !== 1 ? 's' : ''}\n`);
  }

  const startTime = Date.now();
  const repos = await findActiveGitRepos(startPath, days, new Set(), null, ignoreRegexes);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Prepare data structure for output
  const mode = chronoMode ? 'chrono' : (standupMode ? 'standup' : 'standard');
  const outputData = {
    repos: [],
    mode,
    days,
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

    // Determine the author to use for standup or chrono mode
    let author = null;
    if (standupMode || chronoMode) {
      if (customAuthor) {
        author = customAuthor;
        console.log(`👤 Filtering commits for author: ${author}\n`);
      } else {
        author = await getCurrentUserEmail();
        if (!author) {
          console.error('⚠️  Unable to retrieve current Git user email');
          console.error('    Make sure git config user.email is configured');
          console.error('    Or use the --author option to specify an author\n');
        }
      }
    }

    // Chrono mode: chronological display by day
    if (chronoMode && author) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const commitsByDateAndRepo = {};

      // Collect all commits from all repositories in parallel
      const commitsPromises = repos.map(repo => getUserCommits(repo, author, days));
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

      // Display in reverse chronological order (most recent first)
      const dates = Object.keys(commitsByDateAndRepo).sort().reverse();

      if (dates.length === 0) {
        if (format === 'text') {
          console.log('❌ No commits found for this author in the specified period.\n');
        }
        outputData.author = author;
        outputData.commitsByDate = {};
      } else {
        outputData.author = author;
        outputData.commitsByDate = commitsByDateAndRepo;

        if (format === 'text') {
          for (const date of dates) {
            const dateObj = new Date(date);
            const dayName = dayNames[dateObj.getDay()];
            console.log(`📅 ${date} (${dayName})`);
            console.log('─'.repeat(60));

            const reposForDate = Object.keys(commitsByDateAndRepo[date]);
            for (const repo of reposForDate) {
              console.log(`\n  📁 ${repo}`);
              const commits = commitsByDateAndRepo[date][repo];
              for (const commit of commits) {
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
    // Standup mode or standard mode
    else {
      // Fetch all last commit dates in parallel
      const lastCommitDatesPromises = repos.map(repo => getLastCommitDate(repo));
      const lastCommitDates = await Promise.all(lastCommitDatesPromises);

      // Fetch all user commits in parallel if in standup mode
      let allUserCommits = [];
      if (standupMode && author) {
        const userCommitsPromises = repos.map(repo => getUserCommits(repo, author, days));
        allUserCommits = await Promise.all(userCommitsPromises);
      }

      // Display results
      for (let i = 0; i < repos.length; i++) {
        const repo = repos[i];
        const lastCommit = lastCommitDates[i];
        const daysAgo = Math.floor((Date.now() - lastCommit.getTime()) / (24 * 60 * 60 * 1000));
        
        if (format === 'text') {
          console.log(`  📁 ${repo}`);
          console.log(`     └─ Last commit: ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago (${lastCommit.toLocaleDateString()})`);
        }

        // Standup mode: display author's commits
        if (standupMode && author) {
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
              const dates = Object.keys(commitsByDate).sort().reverse();
              const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

              for (const date of dates) {
                // Calculate day of week
                const dateObj = new Date(date);
                const dayName = dayNames[dateObj.getDay()];

                console.log(`\n        📅 ${date} (${dayName})`);
                for (const commit of commitsByDate[date]) {
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
          lastCommitDate: lastCommitDates[i].toLocaleDateString(),
          daysAgo: Math.floor((Date.now() - lastCommitDates[i].getTime()) / (24 * 60 * 60 * 1000)),
          commits: standupMode && author ? allUserCommits[i] : []
        }));
      }
    }

    // Output based on format
    if (format === 'json') {
      if (chronoMode && author) {
        outputData.author = author;
        outputData.commitsByDate = commitsByDateAndRepo;
      }
      console.log(formatAsJSON(outputData));
    } else if (format === 'markdown') {
      if (chronoMode && author) {
        outputData.author = author;
        outputData.commitsByDate = commitsByDateAndRepo;
      }
      console.log(formatAsMarkdown(outputData));
    }
  }

  if (format === 'text') {
    console.log(`\n⏱️  Execution time: ${duration}s`);
  }
};

// CLI setup with commander
const program = new Command();

program
  .name('standup')
  .description('Git activity tracker for standup meetings and project monitoring')
  .version('0.1.0')
  .argument('[path]', 'Starting path for repository search', '.')
  .argument('[days]', 'Number of days to look back', '7')
  .option('-s, --standup', 'Enable standup mode (group commits by repository)')
  .option('-c, --chrono', 'Enable chronological mode (group commits by date)')
  .option('-a, --author <email>', 'Filter commits by author (email or partial name)')
  .option('-f, --format <type>', 'Output format: text, json, or markdown', 'text')
  .option('--color', 'Force color output (even for non-TTY)')
  .option('--no-color', 'Disable color output')
  .action(async (pathArg, daysArg, options) => {
    try {
      await main({
        path: pathArg,
        days: parseInt(daysArg, 10),
        standup: options.standup,
        chrono: options.chrono,
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
