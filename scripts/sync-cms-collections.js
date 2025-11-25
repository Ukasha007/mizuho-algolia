#!/usr/bin/env node

import logger from '../lib/core/logger.js';
import config from '../lib/core/config.js';
import webflowClient from '../lib/webflow/client.js';
import algoliaClient from '../lib/algolia/client.js';
import cmsFetcher from '../lib/webflow/cms-fetcher.js';
import staticPagesFetcher from '../lib/webflow/static-fetcher.js';
import cmsTransformer from '../lib/transformers/cms-transformer.js';
import dataSanitizer from '../lib/security/data-sanitizer.js';
import performanceMonitor from '../lib/core/performance-monitor.js';
import { getConfiguredCollections } from '../lib/constants/collections.js';

class CMSCollectionSyncer {
  constructor() {
    this.logger = logger.setContext('CMSCollectionSyncer');
    this.syncStats = {
      collections: 0,
      items: 0,
      errors: 0,
      startTime: new Date()
    };
  }

  async syncAllCollections() {
    performanceMonitor.startTimer('full-sync');
    performanceMonitor.logMemoryUsage('Initial memory usage');
    
    this.logger.step('Starting CMS collections sync to Algolia');
    
    try {
      // Validate environment and security
      dataSanitizer.validateEnvironmentVariables();
      
      // Configure Algolia index with proper settings
      performanceMonitor.startTimer('algolia-config');
      await this.configureAlgoliaIndex();
      performanceMonitor.endTimer('algolia-config');
      
      // Get all configured collections
      const collections = getConfiguredCollections();
      this.logger.info(`Found ${collections.length} configured collections to sync`);

      // Fetch all CMS data
      performanceMonitor.startTimer('cms-fetch');
      const allItems = await cmsFetcher.fetchAllCollections();
      performanceMonitor.endTimer('cms-fetch');
      this.logger.info(`Fetched ${allItems.length} total items from CMS`);

      // Check memory after CMS fetch
      performanceMonitor.checkMemoryPressure();

      // Fetch static pages
      performanceMonitor.startTimer('pages-fetch');
      const staticPages = await staticPagesFetcher.fetchAllPages();
      performanceMonitor.endTimer('pages-fetch');
      this.logger.info(`Fetched ${staticPages.length} static pages`);

      // Combine all content
      const allContent = [...allItems, ...staticPages];

      if (allContent.length === 0) {
        this.logger.warn('No content found to sync');
        return;
      }

      this.logger.info(`Total content to sync: ${allContent.length} items`);

      // Transform data for Algolia
      performanceMonitor.startTimer('data-transform');
      const transformedItems = cmsTransformer.transformForAlgolia(allContent, {
        includeContent: true
      });
      performanceMonitor.endTimer('data-transform');

      // Prepare objects for indexing
      performanceMonitor.startTimer('algolia-prepare');
      const preparedObjects = await algoliaClient.prepareObjectsForIndexing(transformedItems);
      performanceMonitor.endTimer('algolia-prepare');
      
      // Check memory before indexing
      performanceMonitor.checkMemoryPressure();
      
      // Preview what will be indexed
      algoliaClient.logIndexingPreview(preparedObjects);

      // Index to Algolia
      performanceMonitor.startTimer('algolia-index');
      const result = await algoliaClient.indexObjects(preparedObjects, {
        clearIndex: true,
        batchSize: config.getSyncConfig().batchSize
      });
      performanceMonitor.endTimer('algolia-index');

      this.syncStats.collections = collections.length;
      this.syncStats.items = result.indexed;
      
      performanceMonitor.endTimer('full-sync');
      performanceMonitor.logMemoryUsage('Final memory usage');
      
      this.logSyncResults();
      this.logger.success('CMS collections sync completed successfully');

    } catch (error) {
      this.syncStats.errors++;
      this.logger.error('CMS collections sync failed', { error: error.message });
      throw error;
    }
  }

