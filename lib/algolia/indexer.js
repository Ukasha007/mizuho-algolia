import logger from '../core/logger.js';
import config from '../core/config.js';
import helpers from '../core/helpers.js';
import algoliaClient from './client.js';
import staticPagesFetcher from '../webflow/static-fetcher.js';
import cmsFetcher from '../webflow/cms-fetcher.js';
import pageTransformer from '../transformers/page-transformer.js';
import cmsTransformer from '../transformers/cms-transformer.js';
import regionalFilter from '../transformers/regional-filter.js';

class AlgoliaIndexer {
  constructor() {
    this.logger = logger.setContext('AlgoliaIndexer');
    this.indexingStats = {
      startTime: null,
      endTime: null,
      staticPages: 0,
      cmsItems: 0,
      totalIndexed: 0,
      errors: []
    };

    // IDEMPOTENCY: Track cron execution IDs to prevent duplicate runs
    this.cronExecutions = new Map(); // cronId -> timestamp

    // IN-FLIGHT LOCK: Track currently running syncs to prevent concurrent runs
    // Supports concurrent syncs for different regions/collections
    this.activeSyncs = new Set(); // Set of syncId (e.g., 'full-sync-americas', 'collection-xyz', 'static-pages')
  }

  /**
   * Check if a cron execution has already been processed (deduplication)
   * @param {string} cronId - Vercel cron execution ID from x-vercel-cron-id header
   * @returns {boolean} - true if this is a duplicate execution
   */
  isDuplicateCronExecution(cronId) {
    if (!cronId) {
      return false; // No cronId means not a cron job, allow execution
    }

    // Clean up old entries (older than 2 hours)
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    for (const [id, timestamp] of this.cronExecutions.entries()) {
      if (timestamp < twoHoursAgo) {
        this.cronExecutions.delete(id);
      }
    }

    // Check if we've seen this cronId before
    if (this.cronExecutions.has(cronId)) {
      this.logger.warn('Duplicate cron execution detected', { cronId });
      return true;
    }

    // Record this execution
    this.cronExecutions.set(cronId, Date.now());
    return false;
  }

  /**
   * Check if a sync is already in progress for a given identifier
   * @param {string} syncId - Identifier for the sync (collectionId or 'static-pages')
   * @returns {boolean} - true if sync is already in progress
   */
  isSyncInProgress(syncId) {
    return this.activeSyncs.has(syncId);
  }

  /**
   * Mark a sync as started
   * @param {string} syncId - Identifier for the sync
   */
  startSync(syncId) {
    this.activeSyncs.add(syncId);
  }

  /**
   * Mark a sync as completed
   * @param {string} syncId - Identifier for the sync
   */
  endSync(syncId) {
    this.activeSyncs.delete(syncId);
  }

  async performFullSync(options = {}) {
    const {
      region = null,
      includeStatic = true,
      includeCMS = true,
      clearIndex = false,
      dryRun = false // Enable actual indexing to Algolia
    } = options;

    // Use region-specific lock instead of global lock to allow concurrent regional syncs
    const syncId = `full-sync-${region || 'all'}`;

    if (this.isSyncInProgress(syncId)) {
      this.logger.warn(`Full sync already in progress for: ${region || 'all regions'}`);
      throw new Error(`Full sync already in progress for region: ${region || 'all'}`);
    }

    this.startSync(syncId);
    this.resetStats();
    this.indexingStats.startTime = new Date().toISOString();

    try {
      const allObjects = [];

      if (includeStatic) {
        const staticObjects = await this.syncStaticPages(region);
        allObjects.push(...staticObjects);
      }

      if (includeCMS) {
        const cmsObjects = await this.syncCMSCollections(region);
        allObjects.push(...cmsObjects);
      }

      if (dryRun) {
        this.logger.warn('DRY RUN MODE - Objects prepared but not sent to Algolia');
        algoliaClient.logIndexingPreview(allObjects);
        
        const result = {
          success: true,
          dryRun: true,
          prepared: allObjects.length,
          staticPages: this.indexingStats.staticPages,
          cmsItems: this.indexingStats.cmsItems,
          message: 'Dry run completed - no data sent to Algolia'
        };

        this.completeIndexing(result);
        return result;
      }

      // Actual Algolia indexing - now enabled
      const preparedObjects = await algoliaClient.prepareObjectsForIndexing(allObjects);
      const indexResult = await algoliaClient.indexObjects(preparedObjects, { clearIndex });

      this.indexingStats.totalIndexed = indexResult.indexed;

      const result = {
        success: true,
        indexed: indexResult.indexed,
        prepared: allObjects.length,
        staticPages: this.indexingStats.staticPages,
        cmsItems: this.indexingStats.cmsItems,
        algoliaResponse: indexResult
      };

      this.completeIndexing(result);
      return result;

    } catch (error) {
      this.indexingStats.errors.push({
        message: error.message,
        timestamp: new Date().toISOString()
      });

      this.logger.error('Full sync failed', { error: error.message });
      this.completeIndexing({ success: false, error: error.message });
      throw error;
    } finally {
      // Always release the region-specific lock
      this.endSync(syncId);
    }
  }

