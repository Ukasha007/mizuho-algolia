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

  // Allow GET for cron jobs, POST for manual triggers
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json(createApiResponse(
      false,
      {},
      'Method not allowed - Use POST or GET',
      405
    ).body);
  }

  // SECURITY: Require authentication for sync operations
  const authCheck = requireAuth(req, res);
  if (!authCheck.authenticated) {
    return authCheck.response;
  }

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
    const syncStartTime = new Date();

    // Single start message with key info
    requestLogger.info('Static pages sync started', {
      mode: forceFullSync ? 'full' : 'incremental',
      timestamp: syncStartTime.toISOString()
    });

    // Step 1: Get last sync time
    const lastSyncTime = forceFullSync ? null : await syncStateManager.getLastSyncTime('static-pages');

    // Step 2: Fetch all page metadata (fast, lightweight)
    const allPages = await staticPagesFetcher.fetchAllPages({
      batchSize: 15,
      maxConcurrent: 8,
      fetchAllLocales: false
    });

    // Step 3: Deletion sync - remove pages that no longer exist in Webflow
    try {
      const webflowPageIDs = allPages.map(page =>
        `page_${page.id}${page.locale ? `_${page.locale.tag}` : ''}`
      );
      const algoliaPageIDs = await algoliaClient.getAllObjectIDsByType('static-page');

      const deletionResult = await algoliaClient.safeDeleteOrphaned(
        webflowPageIDs,
        algoliaPageIDs,
        {
          safetyThreshold: 0.6,
          dryRun: false,
          entityType: 'static pages'
        }
      );

      // Only log if items were deleted
      if (deletionResult.deleted > 0) {
        requestLogger.warn(`Deleted ${deletionResult.deleted} orphaned pages`);
      }
    } catch (error) {
      requestLogger.error('Deletion sync failed', { error: error.message });
    }

    // Step 4: Filter to only changed pages
    let pagesToSync;
    if (!lastSyncTime) {
      pagesToSync = allPages;
    } else {
      pagesToSync = allPages.filter(page => {
        const pageLastModified = new Date(page.lastUpdated || page.lastModified || page.createdOn);
        return pageLastModified > lastSyncTime;
      });
    }

    // Step 5: If no changes, return early
    if (pagesToSync.length === 0) {
      requestLogger.info('No changes detected');
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
    const transformedPages = pageTransformer.transformForAlgolia(pagesToSync);

    // Step 7: Index to Algolia
    const preparedObjects = await algoliaClient.prepareObjectsForIndexing(transformedPages);
    const indexResult = await algoliaClient.indexObjects(preparedObjects, {
      clearIndex: false
    });

    // Step 8: Update last sync time
    await syncStateManager.setLastSyncTime('static-pages', syncStartTime);

    const syncDuration = Math.round((new Date() - syncStartTime) / 1000);

    // Single completion message with all key stats
    requestLogger.success(`Sync complete: ${indexResult.indexed} pages indexed (${syncDuration}s)`);

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
