import { z } from 'zod';
import logger from '../core/logger.js';

/**
 * Input validation service to prevent injection attacks
 * and ensure data integrity
 */
class InputValidator {
  constructor() {
    this.logger = logger.setContext('InputValidator');

    // Define valid values for enums
    this.validRegions = [
      'worldwide',
      'japan',
      'asia-pacific',
      'americas',
      'europe-middle-east-africa',
      'mizuho-bank',
      'mizuho-trust-banking',
      'mizuho-securities',
      'mizuho-research-technologies'
    ];

    this.validContentTypes = [
      'page',
      'article',
      'news',
      'event',
      'insight',
      'person',
      'award',
      'announcement',
      'release',
      'service',
      'information',
      'card'
    ];

    // Zod schemas for validation
    this.schemas = {
      searchQuery: z.object({
        q: z.string()
          .min(1, 'Query must not be empty')
          .max(200, 'Query too long (max 200 characters)')
          .regex(/^[a-zA-Z0-9\s\-_.,;:'"&()\[\]!?]+$/, 'Query contains invalid characters'),
        page: z.coerce.number()
          .int()
          .min(0, 'Page must be non-negative')
          .max(1000, 'Page number too large')
          .optional()
          .default(0),
        region: z.string()
          .optional()
          .nullable()
          .refine(
            val => !val || this.validRegions.includes(val.toLowerCase()),
            { message: 'Invalid region' }
          ),
        hitsPerPage: z.coerce.number()
          .int()
          .min(1, 'Hits per page must be at least 1')
          .max(100, 'Hits per page cannot exceed 100')
          .optional()
          .default(20),
        type: z.string()
          .optional()
          .nullable()
          .refine(
            val => !val || this.validContentTypes.includes(val.toLowerCase()),
            { message: 'Invalid content type' }
          )
      }),

      syncRequest: z.object({
        region: z.string()
          .optional()
          .nullable()
          .refine(
            val => !val || this.validRegions.includes(val.toLowerCase()),
            { message: 'Invalid region' }
          ),
        dryRun: z.preprocess(
          val => {
            if (val === undefined || val === null) return undefined;
            return val === 'true' || val === true;
          },
          z.boolean().optional().default(false)
        ),
        collectionId: z.string()
          .optional()
          .nullable()
          .refine(
            val => !val || /^[a-zA-Z0-9_-]+$/.test(val),
            { message: 'Invalid collection ID format' }
          ),
        includeStatic: z.preprocess(
          val => {
            if (val === undefined || val === null) return undefined;
            return val === 'true' || val === true;
          },
          z.boolean().optional().default(true)
        ),
        includeCMS: z.preprocess(
          val => {
            if (val === undefined || val === null) return undefined;
            return val === 'true' || val === true;
          },
          z.boolean().optional().default(true)
        ),
        clearIndex: z.preprocess(
          val => {
            if (val === undefined || val === null) return undefined;
            return val === 'true' || val === true;
          },
          z.boolean().optional().default(false)
        )
      })
    };
  }

  /**
   * Validate search query parameters
   */
  validateSearchQuery(params) {
    try {
      const validated = this.schemas.searchQuery.parse(params);

      this.logger.debug('Search query validated', {
        query: validated.q,
        page: validated.page,
        region: validated.region
      });

      return {
        success: true,
        data: validated
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));

        this.logger.warn('Search query validation failed', { errors });

        return {
          success: false,
          errors,
          message: errors.map(e => `${e.field}: ${e.message}`).join(', ')
        };
      }

      this.logger.error('Unexpected validation error', { error: error.message });
      return {
        success: false,
        message: 'Validation error occurred'
      };
    }
  }

  /**
   * Validate sync request body
   */
  validateSyncRequest(body) {
    try {
      const validated = this.schemas.syncRequest.parse(body || {});

      this.logger.debug('Sync request validated', {
        region: validated.region,
        dryRun: validated.dryRun,
        clearIndex: validated.clearIndex
      });

      return {
        success: true,
        data: validated
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));

        this.logger.warn('Sync request validation failed', { errors });

        return {
          success: false,
          errors,
          message: errors.map(e => `${e.field}: ${e.message}`).join(', ')
        };
      }

