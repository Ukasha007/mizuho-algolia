import logger from '../core/logger.js';
import { createApiResponse } from '../core/helpers.js';

/**
 * Authentication middleware for protecting admin endpoints
 */
class AuthenticationService {
  constructor() {
    this.logger = logger.setContext('Auth');
    this.apiSecret = process.env.API_SECRET_KEY;
    this.allowedOrigins = this.parseAllowedOrigins();
  }

  parseAllowedOrigins() {
    const origins = process.env.ALLOWED_ORIGINS || 'https://www.mizuhogroup.com';
    return origins.split(',').map(o => o.trim());
  }

  /**
   * Verify API key authentication
   * Supports multiple authentication methods:
   * 1. Authorization: Bearer <token>
   * 2. x-api-key: <token>
   * 3. x-vercel-cron: 1 (for Vercel cron jobs)
   */
  verifyApiKey(req) {
    // Allow Vercel cron jobs (check both header and user-agent)
    const isVercelCron = req.headers['x-vercel-cron'] ||
                         (req.headers['user-agent'] && req.headers['user-agent'].includes('vercel-cron'));

    if (isVercelCron) {
      return { authenticated: true, method: 'vercel-cron' };
    }

    // Check Authorization header (Bearer token)
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (this.isValidToken(token)) {
        return { authenticated: true, method: 'bearer-token' };
      }
    }

    // Check x-api-key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && this.isValidToken(apiKeyHeader)) {
      return { authenticated: true, method: 'api-key-header' };
    }

    this.logger.warn('Authentication failed - no valid credentials provided', {
      hasAuthHeader: !!authHeader,
      hasApiKeyHeader: !!apiKeyHeader,
      hasVercelCron: !!req.headers['x-vercel-cron'],
      userAgent: req.headers['user-agent']
    });

    return { authenticated: false, method: null };
  }

  /**
   * Validate token against configured secret
   */
  isValidToken(token) {
    if (!token || typeof token !== 'string') {
      return false;
    }

    if (!this.apiSecret) {
      this.logger.error('API_SECRET_KEY not configured - authentication disabled!');
      // In development, allow requests if no secret is set (with warning)
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn('Development mode: allowing unauthenticated request');
        return true;
      }
      return false;
    }

    // Constant-time comparison to prevent timing attacks
    return this.constantTimeCompare(token, this.apiSecret);
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  constantTimeCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Verify CORS origin
   */
  isAllowedOrigin(origin) {
    if (!origin) {
      return false;
    }

    // In development, allow localhost
    if (process.env.NODE_ENV === 'development') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return true;
      }
    }

    return this.allowedOrigins.some(allowed => {
      if (allowed === '*') {
        this.logger.warn('Wildcard CORS origin detected - not recommended for production');
        return true;
      }
      return origin === allowed;
    });
  }

  /**
   * Middleware to require authentication
   * Usage: const auth = authService.requireAuth(req, res);
   *        if (!auth.authenticated) return auth.response;
   */
  requireAuth(req, res) {
    const result = this.verifyApiKey(req);

    if (!result.authenticated) {
      const response = createApiResponse(
        false,
        {},
        'Unauthorized - Valid API key required. Provide API key via Authorization header (Bearer token) or x-api-key header.',
        401
      );

      this.logger.warn('Unauthorized access attempt', {
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
        method: req.method,
        url: req.url
      });

      return {
        authenticated: false,
        response: res.status(401).json(response.body)
      };
    }

    return {
      authenticated: true,
      method: result.method
    };
  }

  /**
   * Rate limiting check (basic implementation)
   * For production, consider using @upstash/ratelimit or similar
   */
  checkRateLimit(identifier, limit = 100, windowMs = 60000) {
    // This is a simple in-memory rate limiter
    // For production across multiple instances, use Redis/Upstash
    if (!this.rateLimitStore) {
      this.rateLimitStore = new Map();
    }

    const now = Date.now();
    const key = `${identifier}`;
    const record = this.rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };

    // Reset if window expired
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + windowMs;
    }

    record.count++;
    this.rateLimitStore.set(key, record);

    const isAllowed = record.count <= limit;
    const remaining = Math.max(0, limit - record.count);

    if (!isAllowed) {
      this.logger.warn('Rate limit exceeded', {
        identifier,
        count: record.count,
        limit
      });
    }

    return {
      allowed: isAllowed,
      limit,
      remaining,
      resetTime: record.resetTime
    };
  }

  /**
   * Clean up old rate limit records (call periodically)
   */
  cleanupRateLimitStore() {
    if (!this.rateLimitStore) return;

    const now = Date.now();
    for (const [key, record] of this.rateLimitStore.entries()) {
      if (now > record.resetTime + 60000) { // 1 minute after reset
        this.rateLimitStore.delete(key);
      }
    }
  }
}

// Singleton instance
const authService = new AuthenticationService();

// Export both the service and a simple middleware function
export default authService;

/**
 * Simple middleware function for easy use in API handlers
 * Usage:
 * const authCheck = requireAuth(req, res);
 * if (!authCheck.authenticated) return authCheck.response;
 */
export function requireAuth(req, res) {
  return authService.requireAuth(req, res);
}

/**
 * CORS validation middleware
 */
export function validateCORS(req, res) {
  const origin = req.headers['origin'];

  if (origin && !authService.isAllowedOrigin(origin)) {
    logger.warn('CORS validation failed', { origin });
    const response = createApiResponse(
      false,
      {},
      'Origin not allowed',
      403
    );
    return {
      allowed: false,
      response: res.status(403).json(response.body)
    };
  }

  return { allowed: true };
}
