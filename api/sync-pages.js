import algoliaIndexer from '../lib/algolia/indexer.js';
import { createApiResponse, validateRequiredEnvVars } from '../lib/core/helpers.js';
import logger from '../lib/core/logger.js';
import { requireAuth } from '../lib/security/auth.js';
import { validateSyncRequest } from '../lib/security/input-validator.js';

export default async function handler(req, res) {
  const requestLogger = logger.setContext('SyncPages');

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

  requestLogger.info('Static pages sync requested (authenticated)', {
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

    const { region, dryRun } = validation.data;

    requestLogger.step('Starting static pages synchronization', { region, dryRun });

    const result = await algoliaIndexer.syncStaticPages(region);

    const responseData = {
      syncType: 'static-pages',
      region: region || 'all',
      dryRun,
      pagesProcessed: result.length,
      timestamp: new Date().toISOString(),
      preview: result.slice(0, 3).map(page => ({
        id: page.id,
        title: page.title,
        url: page.url,
        region: page.region
      }))
    };

    requestLogger.success('Static pages sync completed', {
      pagesProcessed: result.length,
      region: region || 'all'
    });

    const response = createApiResponse(true, responseData);
    res.status(200).json(response.body);

  } catch (error) {
    requestLogger.error('Static pages sync failed', { error: error.message });

    // SECURITY: Don't expose internal error details in production
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'An error occurred during synchronization. Please check server logs.'
      : error.message;

    const response = createApiResponse(
      false,
      { syncType: 'static-pages' },
      errorMessage,
      500
    );

    res.status(500).json(response.body);
  }
}
