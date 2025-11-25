import staticPagesFetcher from '../lib/webflow/static-fetcher.js';
import algoliaClient from '../lib/algolia/client.js';
import pageTransformer from '../lib/transformers/page-transformer.js';
import syncStateManager from '../lib/algolia/sync-state.js';
import { createApiResponse, validateRequiredEnvVars } from '../lib/core/helpers.js';
import logger from '../lib/core/logger.js';
import { requireAuth } from '../lib/security/auth.js';

/**
 * Incremental sync endpoint for static pages
 * Only syncs pages that have changed since the last sync
 *
 * Query parameters:
 * - forceFullSync: Set to 'true' to force a full sync (default: false)
 */
export default async function handler(req, res) {
  const requestLogger = logger.setContext('SyncStaticPagesIncremental');

  if (req.method !== 'POST') {
    return res.status(405).json(createApiResponse(
      false,
      {},
      'Method not allowed',
      405
    ).body);
  }

  // SECURITY: Require authentication for sync operations
  const authCheck = requireAuth(req, res);
  if (!authCheck.authenticated) {
    return authCheck.response;
  }

  requestLogger.info('Incremental static pages sync requested (authenticated)', {
    authMethod: authCheck.method
  });

  const envCheck = validateRequiredEnvVars(['WEBFLOW_API_TOKEN', 'WEBFLOW_SITE_ID']);
  if (!envCheck.success) {
    return res.status(400).json(createApiResponse(
      false,
      {},
      envCheck.message,
      400
    ).body);
  }

  try {
    const forceFullSync = req.query.forceFullSync === 'true';
    const cronId = req.headers['x-vercel-cron-id'] || null;
    const syncStartTime = new Date();

    requestLogger.step('Starting incremental static pages sync', {
      forceFullSync,
      cronId: cronId ? 'present' : 'none',
      syncStartTime: syncStartTime.toISOString()
    });

    // Step 1: Get last sync time
    const lastSyncTime = forceFullSync ? null : await syncStateManager.getLastSyncTime('static-pages');

    if (!lastSyncTime) {
      requestLogger.info('No previous sync found - performing full sync');
    } else {
      requestLogger.info(`Last sync was at ${lastSyncTime.toISOString()}`);
    }

    // Step 2: Fetch all page metadata (fast, lightweight)
    requestLogger.step('Fetching all page metadata');
    const allPages = await staticPagesFetcher.fetchAllPages({
      batchSize: 15,
      maxConcurrent: 8,
      fetchAllLocales: false
    });

    requestLogger.info(`Fetched ${allPages.length} total pages`);

    // Step 3: Deletion sync - remove pages that no longer exist in Webflow
    requestLogger.step('Checking for orphaned pages in Algolia');
    try {
      // Generate objectIDs matching the format used in page-transformer.js
      // Pages returned from fetchAllPages have locale property (copied from localeInfo in processPage)
      const webflowPageIDs = allPages.map(page =>
        `page_${page.id}${page.locale ? `_${page.locale.tag}` : ''}`
      );
      const algoliaPageIDs = await algoliaClient.getAllObjectIDsByType('static-page');

      const deletionResult = await algoliaClient.safeDeleteOrphaned(
        webflowPageIDs,
        algoliaPageIDs,
        {
          safetyThreshold: 0.6, // Abort if >60% would be deleted
          dryRun: false, // Set to true for testing
          entityType: 'static pages'
        }
      );

      if (deletionResult.deleted > 0) {
        requestLogger.success(`Deleted ${deletionResult.deleted} orphaned pages from Algolia`);
      } else {
        requestLogger.info('No orphaned pages found');
      }
    } catch (error) {
      // Log but don't fail the entire sync if deletion fails
      requestLogger.error('Deletion sync failed (continuing with incremental sync)', {
        error: error.message
      });
    }

    // Step 4: Filter to only changed pages
    let pagesToSync;
    if (!lastSyncTime) {
      // Full sync - sync all pages
      pagesToSync = allPages;
      requestLogger.info('Full sync: processing all pages');
    } else {
      // Incremental - only pages modified since last sync
      pagesToSync = allPages.filter(page => {
        const pageLastModified = new Date(page.lastUpdated || page.lastModified || page.createdOn);
        return pageLastModified > lastSyncTime;
      });

      requestLogger.info(`Incremental sync: found ${pagesToSync.length} changed pages`, {
        totalPages: allPages.length,
        changedPages: pagesToSync.length,
        percentChanged: Math.round((pagesToSync.length / allPages.length) * 100)
      });
    }

    // Step 5: If no changes, return early
    if (pagesToSync.length === 0) {
      requestLogger.success('No changes detected - sync complete');

      return res.status(200).json(createApiResponse(true, {
        syncType: 'static-pages-incremental',
        syncMode: 'incremental',
        totalPages: allPages.length,
        changedPages: 0,
        indexed: 0,
        lastSyncTime: lastSyncTime?.toISOString(),
        message: 'No changes detected since last sync'
      }).body);
    }

    // Step 6: Transform for Algolia
    requestLogger.step(`Transforming ${pagesToSync.length} pages for Algolia`);
    const transformedPages = pageTransformer.transformForAlgolia(pagesToSync);

    // Step 7: Index to Algolia
    requestLogger.step(`Indexing ${transformedPages.length} pages to Algolia`);
    const preparedObjects = await algoliaClient.prepareObjectsForIndexing(transformedPages);
    const indexResult = await algoliaClient.indexObjects(preparedObjects, {
      clearIndex: false // Never clear on incremental sync
    });

    // Step 8: Update last sync time
    await syncStateManager.setLastSyncTime('static-pages', syncStartTime);

    const syncEndTime = new Date();
    const syncDuration = Math.round((syncEndTime - syncStartTime) / 1000);

    requestLogger.success('Incremental sync completed', {
      totalPages: allPages.length,
      changedPages: pagesToSync.length,
      indexed: indexResult.indexed,
      durationSeconds: syncDuration
    });

    return res.status(200).json(createApiResponse(true, {
      syncType: 'static-pages-incremental',
      syncMode: lastSyncTime ? 'incremental' : 'full',
      totalPages: allPages.length,
      changedPages: pagesToSync.length,
      indexed: indexResult.indexed,
      previousSyncTime: lastSyncTime?.toISOString(),
      currentSyncTime: syncStartTime.toISOString(),
      durationSeconds: syncDuration,
      efficiency: lastSyncTime
        ? `Synced ${Math.round((pagesToSync.length / allPages.length) * 100)}% of pages`
        : 'Full sync performed'
    }).body);

  } catch (error) {
    requestLogger.error('Incremental static pages sync failed', { error: error.message });

    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'An error occurred during synchronization. Please check server logs.'
      : error.message;

    return res.status(500).json(createApiResponse(
      false,
      { syncType: 'static-pages-incremental' },
      errorMessage,
      500
    ).body);
  }
}
