#!/usr/bin/env node

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Command } from 'commander';

const execFileAsync = promisify(execFile);

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

    // Recursively traverse subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const fullPath = join(dirPath, entry.name);
        try {
          const subRepos = await findActiveGitRepos(fullPath, days, visited, rootPath, ignoreRegexes);
          activeRepos.push(...subRepos);
        } catch (error) {
          // Ignore permission errors, etc.
          if (error.code !== 'EACCES' && error.code !== 'EPERM') {
            console.error(`Error traversing ${fullPath}:`, error.message);
          }
        }
      }
    }
  } catch (error) {
    if (error.code !== 'EACCES' && error.code !== 'EPERM') {
      console.error(`Error reading ${dirPath}:`, error.message);
    }
  }

  return activeRepos;
};

/**
 * Main function
 * @param {Object} options - Command options
 * @param {string} options.path - Starting path for repository search
 * @param {number} options.days - Number of days to look back
 * @param {boolean} options.standup - Enable standup mode
 * @param {boolean} options.chrono - Enable chronological mode
 * @param {string} [options.author] - Filter commits by author
 */
const main = async (options) => {
  const { path: startPath, days, standup: standupMode, chrono: chronoMode, author: customAuthor } = options;

  // Load .standupignore file from the search root
  const ignoreFilePath = join(startPath, '.standupignore');
  const ignorePatterns = await parseIgnoreFile(ignoreFilePath);
  const ignoreRegexes = ignorePatterns.map(patternToRegex);

  if (ignorePatterns.length > 0) {
    console.log(`� Loaded ${ignorePatterns.length} ignore pattern(s) from .standupignore\n`);
  }

  console.log(`�🔍 Searching for active Git repositories in: ${startPath}`);
  console.log(`📅 Activity in the last ${days} day${days !== 1 ? 's' : ''}\n`);

  const startTime = Date.now();
  const repos = await findActiveGitRepos(startPath, days, new Set(), null, ignoreRegexes);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  if (repos.length === 0) {
    console.log(`❌ No active Git repositories found.`);
  } else {
    console.log(`✅ ${repos.length} active Git repositor${repos.length > 1 ? 'ies' : 'y'} found:\n`);

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

      // Collect all commits from all repositories
      for (const repo of repos) {
        const userCommits = await getUserCommits(repo, author, days);
        for (const commit of userCommits) {
          if (!commitsByDateAndRepo[commit.date]) {
            commitsByDateAndRepo[commit.date] = {};
          }
          if (!commitsByDateAndRepo[commit.date][repo]) {
            commitsByDateAndRepo[commit.date][repo] = [];
          }
          commitsByDateAndRepo[commit.date][repo].push(commit);
        }
      }

      // Display in reverse chronological order (most recent first)
      const dates = Object.keys(commitsByDateAndRepo).sort().reverse();

      if (dates.length === 0) {
        console.log('❌ No commits found for this author in the specified period.\n');
      } else {
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
              console.log(`     ${commit.time} ${commit.hash} - ${commit.message}`);
            }
          }
          console.log('\n');
        }
      }
    }
    // Standup mode or standard mode
    else {
      for (const repo of repos) {
        const lastCommit = await getLastCommitDate(repo);
        const daysAgo = Math.floor((Date.now() - lastCommit.getTime()) / (24 * 60 * 60 * 1000));
        console.log(`  📁 ${repo}`);
        console.log(`     └─ Last commit: ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago (${lastCommit.toLocaleDateString()})`);

        // Standup mode: display author's commits
        if (standupMode && author) {
          const userCommits = await getUserCommits(repo, author, days);
          if (userCommits.length > 0) {
            console.log(`\n     Your commits:`);

            // Group commits by date
            const commitsByDate = userCommits.reduce((acc, commit) => {
              if (!acc[commit.date]) {
                acc[commit.date] = [];
              }
              acc[commit.date].push(commit);
              return acc;
            }, {});

            // Display commits grouped by date
            const dates = Object.keys(commitsByDate).sort().reverse();
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

            for (const date of dates) {
              // Calculate day of week
              const dateObj = new Date(date);
              const dayName = dayNames[dateObj.getDay()];

              console.log(`\n        📅 ${date} (${dayName})`);
              for (const commit of commitsByDate[date]) {
                console.log(`           ${commit.time} ${commit.hash} - ${commit.message}`);
              }
            }
            console.log('');
          }
        }
      }
    }
  }

  console.log(`\n⏱️  Execution time: ${duration}s`);
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
  .action(async (pathArg, daysArg, options) => {
    try {
      await main({
        path: pathArg,
        days: parseInt(daysArg, 10),
        standup: options.standup,
        chrono: options.chrono,
        author: options.author
      });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
