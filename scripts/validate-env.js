import dotenv from 'dotenv';

// Load environment variables FIRST before importing anything else
dotenv.config({ path: '.env' });

import logger from '../lib/core/logger.js';
import { getConfiguredCollections } from '../lib/constants/collections.js';

const envLogger = logger.setContext('EnvValidation');

function validateEnvironment() {
  envLogger.step('Validating environment configuration');

  const config = {
    webflow: {
      token: process.env.WEBFLOW_API_TOKEN,
      siteId: process.env.WEBFLOW_SITE_ID
    },
    algolia: {
      appId: process.env.ALGOLIA_APP_ID,
      apiKey: process.env.ALGOLIA_API_KEY,
      indexName: process.env.ALGOLIA_INDEX_NAME || 'mizuho_content'
    }
  };

  const issues = [];
  const warnings = [];

  // Check required Webflow config
  if (!config.webflow.token) {
    issues.push('Missing WEBFLOW_API_TOKEN');
  } else {
    envLogger.success('✓ Webflow API token configured');
  }

  if (!config.webflow.siteId) {
    issues.push('Missing WEBFLOW_SITE_ID');
  } else {
    envLogger.success('✓ Webflow site ID configured');
  }

  // Check optional Algolia config
  if (!config.algolia.appId || !config.algolia.apiKey) {
    warnings.push('Algolia credentials not configured - data sync will be disabled');
    envLogger.warn('⚠️  Algolia not configured (this is OK for initial testing)');
  } else {
    envLogger.success('✓ Algolia credentials configured');
  }

  // Check CMS collections
  const configuredCollections = getConfiguredCollections();
  envLogger.info(`📋 CMS Collections configured: ${configuredCollections.length}/9`);
  
  if (configuredCollections.length === 0) {
    warnings.push('No CMS collections configured - only static pages will be processed');
  } else {
    configuredCollections.forEach(collection => {
      envLogger.success(`✓ ${collection.name} (${collection.region})`);
    });
  }

  // Summary
  if (issues.length > 0) {
    envLogger.error('❌ Environment validation failed', { issues });
    return false;
  }

  if (warnings.length > 0) {
    envLogger.warn('⚠️  Environment warnings', { warnings });
  }

  envLogger.success('✅ Environment validation passed');
  envLogger.info('Next steps:', {
    ready: 'You can now run: npm run test-fetch',
    collections: `${configuredCollections.length} collections will be processed`,
    algolia: config.algolia.appId ? 'Algolia ready for sync' : 'Algolia disabled (test mode)'
  });

  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const isValid = validateEnvironment();
  process.exit(isValid ? 0 : 1);
}