      this.logger.error('Unexpected validation error', { error: error.message });
      return {
        success: false,
        message: 'Validation error occurred'
      };
    }
  }

  /**
   * Sanitize string to prevent injection attacks
   */
  sanitizeString(str) {
    if (typeof str !== 'string') {
      return '';
    }

    // Remove null bytes and control characters
    let sanitized = str.replace(/[\x00-\x1F\x7F]/g, '');

    // Trim whitespace
    sanitized = sanitized.trim();

    // Limit length
    if (sanitized.length > 1000) {
      sanitized = sanitized.substring(0, 1000);
      this.logger.warn('String truncated to 1000 characters');
    }

    return sanitized;
  }

  /**
   * Validate and sanitize region parameter
   */
  validateRegion(region) {
    if (!region) {
      return { valid: true, value: null };
    }

    const normalized = region.toLowerCase().trim();

    if (!this.validRegions.includes(normalized)) {
      this.logger.warn('Invalid region provided', { region });
      return {
        valid: false,
        error: `Invalid region. Must be one of: ${this.validRegions.join(', ')}`
      };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate content type parameter
   */
  validateContentType(type) {
    if (!type) {
      return { valid: true, value: null };
    }

    const normalized = type.toLowerCase().trim();

    if (!this.validContentTypes.includes(normalized)) {
      this.logger.warn('Invalid content type provided', { type });
      return {
        valid: false,
        error: `Invalid type. Must be one of: ${this.validContentTypes.join(', ')}`
      };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Build safe Algolia filters
   * Prevents filter injection attacks
   */
  buildSafeFilters(params) {
    const filters = [];

    // Validate and add region filter
    if (params.region) {
      const regionValidation = this.validateRegion(params.region);
      if (regionValidation.valid && regionValidation.value) {
        // Use attribute:value syntax (no quotes) to prevent injection
        filters.push(`region:${regionValidation.value}`);
      }
    }

    // Validate and add type filter
    if (params.type) {
      const typeValidation = this.validateContentType(params.type);
      if (typeValidation.valid && typeValidation.value) {
        filters.push(`type:${typeValidation.value}`);
      }
    }

    // Join with AND operator
    return filters.length > 0 ? filters.join(' AND ') : undefined;
  }

  /**
   * Validate pagination parameters
   */
  validatePagination(page, hitsPerPage) {
    const pageNum = parseInt(page) || 0;
    const hitsNum = parseInt(hitsPerPage) || 20;

    if (pageNum < 0 || pageNum > 1000) {
      return {
        valid: false,
        error: 'Page must be between 0 and 1000'
      };
    }

    if (hitsNum < 1 || hitsNum > 100) {
      return {
        valid: false,
        error: 'Hits per page must be between 1 and 100'
      };
    }

    return {
      valid: true,
      page: pageNum,
      hitsPerPage: hitsNum
    };
  }

  /**
   * Detect potentially malicious patterns
   */
  detectMaliciousPatterns(input) {
    if (typeof input !== 'string') {
      return { malicious: false };
    }

    const maliciousPatterns = [
      // SQL injection patterns
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
      // NoSQL injection patterns
      /(\$where|\$ne|\$gt|\$lt|\$regex)/i,
      // Script tags
      /<script[^>]*>.*?<\/script>/i,
      // Command injection
      /(;|\||&|`|\$\(|\$\{)/,
      // Path traversal
      /\.\.[\/\\]/,
      // Null bytes
      /\x00/
    ];

    for (const pattern of maliciousPatterns) {
      if (pattern.test(input)) {
        this.logger.warn('Malicious pattern detected', {
          pattern: pattern.toString(),
          input: input.substring(0, 100)
        });

        return {
          malicious: true,
          pattern: pattern.toString()
        };
      }
    }

    return { malicious: false };
  }

  /**
   * Comprehensive input validation
   */
  validateInput(input, type = 'string') {
    // Check for malicious patterns
    const maliciousCheck = this.detectMaliciousPatterns(input);
    if (maliciousCheck.malicious) {
      return {
        valid: false,
        error: 'Input contains potentially malicious content',
        pattern: maliciousCheck.pattern
      };
    }

    // Type-specific validation
    switch (type) {
      case 'string':
        return {
          valid: true,
          value: this.sanitizeString(input)
        };

      case 'number':
        const num = parseInt(input);
        if (isNaN(num)) {
          return { valid: false, error: 'Invalid number' };
        }
        return { valid: true, value: num };

      case 'boolean':
        return {
          valid: true,
          value: input === true || input === 'true'
        };

      default:
        return { valid: true, value: input };
    }
  }
}

// Singleton instance
const inputValidator = new InputValidator();

export default inputValidator;

// Export convenience functions
export const validateSearchQuery = (params) => inputValidator.validateSearchQuery(params);
export const validateSyncRequest = (body) => inputValidator.validateSyncRequest(body);
export const buildSafeFilters = (params) => inputValidator.buildSafeFilters(params);
