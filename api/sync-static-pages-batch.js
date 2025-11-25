import algoliaIndexer from '../lib/algolia/indexer.js';
import staticPagesFetcher from '../lib/webflow/static-fetcher.js';
import algoliaClient from '../lib/algolia/client.js';
import pageTransformer from '../lib/transformers/page-transformer.js';
import { createApiResponse, validateRequiredEnvVars } from '../lib/core/helpers.js';
import logger from '../lib/core/logger.js';
import { requireAuth } from '../lib/security/auth.js';

/**
 * Batch sync endpoint for static pages
 * Processes pages in chunks to stay within Vercel's 5-minute timeout
 *
 * Query parameters:
 * - batchSize: Number of pages to process per run (default: 100)
 * - offset: Starting offset for this batch (default: 0)
 */
export default async function handler(req, res) {
  const requestLogger = logger.setContext('SyncStaticPagesBatch');

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

  requestLogger.info('Batch static pages sync requested (authenticated)', {
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
    const batchSize = parseInt(req.query.batchSize) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const cronId = req.headers['x-vercel-cron-id'] || null;

    requestLogger.step('Starting batch static pages sync', {
      batchSize,
      offset,
      cronId: cronId ? 'present' : 'none'
    });

    // Step 1: Fetch ALL page metadata (fast, no content)
    const allPages = await staticPagesFetcher.fetchAllPages({
      batchSize: 15,
      maxConcurrent: 8,
      fetchAllLocales: false
    });

    const totalPages = allPages.length;
    const endOffset = Math.min(offset + batchSize, totalPages);
    const pagesInBatch = allPages.slice(offset, endOffset);

    requestLogger.info(`Processing batch`, {
      offset,
      batchSize,
      endOffset,
      pagesInBatch: pagesInBatch.length,
      totalPages
    });

    if (pagesInBatch.length === 0) {
      requestLogger.info('No pages to process in this batch');
      return res.status(200).json(createApiResponse(true, {
        syncType: 'static-pages-batch',
        offset,
        processed: 0,
        totalPages,
        hasMore: false,
        message: 'No pages to process'
      }).body);
    }

    // Step 2: Transform for Algolia
    const transformedPages = pageTransformer.transformForAlgolia(pagesInBatch);

    // Step 3: Index to Algolia
    const preparedObjects = await algoliaClient.prepareObjectsForIndexing(transformedPages);
    const indexResult = await algoliaClient.indexObjects(preparedObjects, {
      clearIndex: false
    });

    const hasMore = endOffset < totalPages;
    const nextOffset = hasMore ? endOffset : null;

    requestLogger.success(`Batch sync completed`, {
      processed: indexResult.indexed,
      nextOffset,
      hasMore
    });

    return res.status(200).json(createApiResponse(true, {
      syncType: 'static-pages-batch',
      offset,
      processed: indexResult.indexed,
      totalPages,
      hasMore,
      nextOffset,
      progress: `${endOffset}/${totalPages}`,
      percentComplete: Math.round((endOffset / totalPages) * 100)
    }).body);

  } catch (error) {
    requestLogger.error('Batch static pages sync failed', { error: error.message });

    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'An error occurred during synchronization. Please check server logs.'
      : error.message;

    return res.status(500).json(createApiResponse(
      false,
      { syncType: 'static-pages-batch' },
      errorMessage,
      500
    ).body);
  }
}