  async syncStaticPages(region = null) {
    try {
      const pages = await staticPagesFetcher.fetchAllPages();
      const transformedPages = pageTransformer.transformForSearch(pages, {
        region,
        includeContent: true
      });

      this.indexingStats.staticPages = transformedPages.length;
      return transformedPages;

    } catch (error) {
      this.logger.error('Failed to sync static pages', { error: error.message });
      throw error;
    }
  }

  async syncCMSCollections(region = null, options = {}) {
    try {
      const { excludeCollections = ['beyond-the-obvious'] } = options;

      // Exclude Beyond the Obvious collection from cron syncs (managed via webhooks)
      const cmsItems = await cmsFetcher.fetchAllCollections({ excludeCollections });
      const transformedItems = cmsTransformer.transformForSearch(cmsItems, {
        region,
        includeContent: true
      });

      this.indexingStats.cmsItems = transformedItems.length;
      return transformedItems;

    } catch (error) {
      this.logger.error('Failed to sync CMS collections', { error: error.message });
      throw error;
    }
  }

  async syncSpecificCollection(collectionSlug, options = {}) {
    const { dryRun = false, clearExisting = false, cronId = null } = options;

    // IDEMPOTENCY: Check for duplicate cron execution
    if (this.isDuplicateCronExecution(cronId)) {
      this.logger.warn(`Skipping duplicate cron execution for collection: ${collectionSlug}`);
      return {
        success: false,
        collectionSlug,
        message: 'Duplicate cron execution - skipped',
        duplicate: true
      };
    }

    // IN-FLIGHT LOCK: Check if sync already in progress
    if (this.isSyncInProgress(collectionSlug)) {
      this.logger.warn(`Sync already in progress for collection: ${collectionSlug}`);
      return {
        success: false,
        collectionSlug,
        message: 'Sync already in progress - skipped',
        inProgress: true
      };
    }

    this.startSync(collectionSlug);

    try {
      const items = await cmsFetcher.fetchSpecificCollection(collectionSlug);

      if (!items || items.length === 0) {
        this.logger.warn(`No items in ${collectionSlug}`);
        return {
          success: true,
          collectionSlug,
          indexed: 0,
          message: 'No items found in collection'
        };
      }

      // Deletion sync - remove items that no longer exist in Webflow
      try {
        const webflowItemIDs = items.map(item => `cms_${item.id}`);
        const algoliaItemIDs = await algoliaClient.getAllObjectIDsByCollection(collectionSlug);

        const deletionResult = await algoliaClient.safeDeleteOrphaned(
          webflowItemIDs,
          algoliaItemIDs,
          {
            safetyThreshold: 0.6,
            dryRun: false,
            entityType: `collection items (${collectionSlug})`
          }
        );

        // Only log if items were deleted
        if (deletionResult.deleted > 0) {
          this.logger.warn(`${collectionSlug}: deleted ${deletionResult.deleted} orphaned items`);
        }
      } catch (error) {
        this.logger.error(`${collectionSlug}: deletion failed`, { error: error.message });
      }

      // Transform for Algolia
      const transformedItems = cmsTransformer.transformForAlgolia(items, {
        includeContent: true
      });

      if (dryRun) {
        this.logger.warn('DRY RUN MODE - Objects prepared but not sent to Algolia');
        algoliaClient.logIndexingPreview(transformedItems);

        return {
          success: true,
          dryRun: true,
          collectionSlug,
          prepared: transformedItems.length,
          message: 'Dry run completed - no data sent to Algolia'
        };
      }

      // Prepare and index objects
      const preparedObjects = await algoliaClient.prepareObjectsForIndexing(transformedItems);

      // Index to Algolia
      const indexResult = await algoliaClient.indexObjects(preparedObjects, {
        clearIndex: false,
        replaceAllObjects: clearExisting
      });

      return {
        success: true,
        collectionSlug,
        indexed: indexResult.indexed,
        prepared: transformedItems.length,
        algoliaResponse: indexResult
      };

    } catch (error) {
      this.logger.error(`Failed to sync collection ${collectionSlug}`, {
        error: error.message
      });
      throw error;
    } finally {
      // Always release the lock
      this.endSync(collectionSlug);
    }
  }

