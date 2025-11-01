# git-did - Git Activity Tracker

Git activity tracker for standup meetings and project monitoring.

## Installation

```bash
npm install
```

For global installation:

```bash
npm link
```

## Usage

```bash
git-did [options] [path] [days]
```

### Arguments

- `path` - Starting path for repository search (default: current directory)
- `days` - Number of days to look back (default: 7)

### Options

- `-p, --project` - Enable project mode (group by project first, then by date)
- `-s, --short` - Short mode (only show last commit date without details)
- `-a, --author <email>` - Filter commits by author (email or partial name)
- `-f, --format <type>` - Output format: text (default), json, or markdown
- `--since <date>` - Start date for activity search (YYYY-MM-DD format)
- `--until <date>` - End date for activity search (YYYY-MM-DD format, default: today)
- `--color` - Force color output (even for non-TTY)
- `--no-color` - Disable color output
- `-h, --help` - Display help information
- `-V, --version` - Display version number

## Date Range Selection

By default, the tool searches for activity in the last N days (default: 7). You can also specify exact date ranges:

### Using days parameter (default)

```bash
git-did ~/projects 7        # Last 7 days
git-did ~/projects 14       # Last 14 days
```

### Using --since and --until options

```bash
# Activity since a specific date (until today)
git-did --since 2025-10-25 ~/projects

# Activity in a specific date range
git-did --since 2025-10-01 --until 2025-10-31 ~/projects

# Combine with other options
git-did --standup --since 2025-11-01 ~/projects
```

**Date format**: Dates must be in `YYYY-MM-DD` format (ISO 8601).

**Validation**:

- Invalid date formats will show an error message
- `--since` date must be before `--until` date
- `--until` defaults to today if not specified

## Display Modes

### Default Mode (chronological)

Groups commits by date, then by repository. Ideal for reviewing what was done each day.

```bash
git-did ~/projects 7
```

### Project Mode (`--project` or `-p`)

Groups commits by repository first, then by date. Perfect for preparing daily standups.

```bash
git-did --project ~/projects 3
# or short alias
git-did -p ~/projects 3
```

### Short Mode (`--short` or `-s`)

Lists repositories with only the last commit date, without detailed commit lists.

```bash
git-did --short ~/projects 7
# or short alias
git-did -s ~/projects 7
```

### Combined Modes

Combine `--project` and `--short` for a quick overview grouped by project:

```bash
git-did --project --short ~/projects 7
# or with aliases
git-did -ps ~/projects 7
```

## Export Formats

### JSON Format

Export results as structured JSON for integration with other tools or automation.

```bash
git-did ~/projects 7 --format json > report.json
```

### Markdown Format

Generate Markdown reports for documentation or sharing.

```bash
git-did --standup ~/projects 7 --format markdown > STANDUP.md
```

### Text Format (default)

Human-readable console output with colors and emojis.

```bash
git-did ~/projects 7
# or explicitly:
git-did ~/projects 7 --format text
```

#### Color Support

The text format automatically detects terminal capabilities and applies colors:

- **Interactive terminals**: Colors enabled by default
- **Non-TTY (piped/redirected)**: Colors disabled by default
- **True color (24-bit)**: Full RGB color palette when supported
- **256 colors**: Extended color palette for xterm-256color terminals
- **Basic colors**: ANSI colors for standard terminals

Color scheme:

- **Commit hashes**: Cyan/Sky blue (visible on both dark and light backgrounds)
- **Commit messages**: Medium gray (neutral, works on all backgrounds)
- **Times**: Color-coded by time of day
  - Morning (6-12h): Gold/Yellow
  - Afternoon (12-18h): Green
  - Evening (18-22h): Orange
  - Night (22-6h): Purple/Magenta

Force or disable colors:

```bash
# Force colors even when piping
git-did ~/projects 7 --color | less -R

# Disable colors
git-did ~/projects 7 --no-color
```

## .didignore File

You can exclude specific directories from the search by creating a `.didignore` file in the search root directory. The syntax is similar to `.gitignore`.

### Example .didignore

```
# Ignore node_modules in any directory
node_modules/

# Ignore all directories starting with "test"
test*/

# Ignore specific directories from root
/tmp/
/cache/

# Ignore directories containing "vendor"
*vendor*/

# Ignore build directories
build/
dist/
```

### Pattern Rules

- Lines starting with `#` are comments
- Empty lines are ignored
- Patterns ending with `/` match directories only
- Patterns starting with `/` are relative to the search root
- Use `*` as wildcard for any characters
- Use `?` as wildcard for a single character

## Examples

```bash
# Find all active repos in current directory (last 7 days) - chronological view
git-did

# Find active repos in specific directory (last 14 days)
git-did ~/projects 14

# Project mode for last 3 days (grouped by project)
git-did --project ~/projects 3

# Short mode - quick overview
git-did --short ~/projects 7

# Chronological view with specific author (default mode)
git-did --author john@example.com ~/projects 7

# Export to JSON for processing
git-did ~/projects 14 --format json | jq '.repos | length'

# Generate Markdown report in project mode
git-did --project ~/projects 3 --format markdown > weekly-standup.md

# Activity for a specific date range
git-did --since 2025-10-01 --until 2025-10-31 ~/projects

# Combine date range with project mode
git-did --project --since 2025-10-25 ~/projects

# Quick project overview (project + short modes)
git-did -ps ~/projects 14
```

## Features

- Recursive Git repository discovery
- Multiple display modes (standard, standup, chronological)
- Author-based commit filtering
- Configurable time period
- Symbolic link loop detection
- Permission error handling
- `.didignore` file support for path exclusion
- Execution time tracking
- Multiple output formats (text, JSON, Markdown)
- Parallel Git operations for improved performance
- Smart color detection with 24-bit true color support
- Time-of-day color coding for commit timestamps
- Flexible date range selection (days or exact dates)

## Technical Details

- Built with Node.js ES modules
- Uses native Node.js APIs (fs/promises, child_process)
- Secure command execution with execFile
- Pure functional approach
- Comprehensive error handling
