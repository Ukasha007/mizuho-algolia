#!/usr/bin/env node

/**
 * Update Algolia Index Settings
 *
 * This script updates the Algolia index with the optimal search settings,
 * including the new openGraphDescription searchable attribute.
 */

import 'dotenv/config';
import algoliaClient from '../lib/algolia/client.js';
import logger from '../lib/core/logger.js';

async function updateSettings() {
  logger.step('Starting Algolia index settings update');

  try {
    // Initialize Algolia client
    await algoliaClient.init();

    // Get current settings
    logger.info('Fetching current index settings...');
    const currentSettings = await algoliaClient.getSettings();

    console.log('\n📋 CURRENT SEARCHABLE ATTRIBUTES:');
    console.log('═══════════════════════════════════');
    if (currentSettings.searchableAttributes) {
      currentSettings.searchableAttributes.forEach((attr, i) => {
        console.log(`  ${i + 1}. ${attr}`);
      });
    } else {
      console.log('  No searchable attributes configured');
    }

    // Update to optimal settings
    logger.step('Updating index settings with optimal configuration...');
    await algoliaClient.configureIndex();

    // Get updated settings
    const updatedSettings = await algoliaClient.getSettings();

    console.log('\n✅ UPDATED SEARCHABLE ATTRIBUTES:');
    console.log('═══════════════════════════════════');
    if (updatedSettings.searchableAttributes) {
      updatedSettings.searchableAttributes.forEach((attr, i) => {
        const isNew = !currentSettings.searchableAttributes?.includes(attr);
        const marker = isNew ? '✨ NEW' : '';
        console.log(`  ${i + 1}. ${attr} ${marker}`);
      });
    }

    console.log('\n📊 SETTINGS SUMMARY:');
    console.log('═══════════════════════════════════');
    console.log(`Index Name:              ${process.env.ALGOLIA_INDEX_NAME || 'mizuho_content'}`);
    console.log(`Searchable Attributes:   ${updatedSettings.searchableAttributes?.length || 0}`);
    console.log(`Facets:                  ${updatedSettings.attributesForFaceting?.length || 0}`);
    console.log(`Custom Ranking:          ${updatedSettings.customRanking?.join(', ') || 'None'}`);
    console.log(`Typo Tolerance:          ${updatedSettings.typoTolerance}`);
    console.log(`Hits Per Page:           ${updatedSettings.hitsPerPage}`);

    logger.success('Index settings updated successfully!');

    console.log('\n💡 NEXT STEPS:');
    console.log('═══════════════════════════════════');
    console.log('1. The new openGraphDescription field is now searchable');
    console.log('2. Re-sync your static pages to populate this field:');
    console.log('   npm run sync-pages');
    console.log('3. Test your frontend search with keywords from Open Graph descriptions');
    console.log('4. The changes are immediate - no cache clearing needed\n');

  } catch (error) {
    logger.error('Failed to update index settings', { error: error.message });
    console.error('\n❌ Error details:', error);
    process.exit(1);
  }
}

updateSettings();
