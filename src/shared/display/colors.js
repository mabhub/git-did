/**
 * ANSI color utilities for terminal output
 * @module colors
 */

/**
 * ANSI color codes
 */
export const ANSI = {
  reset: '\x1b[0m',
  // Basic colors (work on all terminals)
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  // 256 colors
  color256: (code) => `\x1b[38;5;${code}m`,
  // True color (RGB)
  rgb: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`
};

/**
 * Detect terminal color capabilities
 * @returns {Object} Terminal capabilities
 */
export const detectTerminalCapabilities = () => {
  const { COLORTERM, TERM, NO_COLOR, FORCE_COLOR } = process.env;

  // Check if color is explicitly disabled or forced
  if (NO_COLOR !== undefined) return { colors: false, truecolor: false };
  if (FORCE_COLOR !== undefined) return { colors: true, truecolor: COLORTERM === 'truecolor' };

  // Check if stdout is a TTY (interactive terminal)
  const isTTY = process.stdout.isTTY;

  // Check for truecolor support
  const truecolor = COLORTERM === 'truecolor' || COLORTERM === '24bit';

  // Check for 256 color support
  const colors256 = TERM && (TERM.includes('256') || TERM.includes('xterm'));

  return {
    colors: isTTY,
    truecolor,
    colors256,
    basic: isTTY && !colors256 && !truecolor
  };
};

/**
 * Get color for commit hash
 * @param {Object} caps - Terminal capabilities
 * @returns {string} Color code
 */
export const getHashColor = (caps) => {
  if (!caps.colors) return '';
  if (caps.truecolor) return ANSI.rgb(135, 206, 250); // Light sky blue
  if (caps.colors256) return ANSI.color256(117); // Sky blue
  return ANSI.cyan;
};

/**
 * Get color for commit message
 * @param {Object} caps - Terminal capabilities
 * @returns {string} Color code
 */
export const getMessageColor = (caps) => {
  if (!caps.colors) return '';
  // Neutral color that works on both dark and light backgrounds
  if (caps.truecolor) return ANSI.rgb(180, 180, 180); // Medium gray
  if (caps.colors256) return ANSI.color256(250); // Light gray
  return ANSI.gray;
};

/**
 * Get color for time based on time of day
 * @param {string} time - Time in HH:MM format
 * @param {Object} caps - Terminal capabilities
 * @returns {string} Color code
 */
export const getTimeColor = (time, caps) => {
  if (!caps.colors) return '';

  const [hours] = time.split(':').map(Number);

  // Morning (6-12): Yellow/Gold tones
  if (hours >= 6 && hours < 12) {
    if (caps.truecolor) return ANSI.rgb(255, 215, 0); // Gold
    if (caps.colors256) return ANSI.color256(220); // Gold
    return ANSI.yellow;
  }

  // Afternoon (12-18): Green tones
  if (hours >= 12 && hours < 18) {
    if (caps.truecolor) return ANSI.rgb(144, 238, 144); // Light green
    if (caps.colors256) return ANSI.color256(120); // Light green
    return ANSI.green;
  }

  // Evening (18-22): Orange/Magenta tones
  if (hours >= 18 && hours < 22) {
    if (caps.truecolor) return ANSI.rgb(255, 165, 100); // Light orange
    if (caps.colors256) return ANSI.color256(215); // Orange
    return ANSI.yellow;
  }

  // Night (22-6): Blue/Purple tones
  if (caps.truecolor) return ANSI.rgb(147, 112, 219); // Medium purple
  if (caps.colors256) return ANSI.color256(141); // Purple
  return ANSI.magenta;
};

/**
 * Get color for days ago based on commit recency
 * @param {number} daysAgo - Number of days since last commit
 * @param {Object} caps - Terminal capabilities
 * @returns {string} Color code
 */
export const getDaysAgoColor = (daysAgo, caps) => {
  if (!caps.colors) return '';

  // Very recent (0-1 days): Bright green
  if (daysAgo <= 1) {
    if (caps.truecolor) return ANSI.rgb(50, 255, 50); // Bright green
    if (caps.colors256) return ANSI.color256(46); // Bright green
    return ANSI.green;
  }

  // Recent (2-7 days): Light green
  if (daysAgo <= 7) {
    if (caps.truecolor) return ANSI.rgb(144, 238, 144); // Light green
    if (caps.colors256) return ANSI.color256(120); // Light green
    return ANSI.green;
  }

  // Moderate (8-14 days): Yellow/Gold
  if (daysAgo <= 14) {
    if (caps.truecolor) return ANSI.rgb(255, 215, 0); // Gold
    if (caps.colors256) return ANSI.color256(220); // Gold
    return ANSI.yellow;
  }

  // Old (15-30 days): Orange
  if (daysAgo <= 30) {
    if (caps.truecolor) return ANSI.rgb(255, 165, 0); // Orange
    if (caps.colors256) return ANSI.color256(214); // Orange
    return ANSI.yellow;
  }

  // Very old (>30 days): Red/Magenta
  if (caps.truecolor) return ANSI.rgb(255, 100, 100); // Light red
  if (caps.colors256) return ANSI.color256(203); // Light red
  return ANSI.magenta;
};

/**
 * Colorize text
 * @param {string} text - Text to colorize
 * @param {string} colorCode - ANSI color code
 * @param {Object} caps - Terminal capabilities
 * @returns {string} Colorized text
 */
export const colorize = (text, colorCode, caps) => {
  if (!caps.colors || !colorCode) return text;
  return `${colorCode}${text}${ANSI.reset}`;
};
