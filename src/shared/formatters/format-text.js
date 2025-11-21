/**
 * Text Formatter
 *
 * This module provides colorized text formatting for git-did output.
 * Pure functions that convert structured data to formatted console output.
 *
 * @module shared/formatters/format-text
 */

import {
  colorize,
  ANSI,
  getHashColor,
  getMessageColor,
  getTimeColor,
  getDaysAgoColor
} from '../display/colors.js';
import { SEPARATOR_LENGTH, formatRepoPath } from '../display/text-utils.js';
import { formatDate } from '../display/date-utils.js';

/**
 * Format commits for default (chronological) mode
 *
 * Displays commits grouped by date, then by repository.
 * Shows rebase summaries and regular commits in chronological order.
 *
 * @param {Object} data - Structured commit data
 * @param {Object} data.commitsByDate - Commits grouped by date and repo
 * @param {Object} data.rebaseSummariesByDate - Rebase summaries grouped by date and repo
 * @param {Array<string>} dayNames - Array of day names
 * @param {Object} terminalCaps - Terminal color capabilities
 * @param {string} cwd - Current working directory for path formatting
 * @returns {string} Formatted text output
 */
export const formatDefaultMode = (data, dayNames, terminalCaps, cwd) => {
  const { commitsByDate, rebaseSummariesByDate } = data;
  const dates = Object.keys(commitsByDate).sort();
  let output = '';

  for (const date of dates) {
    const dateObj = new Date(date);
    const dayName = dayNames[dateObj.getDay()];
    output += `📅 ${date} (${dayName})\n`;
    output += '─'.repeat(SEPARATOR_LENGTH) + '\n';

    const reposForDate = Object.keys(commitsByDate[date] || {});
    const rebaseReposForDate = Object.keys(rebaseSummariesByDate[date] || {});
    const allReposForDate = [...new Set([...reposForDate, ...rebaseReposForDate])];

    for (const repo of allReposForDate) {
      output += `\n  📁 ${formatRepoPath(repo, cwd)}\n`;

      // Display rebase summaries first
      if (rebaseSummariesByDate[date] && rebaseSummariesByDate[date][repo]) {
        for (const summary of rebaseSummariesByDate[date][repo]) {
          const dateRange = summary.firstAuthorDate === summary.lastAuthorDate
            ? summary.firstAuthorDate
            : `${summary.firstAuthorDate} to ${summary.lastAuthorDate}`;
          const timeColored = colorize(summary.commitTime, getTimeColor(summary.commitTime, terminalCaps), terminalCaps);
          const rebaseIcon = colorize('⟲', ANSI.rgb(255, 165, 0), terminalCaps);
          const summaryText = colorize(`Rebased ${summary.count} commit${summary.count > 1 ? 's' : ''} from ${dateRange}`, ANSI.rgb(136, 136, 136), terminalCaps);
          output += `     ${timeColored} ${rebaseIcon} ${summaryText}\n`;
        }
      }

      // Display regular commits
      if (commitsByDate[date] && commitsByDate[date][repo]) {
        const commits = commitsByDate[date][repo];
        // Display commits in chronological order (oldest first)
        for (const commit of commits.reverse()) {
          const timeColored = colorize(commit.time, getTimeColor(commit.time, terminalCaps), terminalCaps);
          const hashColored = colorize(commit.hash, getHashColor(terminalCaps), terminalCaps);
          const messageColored = colorize(commit.message, getMessageColor(terminalCaps), terminalCaps);
          const rebaseInfo = commit.isRebase ? colorize(` (rebased on ${commit.commitDate})`, '#888888', terminalCaps) : '';
          output += `     ${timeColored} ${hashColored} - ${messageColored}${rebaseInfo}\n`;
        }
      }
    }
    output += '\n';
  }

  return output;
};

/**
 * Format a single repository's commit list for project mode
 *
 * Shows commits grouped by date under a repository.
 *
 * @param {Array} commits - Array of commit objects
 * @param {Array<string>} dayNames - Array of day names
 * @param {Object} terminalCaps - Terminal color capabilities
 * @returns {string} Formatted text output
 */
