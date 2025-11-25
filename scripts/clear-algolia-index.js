#!/usr/bin/env node

/**
 * Clear all objects from Algolia index
 * WARNING: This will delete ALL records from the index!
 */

import algoliaClient from '../lib/algolia/client.js';
import logger from '../lib/core/logger.js';

const scriptLogger = logger.setContext('ClearAlgoliaIndex');

async function clearIndex() {
  try {
    console.log('⚠️  WARNING: This will DELETE ALL records from the Algolia index!');
    console.log('⚠️  Index name:', process.env.ALGOLIA_INDEX_NAME || 'mizuho_content');
    console.log('');
    console.log('🗑️  Clearing Algolia index...\n');

    // Clear the index
    const response = await algoliaClient.clearIndex();

    console.log('✅ Index cleared successfully!');
    console.log('📊 Task ID:', response.taskID);
    console.log('');
    console.log('✨ The index is now empty and ready for a fresh sync.');
    console.log('');
    console.log('Next steps:');
    console.log('1. Ensure FETCH_ALL_LOCALES is set correctly in .env');
    console.log('2. Run: npm run sync-pages');
    console.log('3. Run: npm run sync-cms');

  } catch (error) {
    scriptLogger.error('Failed to clear index', { error: error.message });
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

clearIndex();
