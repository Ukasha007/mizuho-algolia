import logger from './logger.js';

export function validateRequiredEnvVars(requiredVars) {
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    const message = `Missing required environment variables: ${missingVars.join(', ')}`;
    logger.error(message);
    return { 
      success: false,
      message,
      missing: missingVars
    };
  }
  
  return { success: true };
}

export function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
}

export function normalizeUrl(url) {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    return urlObj.href;
  } catch {
    return url.startsWith('/') ? url : `/${url}`;
  }
}

export function extractTextFromHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createSlug(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getValueOrDefault(value, defaultValue) {
  return value !== undefined && value !== null && value !== '' ? value : defaultValue;
}

export function createApiResponse(success, data = {}, error = null, status = null) {
  const response = {
    success,
    timestamp: new Date().toISOString()
  };

  if (success) {
    return {
      status: status || 200,
      body: {
        ...response,
        ...data
      }
    };
  } else {
    return {
      status: status || 500,
      body: {
        ...response,
        error: error || 'Unknown error occurred'
      }
    };
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function isValidRegion(region) {
  const validRegions = [
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
  return validRegions.includes(region?.toLowerCase());
}

export function normalizeRegion(region) {
  if (!region) return 'worldwide';
  return region.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  return async function(...args) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, { error: error.message });
        await sleep(delay);
      }
    }

    throw lastError;
  };
}

export function isValidTitle(title) {
  // Return false if title is empty, null, or undefined
  if (!title || typeof title !== 'string') {
    return false;
  }

  const trimmedTitle = title.trim();

  // Check for minimum length
  if (trimmedTitle.length < 2) {
    return false;
  }

  // Detect Webflow field binding syntax patterns
  const invalidPatterns = [
    /\{\{wf\s+/i,                           // {{wf ...}}
    /\{&quot;path&quot;/i,                  // HTML-encoded {"path"...}
    /\{\\"path\\"/i,                        // JSON-encoded {\"path\"...}
    /\{&#34;path&#34;/i,                    // HTML entity encoded {"path"...}
    /%7B%22path%22/i,                       // URL-encoded {"path"...}
    /^\{\{.*\}\}$/,                         // Any {{...}} pattern
    /^\[\[.*\]\]$/,                         // Any [[...]] pattern
    /^undefined$/i,                         // Literal "undefined"
    /^null$/i,                              // Literal "null"
    /^\[object\s+Object\]$/i                // [object Object]
  ];

  // Check if title matches any invalid pattern
  for (const pattern of invalidPatterns) {
    if (pattern.test(trimmedTitle)) {
      logger.debug('Invalid title detected', {
        title: trimmedTitle.substring(0, 100),
        pattern: pattern.toString()
      });
      return false;
    }
  }

  // Check if title is only special characters (no letters or numbers)
  if (!/[a-zA-Z0-9]/.test(trimmedTitle)) {
    return false;
  }

  return true;
}

export function slugToTitle(slug) {
  // Handle special cases first
  if (slug === 'home' || slug === '') {
    return 'Home';
  }

  if (!slug || typeof slug !== 'string') {
    return 'Untitled';
  }

  // Remove leading/trailing slashes and split by slashes
  const parts = slug.replace(/^\/+|\/+$/g, '').split('/');

  // Take the last part of the path as the title
  const lastPart = parts[parts.length - 1];

  // Convert slug to title:
  // 1. Split by hyphens or underscores
  // 2. Capitalize first letter of each word
  // 3. Handle special cases (e.g., 'emea', 'usa', 'ceo')
  const title = lastPart
    .split(/[-_]/)
    .map(word => {
      // Convert to lowercase first
      const lowerWord = word.toLowerCase();

      // Special acronyms that should be uppercase
      const acronyms = ['emea', 'usa', 'uk', 'ceo', 'cfo', 'cto', 'roi', 'api', 'seo', 'faq', 'pdf'];
      if (acronyms.includes(lowerWord)) {
        return lowerWord.toUpperCase();
      }

      // Capitalize first letter
      return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
    })
    .join(' ');

  return title || 'Untitled';
}

export default {
  validateRequiredEnvVars,
  sanitizeString,
  normalizeUrl,
  extractTextFromHtml,
  createSlug,
  getValueOrDefault,
  createApiResponse,
  sleep,
  chunk,
  isValidRegion,
  normalizeRegion,
  formatBytes,
  retryWithBackoff,
  isValidTitle,
  slugToTitle
};