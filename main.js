#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import {
  DAY_NAMES,
  MS_PER_DAY,
  formatDate,
  calculateDateRange
} from './src/shared/display/date-utils.js';
import {
  detectTerminalCapabilities
} from './src/shared/display/colors.js';
import {
  parseIgnoreFile,
  patternToRegex
} from './src/utils/file-patterns.js';
import {
  getLastCommitDate,
  getUserCommits,
  findActiveGitRepos
} from './src/core/git-operations.js';
import {
  getCurrentUserEmail,
  loadGitConfig,
  parseConfig
} from './src/core/git-config.js';
import { formatAsJSON } from './src/shared/formatters/format-json.js';
import { formatAsMarkdown } from './src/shared/formatters/format-markdown.js';
import { formatAsText } from './src/shared/formatters/format-text.js';
import { mergeConfig, parseArguments } from './src/cli/options-parser.js';

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

const main = async (options) => {
  const gitConfig = parseConfig(await loadGitConfig());
  const config = mergeConfig(options, gitConfig);
  const { path: startPath, days, since, until, project: projectMode, short: shortMode, author: customAuthor, format, color } = config;

  let dateRange;
  try {
    dateRange = calculateDateRange(days, since, until);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  let terminalCaps = detectTerminalCapabilities();
  if (color === true) terminalCaps = { ...terminalCaps, colors: true };
  else if (color === false) terminalCaps = { colors: false, truecolor: false, colors256: false, basic: false };

  const ignoreFilePath = join(startPath, '.didignore');
  const ignorePatterns = await parseIgnoreFile(ignoreFilePath);
  const ignoreRegexes = ignorePatterns.map(patternToRegex).filter(Boolean);

  if (format === 'text') {
    if (ignorePatterns.length > 0) console.log(`🚫 Loaded ${ignorePatterns.length} ignore pattern(s) from .didignore\n`);
    console.log(`🔍 Searching for active Git repositories in: ${startPath}`);
    if (since || until) console.log(`📅 Activity from ${dateRange.sinceStr} to ${dateRange.untilStr}\n`);
    else console.log(`📅 Activity in the last ${days} day${days !== 1 ? 's' : ''}\n`);
  }

  const startTime = Date.now();
  const repos = await findActiveGitRepos(startPath, dateRange.since, dateRange.until, new Set(), null, ignoreRegexes);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  const mode = projectMode ? 'project' : (shortMode ? 'short' : 'default');
  const outputData = { repos: [], mode, days, since: dateRange.sinceStr, until: dateRange.untilStr, duration, startPath };

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

    let author = null;
    if (!shortMode || projectMode) {
      if (customAuthor) {
        author = customAuthor;
        if (format === 'text') console.log(`👤 Filtering commits for author: ${author}\n`);
      } else {
        author = await getCurrentUserEmail();
        if (!author) {
          console.error('⚠️  Unable to retrieve current Git user email');
          console.error('    Make sure git config user.email is configured');
          console.error('    Or use the --author option to specify an author\n');
        }
      }
    }

    if (!projectMode && !shortMode && author) {
      const commitsByDateAndRepo = {};
      const rebaseSummariesByDate = {};

      const commitsPromises = repos.map(repo => getUserCommits(repo, author, dateRange.sinceStr, dateRange.untilStr));
      const allResults = await Promise.all(commitsPromises);

      allResults.forEach((result, index) => {
        const repo = repos[index];

        for (const commit of result.commits) {
          if (!commitsByDateAndRepo[commit.date]) commitsByDateAndRepo[commit.date] = {};
          if (!commitsByDateAndRepo[commit.date][repo]) commitsByDateAndRepo[commit.date][repo] = [];
          commitsByDateAndRepo[commit.date][repo].push(commit);
        }

        for (const summary of result.rebaseSummaries) {
          if (!rebaseSummariesByDate[summary.commitDate]) rebaseSummariesByDate[summary.commitDate] = {};
          if (!rebaseSummariesByDate[summary.commitDate][repo]) rebaseSummariesByDate[summary.commitDate][repo] = [];
          rebaseSummariesByDate[summary.commitDate][repo].push(summary);
        }
      });

      const dates = Object.keys(commitsByDateAndRepo).sort();

      if (dates.length === 0) {
        if (format === 'text') console.log('❌ No commits found for this author in the specified period.\n');
        outputData.author = author;
        outputData.commitsByDate = {};
      } else {
        outputData.author = author;
        outputData.commitsByDate = commitsByDateAndRepo;
        outputData.rebaseSummariesByDate = rebaseSummariesByDate;
        outputData.repos = [...new Set(Object.values(commitsByDateAndRepo).flatMap(dateData => Object.keys(dateData)))];

        if (format === 'text') console.log(formatAsText(outputData, DAY_NAMES, terminalCaps, process.cwd()));
        else if (format === 'json') console.log(formatAsJSON(outputData));
        else if (format === 'markdown') console.log(formatAsMarkdown(outputData, DAY_NAMES));
      }
    }
    else {
      const lastCommitDatesPromises = repos.map(repo => getLastCommitDate(repo));
      const lastCommitDates = await Promise.all(lastCommitDatesPromises);

      let allUserResults = [];
      if (projectMode && !shortMode && author) {
        const userCommitsPromises = repos.map(repo => getUserCommits(repo, author, dateRange.sinceStr, dateRange.untilStr));
        allUserResults = await Promise.all(userCommitsPromises);
      }

      outputData.repos = repos.map((repo, i) => {
        const lastCommit = lastCommitDates[i];
        const lastCommitDate = lastCommit.authorDate || lastCommit.commitDate;
        return {
          path: repo,
          lastCommitDate: formatDate(lastCommitDate),
          daysAgo: Math.floor((Date.now() - lastCommitDate.getTime()) / MS_PER_DAY),
          commits: projectMode && !shortMode && author ? allUserResults[i].commits : []
        };
      });

      if (format === 'text') console.log(formatAsText(outputData, DAY_NAMES, terminalCaps, process.cwd()));
      else if (format === 'json') console.log(formatAsJSON(outputData));
      else if (format === 'markdown') console.log(formatAsMarkdown(outputData, DAY_NAMES));
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
      const { days, path } = parseArguments(daysArg, pathArg);
      await main({ path, days, ...options });
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
