/**
 * Markdown Formatter
 *
 * This module provides Markdown formatting for git-did output.
 * Pure function that converts structured data to Markdown document.
 *
 * @module shared/formatters/format-markdown
 */

/**
 * Format results as Markdown
 *
 * Converts the data structure to a formatted Markdown document.
 * This is a pure function with explicit dependencies as parameters.
 *
 * @param {Object} data - Data to format
 * @param {Array} [data.repos] - Repository list (project/short modes)
 * @param {Object} [data.commitsByDate] - Commits grouped by date (default mode)
 * @param {string} data.mode - Display mode (default, project, short)
 * @param {number} data.days - Number of days in the period
 * @param {string} [data.author] - Author filter if used
 * @param {string} data.duration - Execution time in seconds
 * @param {Array<string>} dayNames - Array of day names [Sunday, Monday, ...]
 * @returns {string} Markdown formatted output
 *
 * @example
 * const data = {
 *   repos: [{ path: 'my-repo', commits: [...] }],
 *   mode: 'project',
 *   days: 7,
 *   duration: '0.01'
 * };
 * const markdown = formatAsMarkdown(data, DAY_NAMES);
 * // => "# Git Activity Report\n\n..."
 */
export const formatAsMarkdown = (data, dayNames) => {
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
          const rebaseInfo = commit.isRebase ? ` *(rebased on ${commit.commitDate})*` : '';
          markdown += `- **${commit.time}** \`${commit.hash}\` - ${commit.message}${rebaseInfo}\n`;
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

      for (const date of dates) {
        const dateObj = new Date(date);
        const dayName = dayNames[dateObj.getDay()];
        markdown += `#### ${date} (${dayName})\n\n`;
        // Display commits in chronological order (oldest first)
        for (const commit of commitsByDate[date].slice().reverse()) {
          const rebaseInfo = commit.isRebase ? ` *(rebased on ${commit.commitDate})*` : '';
          markdown += `- **${commit.time}** \`${commit.hash}\` - ${commit.message}${rebaseInfo}\n`;
        }
        markdown += `\n`;
      }
    }
  }

  return markdown;
};
