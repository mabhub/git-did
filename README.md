# Standup - Git Activity Tracker

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
standup [options] [path] [days]
```

### Arguments

- `path` - Starting path for repository search (default: current directory)
- `days` - Number of days to look back (default: 7)

### Options

- `-s, --standup` - Enable standup mode (group commits by repository)
- `-c, --chrono` - Enable chronological mode (group commits by date)
- `-a, --author <email>` - Filter commits by author (email or partial name)
- `-f, --format <type>` - Output format: text (default), json, or markdown
- `--color` - Force color output (even for non-TTY)
- `--no-color` - Disable color output
- `-h, --help` - Display help information
- `-V, --version` - Display version number

## Display Modes

### Standard Mode (default)

Lists all active Git repositories with their last commit date.

```bash
standup ~/projects 7
```

### Standup Mode

Groups commits by repository, then by date. Perfect for preparing daily standups.

```bash
standup --standup ~/projects 3
```

### Chronological Mode

Groups commits by date, then by repository. Ideal for reviewing what was done each day.

```bash
standup --chrono ~/projects 7
```

## Export Formats

### JSON Format

Export results as structured JSON for integration with other tools or automation.

```bash
standup ~/projects 7 --format json > report.json
```

### Markdown Format

Generate Markdown reports for documentation or sharing.

```bash
standup --standup ~/projects 7 --format markdown > STANDUP.md
```

### Text Format (default)

Human-readable console output with colors and emojis.

```bash
standup ~/projects 7
# or explicitly:
standup ~/projects 7 --format text
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
standup ~/projects 7 --color | less -R

# Disable colors
standup ~/projects 7 --no-color
```

## .standupignore File

You can exclude specific directories from the search by creating a `.standupignore` file in the search root directory. The syntax is similar to `.gitignore`.

### Example .standupignore

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
# Find all active repos in current directory (last 7 days)
standup

# Find active repos in specific directory (last 14 days)
standup ~/projects 14

# Standup mode for last 3 days
standup --standup ~/projects 3

# Chronological view with specific author
standup --chrono --author john@example.com ~/projects 7

# Export to JSON for processing
standup ~/projects 14 --format json | jq '.repos | length'

# Generate Markdown report
standup --standup ~/projects 3 --format markdown > weekly-standup.md
```

## Features

- Recursive Git repository discovery
- Multiple display modes (standard, standup, chronological)
- Author-based commit filtering
- Configurable time period
- Symbolic link loop detection
- Permission error handling
- `.standupignore` file support for path exclusion
- Execution time tracking
- Multiple output formats (text, JSON, Markdown)
- Parallel Git operations for improved performance
- Smart color detection with 24-bit true color support
- Time-of-day color coding for commit timestamps

## Technical Details

- Built with Node.js ES modules
- Uses native Node.js APIs (fs/promises, child_process)
- Secure command execution with execFile
- Pure functional approach
- Comprehensive error handling