export const formatRepoCommits = (commits, dayNames, terminalCaps) => {
  let output = '\n     Your commits:\n';

  // Group commits by date
  const commitsByDate = commits.reduce((acc, commit) => {
    if (!acc[commit.date]) {
      acc[commit.date] = [];
    }
    acc[commit.date].push(commit);
    return acc;
  }, {});

  const dates = Object.keys(commitsByDate).sort();

  for (const date of dates) {
    const dateObj = new Date(date);
    const dayName = dayNames[dateObj.getDay()];

    output += `\n        📅 ${date} (${dayName})\n`;
    // Display commits in chronological order (oldest first)
    for (const commit of commitsByDate[date].slice().reverse()) {
      const timeColored = colorize(commit.time, getTimeColor(commit.time, terminalCaps), terminalCaps);
      const hashColored = colorize(commit.hash, getHashColor(terminalCaps), terminalCaps);
      const messageColored = colorize(commit.message, getMessageColor(terminalCaps), terminalCaps);
      const rebaseInfo = commit.isRebase ? colorize(` (rebased on ${commit.commitDate})`, '#888888', terminalCaps) : '';
      output += `           ${timeColored} ${hashColored} - ${messageColored}${rebaseInfo}\n`;
    }
  }
  output += '\n';

  return output;
};

/**
 * Format results as colored text (default console output)
 *
 * Main entry point for text formatting. Handles all display modes:
 * - default: Chronological by date, then by project
 * - project: By project, with commits grouped by date
 * - short: Only last commit date per project
 *
 * @param {Object} data - Data to format
 * @param {Array} [data.repos] - Repository list (project/short modes)
 * @param {Object} [data.commitsByDate] - Commits grouped by date (default mode)
 * @param {Object} [data.rebaseSummariesByDate] - Rebase summaries grouped by date
 * @param {string} data.mode - Display mode (default, project, short)
 * @param {number} data.days - Number of days in the period
 * @param {string} [data.author] - Author filter if used
 * @param {string} data.duration - Execution time in seconds
 * @param {Array<string>} dayNames - Array of day names
 * @param {Object} terminalCaps - Terminal color capabilities
 * @param {string} cwd - Current working directory
 * @returns {string} Formatted text output
 *
 * @example
 * const data = {
 *   commitsByDate: { '2025-11-21': { 'repo1': [...] } },
 *   rebaseSummariesByDate: {},
 *   mode: 'default',
 *   days: 7,
 *   author: 'user@example.com',
 *   duration: '0.01'
 * };
 * const text = formatAsText(data, DAY_NAMES, terminalCaps, process.cwd());
 */
export const formatAsText = (data, dayNames, terminalCaps, cwd) => {
  const { mode, commitsByDate, rebaseSummariesByDate, repos } = data;
  let output = '';

  // Default mode (chronological)
  if (mode === 'default' && commitsByDate) {
    const dates = Object.keys(commitsByDate);
    if (dates.length === 0) {
      output += '❌ No commits found for this author in the specified period.\n';
    } else {
      output += formatDefaultMode({ commitsByDate, rebaseSummariesByDate }, dayNames, terminalCaps, cwd);
    }
  }
  // Project or short mode
  else if (repos && repos.length > 0) {
    for (const repo of repos) {
      output += `  📁 ${formatRepoPath(repo.path, cwd)}\n`;
      const daysAgoText = `${repo.daysAgo} day${repo.daysAgo !== 1 ? 's' : ''} ago`;
      const daysAgoColored = colorize(daysAgoText, getDaysAgoColor(repo.daysAgo, terminalCaps), terminalCaps);
      const dateObj = new Date(repo.lastCommitDate);
      const dateText = colorize(formatDate(dateObj), getMessageColor(terminalCaps), terminalCaps);
      output += `     └─ Last commit: ${daysAgoColored} (${dateText})\n`;

      // Project mode: show commits
      if (mode === 'project' && repo.commits && repo.commits.length > 0) {
        output += formatRepoCommits(repo.commits, dayNames, terminalCaps);
      }
    }
  }

  return output;
};
