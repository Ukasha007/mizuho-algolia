import logger from '../core/logger.js';

class DataSanitizer {
  constructor() {
    this.logger = logger.setContext('DataSanitizer');
    
    // Patterns for sensitive data detection
    this.sensitivePatterns = [
      // API Keys and tokens
      /[a-z0-9]{32,}/gi, // Generic long alphanumeric strings (potential API keys)
      /bearer\s+[a-z0-9\-_.]+/gi,
      /token[:\s=]+[a-z0-9\-_.]+/gi,
      
      // Email addresses (might contain internal info)
      /\b[A-Za-z0-9._%+-]+@(?!mizuho|example|test)[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      
      // Potential internal URLs or IPs
      /\b(?:10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}\b/g,
      /\b(?:localhost|127\.0\.0\.1)\b/gi,
      
      // Potential database connection strings
      /mongodb:\/\/[^\\s]+/gi,
      /mysql:\/\/[^\\s]+/gi,
      /postgres:\/\/[^\\s]+/gi,
      
      // Potential file paths that might expose system info
      /[a-z]:\\\\[^\\s<>"|?*]+/gi,
      /\/(?:home|root|usr|var|etc)\/[^\\s<>"|?*]+/gi,
      
      // Credit card patterns (basic)
      /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
      
      // Social Security Numbers (US format)
      /\b\d{3}-\d{2}-\d{4}\b/g,
      
      // Phone numbers with potential international codes
      /\+\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g
    ];

    // Patterns for content that should be completely excluded
    this.excludePatterns = [
      /\[INTERNAL\]/gi,
      /\[CONFIDENTIAL\]/gi,
      /\[DO NOT PUBLISH\]/gi,
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi
    ];
  }

  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = { ...obj };
    
    // Check if object should be excluded entirely
    if (this.shouldExcludeObject(sanitized)) {
      this.logger.warn('Object excluded due to sensitive content', {
        objectID: sanitized.objectID,
        reason: 'Contains confidential markers'
      });
      return null;
    }
    
    // Sanitize all string fields
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'string' ? this.sanitizeString(item) : item
        ).filter(Boolean);
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      }
    }
    
    // Remove any fields that became empty after sanitization
    Object.keys(sanitized).forEach(key => {
      if (sanitized[key] === '' || sanitized[key] === null) {
        delete sanitized[key];
      }
    });
    
    return sanitized;
  }

  sanitizeString(str) {
    if (!str || typeof str !== 'string') return str;
    
    // Check for exclude patterns first
    for (const pattern of this.excludePatterns) {
      if (pattern.test(str)) {
        this.logger.warn('Content excluded due to sensitive pattern', {
          pattern: pattern.toString(),
          contentPreview: str.substring(0, 50) + '...'
        });
        return '[Content removed for security]';
      }
    }
    
    // Sanitize potential sensitive data
    let sanitized = str;
    
    for (const pattern of this.sensitivePatterns) {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
        this.logger.debug('Sensitive data redacted', {
          pattern: pattern.toString()
        });
      }
    }
    
    // Remove HTML that could be malicious
    sanitized = this.removeHtmlTags(sanitized);
    
    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    
    return sanitized;
  }

  shouldExcludeObject(obj) {
    const checkFields = ['title', 'content', 'summary', 'description'];
    
    for (const field of checkFields) {
      if (obj[field]) {
        for (const pattern of this.excludePatterns) {
          if (pattern.test(obj[field])) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  removeHtmlTags(str) {
    // Remove potentially dangerous HTML tags
    const dangerousTags = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^>]*>/gi,
      /<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi,
      /<input\b[^>]*>/gi,
      /<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi
    ];
    
    let cleaned = str;
    for (const tag of dangerousTags) {
      cleaned = cleaned.replace(tag, '');
    }
    
    // Remove HTML attributes that could be dangerous
    cleaned = cleaned.replace(/\s*(?:on\w+|javascript:|data:)\s*=\s*["'][^"']*["']/gi, '');
    
    return cleaned;
  }

  validateEnvironmentVariables() {
    const requiredVars = ['WEBFLOW_API_TOKEN', 'ALGOLIA_APP_ID', 'ALGOLIA_API_KEY'];
    const missing = [];
    
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    }
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    // Check for potentially exposed secrets in environment
    for (const [key, value] of Object.entries(process.env)) {
      if (key.includes('SECRET') || key.includes('TOKEN') || key.includes('KEY')) {
        if (!value || value.length < 10) {
          this.logger.warn(`Potentially weak ${key}`, { length: value?.length || 0 });
        }
      }
    }
    
    this.logger.info('Environment variables validated');
  }
}

export default new DataSanitizer();