  async syncStaticPagesOnly(options = {}) {
    const { dryRun = false, cronId = null } = options;
    const syncId = 'static-pages';

    // IDEMPOTENCY: Check for duplicate cron execution
    if (this.isDuplicateCronExecution(cronId)) {
      this.logger.warn(`Skipping duplicate cron execution for static pages`);
      return {
        success: false,
        message: 'Duplicate cron execution - skipped',
        duplicate: true
      };
    }

    // IN-FLIGHT LOCK: Check if sync already in progress
    if (this.isSyncInProgress(syncId)) {
      this.logger.warn(`Sync already in progress for static pages`);
      return {
        success: false,
        message: 'Sync already in progress - skipped',
        inProgress: true
      };
    }

    this.logger.step('Syncing static pages only');
    this.startSync(syncId);

    try {
      const staticPages = await staticPagesFetcher.fetchAllPages();

      if (!staticPages || staticPages.length === 0) {
        this.logger.warn('No static pages found');
        return {
          success: true,
          indexed: 0,
          message: 'No static pages found'
        };
      }

      this.logger.info(`Fetched ${staticPages.length} static pages`);

      // Transform for Algolia
      const transformedPages = pageTransformer.transformForAlgolia(staticPages);

      if (dryRun) {
        this.logger.warn('DRY RUN MODE - Objects prepared but not sent to Algolia');
        algoliaClient.logIndexingPreview(transformedPages);

        return {
          success: true,
          dryRun: true,
          prepared: transformedPages.length,
          message: 'Dry run completed - no data sent to Algolia'
        };
      }

      // Prepare and index objects
      const preparedObjects = await algoliaClient.prepareObjectsForIndexing(transformedPages);
      const indexResult = await algoliaClient.indexObjects(preparedObjects, {
        clearIndex: false
      });

      this.logger.success(`Indexed ${indexResult.indexed} static pages`);

      // Delete orphaned pages (pages in Algolia but not in Webflow)
      this.logger.step('Checking for orphaned static pages in Algolia');

      // Get all static page objectIDs currently in Algolia
      const algoliaObjectIDs = await algoliaClient.getAllObjectIDsByType('static-page');
      this.logger.info(`Found ${algoliaObjectIDs.length} static pages in Algolia`);

      // Get objectIDs of pages we just indexed
      const webflowObjectIDs = preparedObjects.map(obj => obj.objectID);
      this.logger.info(`Just indexed ${webflowObjectIDs.length} pages from Webflow`);

      // Delete orphaned pages with safety check
      const deleteResult = await algoliaClient.safeDeleteOrphaned(
        webflowObjectIDs,
        algoliaObjectIDs,
        {
          safetyThreshold: 0.6, // Abort if >60% would be deleted
          dryRun: false,
          entityType: 'static pages'
        }
      );

      this.logger.success(`Sync complete: indexed ${indexResult.indexed}, deleted ${deleteResult.deleted} orphaned pages`);

      return {
        success: true,
        indexed: indexResult.indexed,
        prepared: transformedPages.length,
        orphanedDeleted: deleteResult.deleted,
        algoliaResponse: indexResult,
        deleteResponse: deleteResult
      };

    } catch (error) {
      this.logger.error('Failed to sync static pages', {
        error: error.message
      });
      throw error;
    } finally {
      // Always release the lock
      this.endSync(syncId);
    }
  }

  async performIncrementalSync(options = {}) {
    const { region = null, since = null, dryRun = false } = options;

    this.logger.step('Starting incremental synchronization', { since, region });

    try {
      // This would be implemented to sync only changed items since a specific date
      // For now, we'll just log the intent

      this.logger.info('Incremental sync not implemented yet - performing full sync instead');
      return await this.performFullSync({ region, dryRun });

    } catch (error) {
      this.logger.error('Incremental sync failed', { error: error.message });
      throw error;
    }
  }

  // async configureSearchIndex() {
  //   this.logger.step('Configuring Algolia search index');

  //   try {
  //     await algoliaClient.configureIndex();
  //     this.logger.success('Search index configured successfully');
  //   } catch (error) {
  //     this.logger.error('Failed to configure search index', { 
  //       error: error.message 
  //     });
  //     throw error;
  //   }
  // }

