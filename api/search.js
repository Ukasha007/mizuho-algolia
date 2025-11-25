import algoliaClient from '../lib/algolia/client.js';
import { createApiResponse } from '../lib/core/helpers.js';
import logger from '../lib/core/logger.js';
import { validateSearchQuery, buildSafeFilters } from '../lib/security/input-validator.js';

/**
 * API endpoint for searching content in Algolia
 * GET /api/search?q=query&page=0&region=americas&hitsPerPage=20
 */
export default async function handler(req, res) {
  const requestLogger = logger.setContext('SearchAPI');

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json(createApiResponse(
      false, 
      {}, 
      'Method not allowed', 
      405
    ).body);
  }

  try {
    // SECURITY: Validate and sanitize all inputs
    const validation = validateSearchQuery(req.query);

    if (!validation.success) {
      return res.status(400).json(createApiResponse(
        false,
        {},
        validation.message,
        400
      ).body);
    }

    const { q: query, page, region, hitsPerPage, type } = validation.data;

    requestLogger.info(`Search request: "${query}"`, {
      query,
      page,
      region,
      type,
      hitsPerPage
    });

    // Build search options with safe filters
    const searchOptions = {
      page,
      hitsPerPage,
      attributesToHighlight: ['title', 'summary', 'content'],
      highlightPreTag: '<mark>',
      highlightPostTag: '</mark>',
      attributesToSnippet: ['content:50', 'summary:30']
    };

    // SECURITY: Use safe filter building to prevent injection
    const filters = buildSafeFilters({ region, type });
    if (filters) {
      searchOptions.filters = filters;
    }

    // Perform search
    const response = await algoliaClient.search(query, searchOptions);

    const responseData = {
      query,
      hits: response.hits,
      nbHits: response.nbHits,
      page: response.page,
      nbPages: response.nbPages,
      hitsPerPage: response.hitsPerPage,
      processingTimeMS: response.processingTimeMS,
      filters: {
        region,
        type
      },
      facets: response.facets || {},
      params: response.params || ''
    };

    requestLogger.success('Search completed successfully', {
      query,
      hits: response.hits.length,
      totalHits: response.nbHits,
      page: response.page,
      processingTime: response.processingTimeMS
    });

    const apiResponse = createApiResponse(true, responseData);
    res.status(200).json(apiResponse.body);

  } catch (error) {
    requestLogger.error('Search request failed', {
      error: error.message,
      query: req.query.q
    });

    // SECURITY: Don't expose internal error details in production
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'An error occurred while processing your search. Please try again.'
      : error.message;

    const response = createApiResponse(
      false,
      { query: req.query.q },
      errorMessage,
      500
    );

    res.status(500).json(response.body);
  }
}