#!/usr/bin/env node

/**
 * Sync ONLY static pages to Algolia (no CMS collections)
 * Usage: node scripts/sync-static-pages-only.js
 */

import dotenv from 'dotenv';
import algoliaIndexer from '../lib/algolia/indexer.js';
import logger from '../lib/core/logger.js';

// Load environment variables
dotenv.config();

const scriptLogger = logger.setContext('SyncStaticPagesOnly');

async function main() {
  try {
    console.log('🚀 Syncing Static Pages Only to Algolia\n');

    // Sync static pages only
    const result = await algoliaIndexer.syncStaticPagesOnly({
      dryRun: false
    });

    // Success!
    console.log('\n🎉 SYNC COMPLETE!');
    console.log('==================');
    console.log(`📄 Pages indexed: ${result.indexed || 0}`);
    console.log(`🗑️  Orphaned pages deleted: ${result.orphanedDeleted || 0}`);
    console.log(`✅ Success: ${result.success ? 'Yes' : 'No'}`);

    if (result.success) {
      console.log(`\n📊 Summary:`);
      console.log(`   - Pages indexed: ${result.indexed}`);
      console.log(`   - Orphaned deleted: ${result.orphanedDeleted || 0}`);
      console.log(`   - Final count: ${result.indexed} pages in Algolia`);
    }

    console.log('\n✅ All static pages successfully synced to Algolia!');
    process.exit(0);

  } catch (error) {
    scriptLogger.error('Sync failed', { error: error.message, stack: error.stack });

    console.error('\n❌ SYNC FAILED');
    console.error('===============');
    console.error(`Error: ${error.message}`);

    if (error.message.includes('ALGOLIA_')) {
      console.error('\n💡 Make sure your Algolia environment variables are set:');
      console.error('   ALGOLIA_APP_ID');
      console.error('   ALGOLIA_API_KEY');
      console.error('   ALGOLIA_INDEX_NAME');
    }

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
