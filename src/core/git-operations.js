/**
 * Git operations for repository discovery and commit retrieval
 * @module git-operations
 */

import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseCommitsAndDetectRebases } from './rebase-detection.js';
import { shouldIgnorePath } from '../utils/file-patterns.js';

const execFileAsync = promisify(execFile);

/**
 * Check if a directory is a Git repository
 * @param {string} dirPath - Directory path
 * @returns {Promise<boolean>}
 */
export const isGitRepository = async (dirPath) => {
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
 * @returns {Promise<{authorDate: Date|null, commitDate: Date|null}>}
 */
export const getLastCommitDate = async (repoPath) => {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'log', '-1', '--format=%at|%ct']);
    const [authorTimestamp, commitTimestamp] = stdout.trim().split('|').map(t => parseInt(t, 10));
    return {
      authorDate: new Date(authorTimestamp * 1000),
      commitDate: new Date(commitTimestamp * 1000)
    };
  } catch {
    return { authorDate: null, commitDate: null };
  }
};

/**
 * Get user commits in the repository for a given period
 * @param {string} repoPath - Repository path
 * @param {string} author - Author pattern (email or partial name)
 * @param {string} sinceDate - Start date (YYYY-MM-DD)
 * @param {string} untilDate - End date (YYYY-MM-DD)
 * @returns {Promise<{commits: Array, rebaseSummaries: Array}>} Commits and rebase summaries
 */
export const getUserCommits = async (repoPath, author, sinceDate, untilDate) => {
  try {
    const format = '%h|%s|%as|%at|%aI|%cs|%ct|%cI'; // short hash|subject|author date|author timestamp|author ISO|commit date|commit timestamp|commit ISO
    // Use --all to include all branches, and filter by author date range manually
    const { stdout } = await execFileAsync('git', [
      '-C',
      repoPath,
      'log',
      '--all',
      `--author=${author}`,
      `--abbrev=7`,
      `--format=${format}`
    ]);

    // Parse date range for filtering and rebase detection
    const sinceTimestamp = new Date(sinceDate).getTime() / 1000;
    const untilTimestamp = new Date(untilDate + 'T23:59:59').getTime() / 1000;

    return parseCommitsAndDetectRebases(stdout, sinceTimestamp, untilTimestamp);
  } catch {
    return { commits: [], rebaseSummaries: [] };
  }
};

/**
 * Check if the repository has had activity in a date range
 * Checks both AuthorDate and CommitDate - repository is active if either is in range
 * @param {string} repoPath - Repository path
 * @param {Date} sinceDate - Start date
 * @param {Date} untilDate - End date
 * @returns {Promise<boolean>}
 */
export const hasRecentActivity = async (repoPath, sinceDate, untilDate) => {
  const lastCommit = await getLastCommitDate(repoPath);
  if (!lastCommit.authorDate && !lastCommit.commitDate) return false;

  // Repository is active if either AuthorDate or CommitDate is in range
  const authorInRange = lastCommit.authorDate &&
    lastCommit.authorDate >= sinceDate && lastCommit.authorDate <= untilDate;
  const commitInRange = lastCommit.commitDate &&
    lastCommit.commitDate >= sinceDate && lastCommit.commitDate <= untilDate;

  return authorInRange || commitInRange;
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
export const findActiveGitRepos = async (dirPath, sinceDate, untilDate, visited = new Set(), rootPath = null, ignoreRegexes = []) => {
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
