import algoliaIndexer from '../lib/algolia/indexer.js';
import { createApiResponse } from '../lib/core/helpers.js';
import logger from '../lib/core/logger.js';

export default async function handler(req, res) {
  const requestLogger = logger.setContext('HealthCheck');
  
  if (req.method !== 'GET') {
    return res.status(405).json(createApiResponse(
      false, 
      {}, 
      'Method not allowed', 
      405
    ).body);
  }

  requestLogger.info('Health check requested');

  try {
    const connectionTests = await algoliaIndexer.testConnection();
    const indexingStatus = algoliaIndexer.getIndexingStatus();
    
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      connections: connectionTests,
      indexing: indexingStatus,
      environment: process.env.NODE_ENV || 'development'
    };

    requestLogger.success('Health check completed', { 
      overall: connectionTests.overall 
    });

    const statusCode = connectionTests.overall ? 200 : 503;
    const response = createApiResponse(true, healthData, null, statusCode);

    res.status(statusCode).json(response.body);
  } catch (error) {
    requestLogger.error('Health check failed', { error: error.message });
    
    const response = createApiResponse(
      false, 
      { status: 'unhealthy' }, 
      error.message, 
      500
    );
    
    res.status(500).json(response.body);
  }
}