import algoliaIndexer from '../../lib/algolia/indexer.js';
import { createApiResponse, validateRequiredEnvVars } from '../../lib/core/helpers.js';
import logger from '../../lib/core/logger.js';
import { requireAuth } from '../../lib/security/auth.js';
import { validateSyncRequest } from '../../lib/security/input-validator.js';

export default async function handler(req, res) {
  const requestLogger = logger.setContext('FullSync');

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

  requestLogger.info('Full synchronization requested (authenticated)', {
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

    const {
      region,
      dryRun,
      includeStatic,
      includeCMS,
      clearIndex
    } = validation.data;

    // SECURITY: Extra warning for clearIndex operation
    if (clearIndex) {
      requestLogger.warn('DANGEROUS OPERATION: clearIndex requested', {
        authMethod: authCheck.method,
        timestamp: new Date().toISOString()
      });
    }

    requestLogger.step('Starting full synchronization', {
      region,
      dryRun,
      includeStatic,
      includeCMS,
      clearIndex
    });

    const result = await algoliaIndexer.performFullSync({
      region,
      dryRun,
      includeStatic,
      includeCMS,
      clearIndex
    });

    const responseData = {
      syncType: 'full-sync',
      region: region || 'all',
      dryRun,
      includeStatic,
      includeCMS,
      clearIndex,
      totalPrepared: result.prepared || 0,
      staticPages: result.staticPages || 0,
      cmsItems: result.cmsItems || 0,
      timestamp: new Date().toISOString(),
      message: result.message || 'Full sync completed'
    };

    requestLogger.success('Full synchronization completed', {
      totalPrepared: result.prepared || 0,
      staticPages: result.staticPages || 0,
      cmsItems: result.cmsItems || 0,
      region: region || 'all'
    });

    const response = createApiResponse(true, responseData);
    res.status(200).json(response.body);

  } catch (error) {
    requestLogger.error('Full synchronization failed', { error: error.message });

    // SECURITY: Don't expose internal error details in production
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'An error occurred during synchronization. Please check server logs.'
      : error.message;

    const response = createApiResponse(
      false,
      { syncType: 'full-sync' },
      errorMessage,
      500
    );

    res.status(500).json(response.body);
  }
}
