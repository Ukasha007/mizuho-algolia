import { z } from 'zod';
import dotenv from 'dotenv';
import logger from './logger.js';

// Ensure environment variables are loaded
dotenv.config({ path: '.env' });

const ConfigSchema = z.object({
  webflow: z.object({
    apiToken: z.string().min(1, 'Webflow API token is required'),
    siteId: z.string().min(1, 'Webflow site ID is required')
  }),
  algolia: z.object({
    appId: z.string().optional(),
    apiKey: z.string().optional(),
    indexName: z.string().default('mizuho_content')
  }),
  sync: z.object({
    batchSize: z.number().int().positive().default(100),
    maxRetries: z.number().int().positive().default(3),
    rateLimitDelay: z.number().int().positive().default(1000),
    staticPagesBatchSize: z.number().int().positive().default(10),
    staticPagesMaxConcurrent: z.number().int().positive().default(6),
    fetchAllLocales: z.boolean().default(true),
    rateLimitSafetyBuffer: z.number().min(0).max(1).default(0.05),
    interRequestDelay: z.number().int().min(0).default(50)
  }),
  environment: z.enum(['development', 'staging', 'production']).default('development')
});

class Config {
  constructor() {
    this.config = null;
    this.load();
  }

  load() {
    try {
      logger.debug('Loading environment variables', {
        webflowToken: process.env.WEBFLOW_API_TOKEN ? 'present' : 'missing',
        webflowSiteId: process.env.WEBFLOW_SITE_ID ? 'present' : 'missing'
      });
      
      const rawConfig = {
        webflow: {
          apiToken: process.env.WEBFLOW_API_TOKEN,
          siteId: process.env.WEBFLOW_SITE_ID
        },
        algolia: {
          appId: process.env.ALGOLIA_APP_ID || undefined,
          apiKey: process.env.ALGOLIA_API_KEY || undefined,
          indexName: process.env.ALGOLIA_INDEX_NAME || 'mizuho_content'
        },
        sync: {
          batchSize: parseInt(process.env.SYNC_BATCH_SIZE) || 100,
          maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
          rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY) || 1000,
          staticPagesBatchSize: parseInt(process.env.STATIC_PAGES_BATCH_SIZE) || 10,
          staticPagesMaxConcurrent: parseInt(process.env.STATIC_PAGES_MAX_CONCURRENT) || 6,
          fetchAllLocales: process.env.FETCH_ALL_LOCALES !== 'false',
          rateLimitSafetyBuffer: parseFloat(process.env.RATE_LIMIT_SAFETY_BUFFER) || 0.05,
          interRequestDelay: parseInt(process.env.INTER_REQUEST_DELAY) || 50
        },
        environment: process.env.NODE_ENV || 'development'
      };

      this.config = ConfigSchema.parse(rawConfig);
      logger.info('Configuration loaded successfully');
    } catch (error) {
      if (error instanceof z.ZodError) {
        const missingFields = error.errors.map(err => err.path.join('.')).join(', ');
        logger.error(`Configuration validation failed. Missing or invalid fields: ${missingFields}`);
        throw new Error(`Configuration validation failed: ${missingFields}`);
      }
      logger.error('Failed to load configuration', { error: error.message });
      throw error;
    }
  }

  get(path) {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return undefined;
      }
      value = value[key];
    }
    
    return value;
  }

  getWebflowConfig() {
    return this.get('webflow');
  }

  getAlgoliaConfig() {
    return this.get('algolia');
  }

  getSyncConfig() {
    return this.get('sync');
  }


  isDevelopment() {
    return this.get('environment') === 'development';
  }

  isProduction() {
    return this.get('environment') === 'production';
  }
}

export default new Config();