  async syncSpecificCollections(collectionKeys = []) {
    this.logger.step(`Syncing specific collections: ${collectionKeys.join(', ')}`);
    
    try {
      await this.configureAlgoliaIndex();
      
      const allCollections = getConfiguredCollections();
      const targetCollections = allCollections.filter(col => 
        collectionKeys.some(key => col.envVar.includes(key))
      );

      if (targetCollections.length === 0) {
        this.logger.warn('No matching collections found');
        return;
      }

      this.logger.info(`Syncing ${targetCollections.length} collections`, {
        collections: targetCollections.map(c => c.name)
      });

      const allItems = [];
      
      for (const collection of targetCollections) {
        try {
          const items = await cmsFetcher.fetchCollectionById(collection.webflowId, collection);
          allItems.push(...items);
          this.syncStats.collections++;
        } catch (error) {
          this.syncStats.errors++;
          this.logger.error(`Failed to sync collection: ${collection.name}`, {
            error: error.message
          });
        }
      }

      if (allItems.length === 0) {
        this.logger.warn('No items found to sync');
        return;
      }

      const transformedItems = cmsTransformer.transformForAlgolia(allItems, {
        includeContent: true
      });

      const preparedObjects = await algoliaClient.prepareObjectsForIndexing(transformedItems);
      algoliaClient.logIndexingPreview(preparedObjects);

      const result = await algoliaClient.indexObjects(preparedObjects, {
        clearIndex: false, // Don't clear when syncing specific collections
        batchSize: config.getSyncConfig().batchSize
      });

      this.syncStats.items = result.indexed;
      this.logSyncResults();
      this.logger.success('Specific collections sync completed successfully');

    } catch (error) {
      this.syncStats.errors++;
      this.logger.error('Specific collections sync failed', { error: error.message });
      throw error;
    }
  }

  async configureAlgoliaIndex() {
    this.logger.step('Configuring Algolia index settings');
    
    try {
      await algoliaClient.configureIndex();
      this.logger.success('Algolia index configured with optimal settings');
    } catch (error) {
      this.logger.error('Failed to configure Algolia index', { error: error.message });
      throw error;
    }
  }

  logSyncResults() {
    const duration = new Date() - this.syncStats.startTime;
    const durationMinutes = Math.round(duration / 60000 * 100) / 100;

    this.logger.info('Sync Results Summary', {
      collections: this.syncStats.collections,
      itemsIndexed: this.syncStats.items,
      errors: this.syncStats.errors,
      durationMinutes,
      success: this.syncStats.errors === 0
    });
  }
}

// CLI Interface
async function main() {
  const syncer = new CMSCollectionSyncer();
  
  try {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
Usage: node sync-cms-collections.js [options] [collections...]

Options:
  --help, -h        Show this help message
  --specific        Sync only specified collections
  --all             Sync all configured collections (default)

Collections:
  AMERICAS_PEOPLE   Sync Americas People collection
  AMERICAS_EVENTS   Sync Americas Events collection  
  AMERICAS_INSIGHTS Sync Americas Insights collection
  AMERICAS_AWARDS   Sync Americas Awards collection
  BEYOND_THE_OBVIOUS Sync Beyond The Obvious collection

Examples:
  node sync-cms-collections.js                                    # Sync all collections
  node sync-cms-collections.js --specific AMERICAS_PEOPLE         # Sync only Americas People
  node sync-cms-collections.js --specific AMERICAS_PEOPLE AMERICAS_EVENTS  # Sync multiple specific collections
      `);
      process.exit(0);
    }

    if (args.includes('--specific') && args.length > 1) {
      const collections = args.filter(arg => !arg.startsWith('--'));
      await syncer.syncSpecificCollections(collections);
    } else {
      await syncer.syncAllCollections();
    }

    process.exit(0);
  } catch (error) {
    logger.error('Sync process failed', { error: error.message });
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default CMSCollectionSyncer;