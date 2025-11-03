# git-did - Git Activity Tracker

Git activity tracker for standup meetings and project monitoring.

## Installation

```bash
npm install --global git-did
```

Or install from GitHub sources:

```bash
npm install --global https://github.com/mabhub/git-did
```

## Usage

```bash
git-did [path] [days]
# or via git:
git did [path] [days]
```

Show git activity in `[path]` for the last `[days]` days (default: current directory, 7 days).

```bash
# Current directory, last 7 days
git-did

# Specific path and timeframe
git-did ~/projects 14

# Project mode (group by repository)
git-did --project ~/projects 3

# Output formats: text (default), json, markdown
git-did --format json ~/projects 7 > report.json

# Date ranges
git-did --since 2025-10-25 --until 2025-10-31 ~/projects
```

Use `git-did --help` for all available options.

## Configuration

Configure default behaviors using `git config`:

```bash
# Examples (global configuration)
git config --global did.defaultDays 14
git config --global did.defaultMode project
git config --global did.colors always
git config --global did.defaultFormat markdown
git config --global did.defaultAuthor "user@example.com"
```

Available configuration keys: `did.defaultDays`, `did.defaultMode`, `did.colors`, `did.defaultFormat`, `did.defaultAuthor`.

CLI arguments always override configuration values.

## More Examples

```bash
# Filter by author
git-did --author john@example.com ~/projects

# Short mode (overview only)
git-did --short ~/projects 7

# Combined modes
git-did -ps ~/projects 14
```

## Features

- Recursive Git repository discovery
- Multiple display modes (default, project, short)
- Author-based commit filtering
- Configurable time period
- Git config integration for persistent preferences
- Symbolic link loop detection
- Permission error handling
- `.didignore` file support for path exclusion
- Execution time tracking
- Multiple output formats (text, JSON, Markdown)
- Parallel Git operations for improved performance
- Smart color detection with 24-bit true color support
- Time-of-day color coding for commit timestamps
- Flexible date range selection (days or exact dates)
