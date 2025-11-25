import algoliaIndexer from '../lib/algolia/indexer.js';
import { createApiResponse, validateRequiredEnvVars } from '../lib/core/helpers.js';
import logger from '../lib/core/logger.js';
import { requireAuth } from '../lib/security/auth.js';
import { validateSyncRequest } from '../lib/security/input-validator.js';

export default async function handler(req, res) {
  const requestLogger = logger.setContext('SyncCollections');

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

  requestLogger.info('CMS collections sync requested (authenticated)', {
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
    // SECURITY: Validate and sanitize input
    const validation = validateSyncRequest(req.body);
    if (!validation.success) {
      return res.status(400).json(createApiResponse(
        false,
        {},
        validation.message,
        400
      ).body);
    }

    const { region, dryRun, collectionId } = validation.data;

    // Extract cronId from Vercel cron header for deduplication
    const cronId = req.headers['x-vercel-cron-id'] || null;

    requestLogger.step('Starting CMS collections synchronization', {
      region,
      dryRun,
      collectionId,
      cronId: cronId ? 'present' : 'none'
    });

    let result;
    if (collectionId) {
      result = await algoliaIndexer.syncSpecificCollection(collectionId, { region, dryRun, cronId });
    } else {
      result = await algoliaIndexer.syncCMSCollections(region);
    }

    const responseData = {
      syncType: collectionId ? 'specific-collection' : 'all-collections',
      collectionId: collectionId || null,
      region: region || 'all',
      dryRun,
      itemsProcessed: result.length || result.prepared || 0,
      timestamp: new Date().toISOString(),
      preview: Array.isArray(result) ? result.slice(0, 3).map(item => ({
        id: item.id,
        type: item.type,
        title: item.title,
        collectionSlug: item.collectionSlug,
        region: item.region
      })) : []
    };

    requestLogger.success('CMS collections sync completed', {
      itemsProcessed: result.length || result.prepared || 0,
      region: region || 'all',
      collectionId: collectionId || 'all'
    });

    const response = createApiResponse(true, responseData);
    res.status(200).json(response.body);

  } catch (error) {
    requestLogger.error('CMS collections sync failed', { error: error.message });

    // SECURITY: Don't expose internal error details in production
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'An error occurred during synchronization. Please check server logs.'
      : error.message;

    const response = createApiResponse(
      false,
      { syncType: 'cms-collections' },
      errorMessage,
      500
    );

    res.status(500).json(response.body);
  }
}