  async validateIndexData(options = {}) {
    const { region = null } = options;

    this.logger.step('Validating index data');

    try {
      const staticPages = await staticPagesFetcher.fetchAllPages();
      const cmsItems = await cmsFetcher.fetchAllCollections();

      const staticValidation = this.validateStaticPages(staticPages);
      const cmsValidation = this.validateCMSItems(cmsItems);
      const regionalValidation = regionalFilter.validateRegionalData([...staticPages, ...cmsItems]);

      const overallValidation = {
        isValid: staticValidation.isValid && cmsValidation.isValid && regionalValidation.isValid,
        staticPages: staticValidation,
        cmsItems: cmsValidation,
        regionalData: regionalValidation,
        summary: {
          totalItems: staticPages.length + cmsItems.length,
          validItems: staticValidation.validCount + cmsValidation.validCount,
          invalidItems: staticValidation.invalidCount + cmsValidation.invalidCount
        }
      };

      this.logger.success('Data validation completed', { 
        isValid: overallValidation.isValid,
        summary: overallValidation.summary 
      });

      return overallValidation;

    } catch (error) {
      this.logger.error('Data validation failed', { error: error.message });
      throw error;
    }
  }

  validateStaticPages(pages) {
    let validCount = 0;
    let invalidCount = 0;
    const issues = [];

    for (const page of pages) {
      if (this.isValidStaticPage(page)) {
        validCount++;
      } else {
        invalidCount++;
        issues.push({
          id: page.id,
          slug: page.slug,
          issues: this.getStaticPageIssues(page)
        });
      }
    }

    return {
      isValid: invalidCount === 0,
      validCount,
      invalidCount,
      totalCount: pages.length,
      issues
    };
  }

  validateCMSItems(items) {
    let validCount = 0;
    let invalidCount = 0;
    const issues = [];

    for (const item of items) {
      if (this.isValidCMSItem(item)) {
        validCount++;
      } else {
        invalidCount++;
        issues.push({
          id: item.id,
          title: item.title,
          collection: item.collectionSlug,
          issues: this.getCMSItemIssues(item)
        });
      }
    }

    return {
      isValid: invalidCount === 0,
      validCount,
      invalidCount,
      totalCount: items.length,
      issues
    };
  }

  isValidStaticPage(page) {
    return page.id && page.title && page.slug;
  }

  isValidCMSItem(item) {
    return item.id && item.title && item.collectionSlug;
  }

  getStaticPageIssues(page) {
    const issues = [];
    if (!page.id) issues.push('Missing ID');
    if (!page.title) issues.push('Missing title');
    if (!page.slug) issues.push('Missing slug');
    return issues;
  }

  getCMSItemIssues(item) {
    const issues = [];
    if (!item.id) issues.push('Missing ID');
    if (!item.title) issues.push('Missing title');
    if (!item.collectionSlug) issues.push('Missing collection slug');
    return issues;
  }

  resetStats() {
    this.indexingStats = {
      startTime: null,
      endTime: null,
      staticPages: 0,
      cmsItems: 0,
      totalIndexed: 0,
      errors: []
    };
  }

  completeIndexing(result) {
    this.indexingStats.endTime = new Date().toISOString();

    const duration = this.indexingStats.startTime && this.indexingStats.endTime
      ? new Date(this.indexingStats.endTime) - new Date(this.indexingStats.startTime)
      : 0;

    this.logger.success('Indexing completed', {
      duration: `${Math.round(duration / 1000)}s`,
      stats: this.indexingStats,
      result
    });
  }

  getIndexingStatus() {
    const isIndexing = this.activeSyncs.size > 0;
    return {
      isIndexing,
      activeSyncs: Array.from(this.activeSyncs),
      stats: this.indexingStats,
      progress: isIndexing ? 'in_progress' : 'idle'
    };
  }

  async testConnection() {
    this.logger.step('Testing connections to external services');

    const results = {
      webflow: false,
      algolia: false,
      overall: false
    };

    try {
      // Test Webflow connection
      const webflowClient = (await import('../webflow/client.js')).default;
      await webflowClient.getSiteInfo();
      results.webflow = true;
      this.logger.success('Webflow connection test passed');
    } catch (error) {
      this.logger.error('Webflow connection test failed', { error: error.message });
    }

    try {
      // Test Algolia connection - now enabled
      const indexStats = await algoliaClient.getIndexStats();
      results.algolia = true;
      this.logger.success('Algolia connection test passed');
    } catch (error) {
      this.logger.error('Algolia connection test failed', { error: error.message });
    }

    results.overall = results.webflow && results.algolia;

    this.logger.info('Connection test completed', { results });
    return results;
  }
}

export default new AlgoliaIndexer();