#!/usr/bin/env node

/**
 * Sync a single CMS collection to Algolia
 * Usage: node scripts/sync-single-collection.js <collection-slug>
 * Example: node scripts/sync-single-collection.js americas-news
 */

import dotenv from 'dotenv';
import algoliaIndexer from '../lib/algolia/indexer.js';
import logger from '../lib/core/logger.js';
import { getConfiguredCollections } from '../lib/constants/collections.js';

// Load environment variables
dotenv.config();

const scriptLogger = logger.setContext('SyncSingleCollection');

async function main() {
  try {
    // Get collection slug from command line args
    const collectionSlug = process.argv[2];

    if (!collectionSlug) {
      console.error('❌ Error: Collection slug is required');
      console.error('\nUsage: node scripts/sync-single-collection.js <collection-slug>');
      console.error('\nAvailable collections:');

      const collections = getConfiguredCollections();
      collections.forEach(c => {
        console.error(`  - ${c.id.padEnd(30)} (${c.name})`);
      });

      process.exit(1);
    }

    console.log(`🚀 Syncing collection: ${collectionSlug}\n`);

    // Sync the specific collection
    const result = await algoliaIndexer.syncSpecificCollection(collectionSlug, {
      dryRun: false
    });

    // Success!
    console.log('\n🎉 SYNC COMPLETE!');
    console.log('==================');
    console.log(`📦 Collection: ${collectionSlug}`);
    console.log(`📤 Items indexed: ${result.indexed || 0}`);
    console.log(`✅ Success: ${result.success ? 'Yes' : 'No'}`);

    if (result.success) {
      console.log(`📊 Total objects indexed: ${result.indexed}`);
    }

    console.log(`\n✅ Collection "${collectionSlug}" successfully synced to Algolia!`);
    process.exit(0);

  } catch (error) {
    scriptLogger.error('Sync failed', { error: error.message, stack: error.stack });

    console.error('\n❌ SYNC FAILED');
    console.error('===============');
    console.error(`Error: ${error.message}`);

    process.exit(1);
  }
}

// Handle process events
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the script
main();
