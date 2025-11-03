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
git-did [days] [path]
# or via git:
git did [days] [path]
```

Show git activity for the last `[days]` days in `[path]` (default: 7 days, current directory).

```bash
# Current directory, last 7 days
git-did

# 14 days in current directory
git-did 14

# Specific path (default 7 days)
git-did ~/projects

# Specific path and timeframe
git-did 14 ~/projects

# Project mode (group by repository)
git-did --project 3 ~/projects

# Output formats: text (default), json, markdown
git-did --format json 7 ~/projects > report.json

# Date ranges
git-did --since 2025-10-25 --until 2025-10-31 ~/projects

# Works great with xargs
find ~/projects -type d -name ".git" -exec dirname {} \; | xargs -I {} git-did 30 {}
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
git-did --author john@example.com 7 ~/projects

# Short mode (overview only)
git-did --short 7 ~/projects

# Combined modes
git-did -ps 14 ~/projects
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
