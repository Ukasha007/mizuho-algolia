#!/usr/bin/env node

/**
 * Clear and Re-sync Static Pages
 *
 * This script clears old/duplicate pages from Algolia and re-syncs with correct format
 */

import 'dotenv/config';
import algoliasearch from 'algoliasearch';
import logger from '../lib/core/logger.js';
import staticPagesFetcher from '../lib/webflow/static-fetcher.js';
import pageTransformer from '../lib/transformers/page-transformer.js';
import algoliaClient from '../lib/algolia/client.js';

const log = logger.setContext('ClearAndResync');

async function clearAndResync() {
  console.log('\n🔄 CLEAR AND RE-SYNC STATIC PAGES\n');
  console.log('==================================\n');

  try {
    // Step 1: Analyze current index
    log.step('Step 1: Analyzing current index...');

    const client = algoliasearch(
      process.env.ALGOLIA_APP_ID,
      process.env.ALGOLIA_API_KEY
    );

    const indexName = process.env.ALGOLIA_INDEX_NAME || 'mizuho_content';
    const index = client.initIndex(indexName);

    // Fetch all objects
    const allObjects = [];
    await index.browseObjects({
      query: '',
      batch: (batch) => {
        allObjects.push(...batch);
      }
    });

    const staticPages = allObjects.filter(obj => obj.type === 'static-page');
    const oldFormatPages = staticPages.filter(obj => obj.objectID && obj.objectID.startsWith('cms_'));
    const newFormatPages = staticPages.filter(obj => obj.objectID && obj.objectID.startsWith('page_'));

    console.log(`📊 Current Index Status:`);
    console.log(`   Total objects:           ${allObjects.length}`);
    console.log(`   Static pages:            ${staticPages.length}`);
    console.log(`   Old format (cms_):       ${oldFormatPages.length} ❌`);
    console.log(`   New format (page_):      ${newFormatPages.length} ✅`);
    console.log('');

    if (staticPages.length === 0) {
      console.log('✅ No static pages found. Nothing to clear!');
      console.log('   Proceeding to fresh sync.\n');
    } else {
      console.log(`🗑️  Will delete ALL ${staticPages.length} static pages and resync from Webflow`);
      console.log('');
    }

    // Step 2: Delete ALL static pages (not just old format)
    if (staticPages.length > 0) {
      log.step(`Step 2: Deleting ${staticPages.length} static pages...`);

      const objectIDsToDelete = staticPages.map(obj => obj.objectID);

      // Delete in batches of 1000
      const batchSize = 1000;
      for (let i = 0; i < objectIDsToDelete.length; i += batchSize) {
        const batch = objectIDsToDelete.slice(i, i + batchSize);
        await index.deleteObjects(batch);
        console.log(`   Deleted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(objectIDsToDelete.length / batchSize)} (${batch.length} objects)`);
      }

      log.success(`Deleted ${objectIDsToDelete.length} static pages`);
      console.log('');
    }

    // Step 3: Fetch fresh pages from Webflow
    log.step('Step 3: Fetching pages from Webflow...');

    const pages = await staticPagesFetcher.fetchAllPages({ fetchAllLocales: true });
    console.log(`   Fetched ${pages.length} pages from Webflow`);
    console.log('');

    // Step 4: Transform pages
    log.step('Step 4: Transforming pages for Algolia...');

    const transformedPages = pageTransformer.transformForAlgolia(pages, { includeContent: true });
    console.log(`   Transformed ${transformedPages.length} pages`);
    console.log('');

    // Verify format
    const samplePage = transformedPages[0];
    console.log(`   Sample objectID: ${samplePage?.objectID}`);
    console.log(`   Format check: ${samplePage?.objectID?.startsWith('page_') ? '✅ Correct' : '❌ Wrong'}`);
    console.log('');

    // Step 5: Index to Algolia
    log.step('Step 5: Indexing to Algolia...');

    const indexResult = await algoliaClient.indexObjects(transformedPages, { clearIndex: false });
    console.log(`   Indexed ${indexResult.indexed} pages`);
    console.log('');

    // Step 6: Verify final state
    log.step('Step 6: Verifying final index state...');

    const finalObjects = [];
    await index.browseObjects({
      query: '',
      batch: (batch) => {
        finalObjects.push(...batch);
      }
    });

    const finalStaticPages = finalObjects.filter(obj => obj.type === 'static-page');
    const finalOldFormat = finalStaticPages.filter(obj => obj.objectID && obj.objectID.startsWith('cms_'));
    const finalNewFormat = finalStaticPages.filter(obj => obj.objectID && obj.objectID.startsWith('page_'));

    console.log(`\n📊 Final Index Status:`);
    console.log(`   Total objects:           ${finalObjects.length}`);
    console.log(`   Static pages:            ${finalStaticPages.length}`);
    console.log(`   Old format (cms_):       ${finalOldFormat.length} ${finalOldFormat.length === 0 ? '✅' : '❌'}`);
    console.log(`   New format (page_):      ${finalNewFormat.length} ✅`);
    console.log('');

    if (finalOldFormat.length > 0) {
      console.log('⚠️  Warning: Still found old format pages. You may need to run this script again.');
    } else {
      console.log('✅ SUCCESS! All static pages cleared and resynced.');
      console.log(`✅ Index now has ${finalStaticPages.length} static pages (expected: ~661 from Webflow)`);
    }

    console.log('\n');
    log.success('Clear and re-sync completed!');

  } catch (error) {
    log.error('Failed to clear and re-sync', { error: error.message });
    console.error('\nError details:', error);
    process.exit(1);
  }
}

// Run clear and re-sync
clearAndResync();
