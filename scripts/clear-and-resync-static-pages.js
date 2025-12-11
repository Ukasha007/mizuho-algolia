#!/usr/bin/env node

/**
 * Clear all static pages from Algolia and resync them fresh
 * This fixes any duplicate static page issues
 *
 * Usage: node scripts/clear-and-resync-static-pages.js
 */

import logger from '../lib/core/logger.js';
import algoliaClient from '../lib/algolia/client.js';
import staticPagesFetcher from '../lib/webflow/static-fetcher.js';
import pageTransformer from '../lib/transformers/page-transformer.js';
import syncStateManager from '../lib/algolia/sync-state.js';

const scriptLogger = logger.setContext('ClearAndResyncStaticPages');

async function clearAndResyncStaticPages() {
  try {
    scriptLogger.step('Starting clear and resync of static pages');

    // Step 1: Get all current static page objectIDs from Algolia
    scriptLogger.info('Fetching all static page objectIDs from Algolia...');
    const staticPageObjectIDs = await algoliaClient.getAllObjectIDsByType('static-page');
    scriptLogger.success(`Found ${staticPageObjectIDs.length} static pages in Algolia`);

    if (staticPageObjectIDs.length === 0) {
      scriptLogger.warn('No static pages found in Algolia to delete');
    } else {
      // Step 2: Delete all static pages
      scriptLogger.step(`Deleting ${staticPageObjectIDs.length} static pages from Algolia...`);
      await algoliaClient.deleteObjects(staticPageObjectIDs);
      scriptLogger.success(`Deleted ${staticPageObjectIDs.length} static pages from Algolia`);
    }

    // Step 3: Fetch all static pages from Webflow
    scriptLogger.step('Fetching all static pages from Webflow...');
    const staticPages = await staticPagesFetcher.fetchAllPages({
      batchSize: 15,
      maxConcurrent: 8,
      fetchAllLocales: false
    });
    scriptLogger.success(`Fetched ${staticPages.length} static pages from Webflow`);

    if (staticPages.length === 0) {
      scriptLogger.error('No static pages found in Webflow!');
      process.exit(1);
    }

    // Step 4: Transform pages for Algolia
    scriptLogger.step('Transforming pages for Algolia...');
    const transformedPages = pageTransformer.transformForAlgolia(staticPages);
    scriptLogger.success(`Transformed ${transformedPages.length} pages`);

    // Step 5: Prepare objects for indexing
    scriptLogger.step('Preparing objects for indexing...');
    const preparedObjects = await algoliaClient.prepareObjectsForIndexing(transformedPages);
    scriptLogger.success(`Prepared ${preparedObjects.length} objects for indexing`);

    // Step 6: Index to Algolia
    scriptLogger.step('Indexing to Algolia...');
    const indexResult = await algoliaClient.indexObjects(preparedObjects, {
      clearIndex: false // Index is already cleared by deletion
    });
    scriptLogger.success(`Indexed ${indexResult.indexed} pages to Algolia`);

    // Step 7: Update last sync time
    const syncTime = new Date();
    await syncStateManager.setLastSyncTime('static-pages', syncTime);
    scriptLogger.success(`Updated last sync time to ${syncTime.toISOString()}`);

    // Step 8: Verify no duplicates
    scriptLogger.step('Verifying no duplicates...');
    const verifyObjectIDs = await algoliaClient.getAllObjectIDsByType('static-page');
    scriptLogger.info(`Total static pages in Algolia after resync: ${verifyObjectIDs.length}`);

    // Check for duplicates by comparing count
    if (verifyObjectIDs.length === preparedObjects.length) {
      scriptLogger.success('✅ No duplicates detected - counts match!');
    } else {
      scriptLogger.warn(`⚠️ Count mismatch: Expected ${preparedObjects.length}, got ${verifyObjectIDs.length}`);
    }

    scriptLogger.success('Static pages clear and resync completed successfully!');

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Deleted from Algolia:  ${staticPageObjectIDs.length} pages`);
    console.log(`Fetched from Webflow:  ${staticPages.length} pages`);
    console.log(`Indexed to Algolia:    ${indexResult.indexed} pages`);
    console.log(`Final count in Algolia: ${verifyObjectIDs.length} pages`);
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    scriptLogger.error('Failed to clear and resync static pages', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Run the script
clearAndResyncStaticPages();
