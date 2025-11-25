const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const COLORS = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

class Logger {
  constructor() {
    this.level = this.parseLogLevel(process.env.LOG_LEVEL || 'info');
    this.context = '';
    this.sensitiveKeys = [
      'authorization', 'auth', 'token', 'apikey', 'api_key', 'api-key',
      'password', 'secret', 'bearer', 'webflow_api_token', 'algolia_api_key'
    ];
  }

  parseLogLevel(level) {
    const upperLevel = level.toUpperCase();
    return LOG_LEVELS[upperLevel] ?? LOG_LEVELS.INFO;
  }

  setContext(context) {
    this.context = context;
    return this;
  }

  /**
   * SECURITY: Sanitize sensitive data before logging
   */
  sanitizeData(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = Array.isArray(data) ? [...data] : { ...data };

    for (const [key, value] of Object.entries(sanitized)) {
      const lowerKey = key.toLowerCase();

      // Check if key contains sensitive terms
      if (this.sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeData(value);
      } else if (typeof value === 'string' && value.length > 100) {
        // Truncate very long strings (may contain tokens)
        const maybeSensitive = this.sensitiveKeys.some(sk =>
          value.toLowerCase().includes(sk)
        );
        if (maybeSensitive) {
          sanitized[key] = '[REDACTED - Long string contains sensitive pattern]';
        }
      }
    }

    return sanitized;
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const contextStr = this.context ? ` [${this.context}]` : '';

    // SECURITY: Sanitize data before stringifying
    const sanitizedData = data ? this.sanitizeData(data) : null;
    const dataStr = sanitizedData ? ` ${JSON.stringify(sanitizedData)}` : '';

    return `${timestamp} [${level}]${contextStr} ${message}${dataStr}`;
  }

  shouldLog(level) {
    return LOG_LEVELS[level] <= this.level;
  }

  error(message, data = null) {
    if (this.shouldLog('ERROR')) {
      const formatted = this.formatMessage('ERROR', message, data);
      console.error(`${COLORS.red}${formatted}${COLORS.reset}`);
    }
    return this;
  }

  warn(message, data = null) {
    if (this.shouldLog('WARN')) {
      const formatted = this.formatMessage('WARN', message, data);
      console.warn(`${COLORS.yellow}${formatted}${COLORS.reset}`);
    }
    return this;
  }

  info(message, data = null) {
    if (this.shouldLog('INFO')) {
      const formatted = this.formatMessage('INFO', message, data);
      console.log(`${COLORS.cyan}${formatted}${COLORS.reset}`);
    }
    return this;
  }

  success(message, data = null) {
    if (this.shouldLog('INFO')) {
      const formatted = this.formatMessage('SUCCESS', message, data);
      console.log(`${COLORS.green}${formatted}${COLORS.reset}`);
    }
    return this;
  }

  step(message, data = null) {
    if (this.shouldLog('INFO')) {
      const formatted = this.formatMessage('STEP', message, data);
      console.log(`${COLORS.magenta}${COLORS.bold}${formatted}${COLORS.reset}`);
    }
    return this;
  }

  debug(message, data = null) {
    if (this.shouldLog('DEBUG')) {
      const formatted = this.formatMessage('DEBUG', message, data);
      console.log(`${COLORS.blue}${formatted}${COLORS.reset}`);
    }
    return this;
  }
}

export default new Logger();