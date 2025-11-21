/**
 * Rebase detection logic for Git commits
 * @module rebase-detection
 */

import { createRebaseSummary } from '../shared/types/activity-entry.js';

/**
 * Check if a commit was rebased (CommitDate significantly different from AuthorDate)
 * @param {number} authorTimestamp - Author timestamp (seconds)
 * @param {number} commitTimestamp - Commit timestamp (seconds)
 * @param {number} [threshold=86400] - Threshold in seconds (default: 1 day)
 * @returns {boolean} True if commit was rebased
 */
export const isRebasedCommit = (authorTimestamp, commitTimestamp, threshold = 86400) => {
  const timeDiff = Math.abs(commitTimestamp - authorTimestamp);
  return timeDiff > threshold;
};

/**
 * Filter commits by date range
 * @param {Array<Object>} commits - Array of commit objects
 * @param {number} sinceTimestamp - Start timestamp (seconds)
 * @param {number} untilTimestamp - End timestamp (seconds)
 * @param {string} dateField - Field to check ('authorInRange' or 'commitInRange')
 * @returns {Array<Object>} Filtered commits
 */
export const filterCommitsByDateRange = (commits, sinceTimestamp, untilTimestamp, dateField) => {
  return commits.filter(commit => commit[dateField]);
};

/**
 * Group commits by a date field
 * @param {Array<Object>} commits - Array of commit objects
 * @param {Function} dateExtractor - Function to extract date from commit
 * @returns {Object} Commits grouped by date
 */
export const groupCommitsByDate = (commits, dateExtractor) => {
  return commits.reduce((acc, commit) => {
    const date = dateExtractor(commit);
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(commit);
    return acc;
  }, {});
};

/**
 * Create rebase summaries from grouped rebased commits
 * @param {Object} rebasesByDate - Commits grouped by commit date
 * @returns {Array<Object>} Array of rebase summary objects
 */
export const createRebaseSummaries = (rebasesByDate) => {
  return Object.entries(rebasesByDate).map(([commitDate, commits]) => {
    // Find the date range of original commits
    const authorDates = commits.map(c => c.date).sort();
    const firstDate = authorDates[0];
    const lastDate = authorDates[authorDates.length - 1];

    // Get the time from the first commit's CommitDate (ISO format)
    const firstCommit = commits[0];
    const commitTime = firstCommit.commitIsoDate.split('T')[1].substring(0, 5);

    return createRebaseSummary({
      commitDate,
      commitTime,
      count: commits.length,
      firstAuthorDate: firstDate,
      lastAuthorDate: lastDate,
      commits: commits.map(c => ({ hash: c.hash, date: c.date, message: c.message }))
    });
  });
};

/**
 * Parse commit data and detect rebases
 * @param {string} stdout - Git log output
 * @param {number} sinceTimestamp - Start timestamp (seconds)
 * @param {number} untilTimestamp - End timestamp (seconds)
 * @returns {Object} Object with commits and rebase summaries
 */
export const parseCommitsAndDetectRebases = (stdout, sinceTimestamp, untilTimestamp) => {
  if (!stdout.trim()) return { commits: [], rebaseSummaries: [] };

  const allCommits = stdout
    .trim()
    .split('\n')
    .map(line => {
      const parts = line.split('|');
      const hash = parts[0];
      const date = parts[2];
      const timestamp = parseInt(parts[3], 10);
      const authorIsoDate = parts[4];
      const commitDate = parts[parts.length - 3];
      const commitTimestamp = parseInt(parts[parts.length - 2], 10);
      const commitIsoDate = parts[parts.length - 1];
      // Message is everything between first and last 6 pipes (handles pipes in message)
      const message = parts.slice(1, -6).join('|');
      const time = authorIsoDate.split('T')[1].substring(0, 5);

      // Check if AuthorDate is in range
      const authorInRange = timestamp >= sinceTimestamp && timestamp <= untilTimestamp;

      // Check if CommitDate is in range
      const commitInRange = commitTimestamp >= sinceTimestamp && commitTimestamp <= untilTimestamp;

      // Detect rebase
      const isRebase = isRebasedCommit(timestamp, commitTimestamp);

      return {
        hash,
        message,
        date,
        time,
        timestamp,
        commitDate,
        commitTimestamp,
        commitIsoDate,
        isRebase,
        authorInRange,
        commitInRange
      };
    });

  // Regular commits: authored in the date range
  const commits = filterCommitsByDateRange(allCommits, sinceTimestamp, untilTimestamp, 'authorInRange');

  // Rebased commits: rebased during the period but authored outside
  const rebasedCommits = allCommits.filter(commit =>
    commit.isRebase && commit.commitInRange && !commit.authorInRange
  );

  // Group rebased commits by CommitDate
  const rebasesByDate = groupCommitsByDate(rebasedCommits, commit => commit.commitDate);

  // Create summary entries
  const rebaseSummaries = createRebaseSummaries(rebasesByDate);

  return { commits, rebaseSummaries };
};
