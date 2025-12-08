import axios from 'axios';
import logger from '../core/logger.js';
import config from '../core/config.js';
import helpers from '../core/helpers.js';
import { getAllSecondaryLocaleTags, shouldIncludePageForLocale } from '../constants/locale-folders.js';

class WebflowClient {
  constructor() {
    this.apiKey = null;
    this.siteId = null;
    this.baseUrl = 'https://api.webflow.com/v2';
    this.referenceCache = new Map();
    this.collectionCache = new Map();
    this.pageContentCache = new Map();
    this.pageMetadataCache = new Map();
    
    // Rate limiting
    this.rateLimitInfo = {
      limit: 120, // Business/Enterprise plan limit (auto-updated from API headers)
      remaining: 120,
      resetTime: null,
      lastUpdated: null
    };
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.requestsThisMinute = 0;
    this.minuteStartTime = Date.now();
    
    this.init();
  }

  init() {
    try {
      const webflowConfig = config.getWebflowConfig();
      this.apiKey = webflowConfig.apiToken;
      this.siteId = webflowConfig.siteId;
      
      this.client = axios.create({
        baseURL: this.baseUrl,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      this.setupInterceptors();
      logger.setContext('WebflowClient').info('Webflow client initialized');
    } catch (error) {
      logger.error('Failed to initialize Webflow client', { error: error.message });
      throw error;
    }
  }

  setupInterceptors() {
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`Making request to ${config.url}`, { 
          method: config.method,
          params: config.params 
        });
        return config;
      },
      (error) => {
        logger.error('Request interceptor error', { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        // Update rate limit info from response headers
        this.updateRateLimitInfo(response.headers);
        
        logger.debug(`Response received from ${response.config.url}`, { 
          status: response.status,
          dataSize: JSON.stringify(response.data).length,
          rateLimitRemaining: this.rateLimitInfo.remaining
        });
        return response;
      },
      (error) => {
        if (error.response) {
          // Update rate limit info even on errors
          this.updateRateLimitInfo(error.response.headers);
          
          logger.error(`API error ${error.response.status}`, {
            url: error.config?.url,
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            rateLimitRemaining: this.rateLimitInfo.remaining
          });
        } else if (error.request) {
          logger.error('Network error', { 
            url: error.config?.url,
            message: error.message 
          });
        } else {
          logger.error('Request setup error', { message: error.message });
        }
        return Promise.reject(error);
      }
    );
  }

  updateRateLimitInfo(headers) {
    if (headers['x-ratelimit-limit']) {
      this.rateLimitInfo.limit = parseInt(headers['x-ratelimit-limit']);
    }
    if (headers['x-ratelimit-remaining']) {
      this.rateLimitInfo.remaining = parseInt(headers['x-ratelimit-remaining']);
    }
    if (headers['x-ratelimit-reset']) {
      this.rateLimitInfo.resetTime = parseInt(headers['x-ratelimit-reset']) * 1000; // Convert to ms
    }
    this.rateLimitInfo.lastUpdated = Date.now();
    
    logger.debug('Rate limit info updated', this.rateLimitInfo);
  }

  async makeRequest(url, options = {}, maxRetries = 3) {
    return new Promise((resolve, reject) => {
      // Add request to queue with priority handling
      const requestItem = {
        url,
        options,
        maxRetries,
        resolve,
        reject,
        timestamp: Date.now(),
        priority: options.priority || 1 // Higher = more important
      };
      
      this.requestQueue.push(requestItem);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      // Check if we need to wait for rate limit reset
      if (await this.shouldWaitForRateLimit()) {
        const waitTime = this.getWaitTime();
        logger.info(`Rate limit approached, waiting ${Math.round(waitTime / 1000)}s before next request`, {
          remaining: this.rateLimitInfo.remaining,
          queueLength: this.requestQueue.length
        });
        await helpers.sleep(waitTime);
      }

      // Sort queue by priority (highest first)
      this.requestQueue.sort((a, b) => b.priority - a.priority);
      
      const requestItem = this.requestQueue.shift();
      
      try {
        const response = await this.executeRequest(requestItem.url, requestItem.options, requestItem.maxRetries);
        requestItem.resolve(response);
      } catch (error) {
        requestItem.reject(error);
      }

      // Small delay between requests to avoid overwhelming the API (configurable)
      const syncConfig = config.getSyncConfig();
      if (syncConfig.interRequestDelay > 0) {
        await helpers.sleep(syncConfig.interRequestDelay);
      }
    }

    this.isProcessingQueue = false;
  }

  async shouldWaitForRateLimit() {
    const now = Date.now();

    // Reset minute counter if needed
    if (now - this.minuteStartTime >= 60000) {
      this.requestsThisMinute = 0;
      this.minuteStartTime = now;
    }

    // Configurable safety buffer (default 10% = 0.1, was 20% = 0.2)
    const syncConfig = config.getSyncConfig();
    const safetyBufferPercent = syncConfig.rateLimitSafetyBuffer;
    const safetyBuffer = Math.floor(this.rateLimitInfo.limit * safetyBufferPercent);
    const safeLimit = this.rateLimitInfo.limit - safetyBuffer;

    return this.rateLimitInfo.remaining <= safetyBuffer || this.requestsThisMinute >= safeLimit;
  }

  getWaitTime() {
    const now = Date.now();
    
    // If we have reset time from headers, use it
    if (this.rateLimitInfo.resetTime && this.rateLimitInfo.resetTime > now) {
      return this.rateLimitInfo.resetTime - now + 1000; // Add 1s buffer
    }
    
    // Otherwise, wait for the current minute to end + buffer
    const timeUntilNextMinute = 60000 - (now - this.minuteStartTime);
    return Math.max(timeUntilNextMinute + 2000, 5000); // Minimum 5s wait
  }

  async executeRequest(url, options = {}, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client({
          url,
          ...options
        });
        
        this.requestsThisMinute++;
        return response;
        
      } catch (error) {
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after']) || 60;
          const waitTime = retryAfter * 1000 + 2000; // Add 2s buffer
          
          logger.warn(`Rate limit hit, waiting ${retryAfter + 2}s before retry`, {
            attempt,
            maxRetries,
            url
          });
          
          if (attempt < maxRetries) {
            await helpers.sleep(waitTime);
            continue;
          }
        }
        
        if (attempt === maxRetries) {
          logger.error(`Request failed after ${maxRetries} attempts`, { 
            url, 
            error: error.message,
            status: error.response?.status 
          });
          throw error;
        }
        
        // Exponential backoff for other errors
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        logger.warn(`Request failed, retrying in ${delay}ms`, {
          attempt,
          error: error.message,
          url
        });
        
        await helpers.sleep(delay);
      }
    }
  }

  async getSiteInfo() {
    logger.step('Fetching site information');
    try {
      const response = await this.makeRequest(`/sites/${this.siteId}`);
      logger.success('Site information retrieved', { 
        siteName: response.data.displayName,
        siteId: this.siteId 
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch site info', { error: error.message });
      throw error;
    }
  }

  async getCollections() {
    if (this.collectionCache.has('all')) {
      return this.collectionCache.get('all');
    }

    logger.step('Fetching all collections');
    try {
      const response = await this.makeRequest(`/sites/${this.siteId}/collections`);
      const collections = response.data.collections || [];
      
      this.collectionCache.set('all', collections);
      logger.success(`Retrieved ${collections.length} collections`);
      return collections;
    } catch (error) {
      logger.error('Failed to fetch collections', { error: error.message });
      throw error;
    }
  }

  async getCollection(collectionId) {
    if (this.collectionCache.has(collectionId)) {
      return this.collectionCache.get(collectionId);
    }

    logger.step(`Fetching collection ${collectionId}`);
    try {
      const response = await this.makeRequest(`/collections/${collectionId}`);
      const collection = response.data;
      
      this.collectionCache.set(collectionId, collection);
      logger.success(`Collection ${collectionId} retrieved`);
      return collection;
    } catch (error) {
      logger.error(`Failed to fetch collection ${collectionId}`, { error: error.message });
      throw error;
    }
  }

  async getCollectionItems(collectionId, options = {}) {
    const { 
      limit = config.getSyncConfig().batchSize,
      offset = 0,
      locale = 'en-US'
    } = options;

    logger.step(`Fetching items from collection ${collectionId} (offset: ${offset}, limit: ${limit})`);
    
    try {
      const params = {
        limit,
        offset,
        locale
      };

      const response = await this.makeRequest(
        `/collections/${collectionId}/items`,
        { method: 'GET', params }
      );

      const items = response.data.items || [];
      const pagination = response.data.pagination || {};
      
      logger.info(`Retrieved ${items.length} items`, {
        collectionId,
        offset,
        limit,
        total: pagination.total
      });

      return {
        items,
        pagination,
        hasMore: offset + items.length < (pagination.total || 0)
      };
    } catch (error) {
      logger.error(`Failed to fetch collection items for ${collectionId}`, { 
        error: error.message,
        offset,
        limit 
      });
      throw error;
    }
  }

  async getAllCollectionItems(collectionId) {
    logger.step(`Fetching all items from collection ${collectionId}`);

    let allItems = [];
    let offset = 0;
    let hasMore = true;
    const limit = config.getSyncConfig().batchSize;

    while (hasMore) {
      try {
        const result = await this.getCollectionItems(collectionId, { limit, offset });
        allItems = [...allItems, ...result.items];

        hasMore = result.hasMore;
        offset += limit;

        if (hasMore) {
          await helpers.sleep(config.getSyncConfig().rateLimitDelay);
        }
      } catch (error) {
        logger.error(`Failed to fetch items at offset ${offset}`, {
          collectionId,
          error: error.message
        });
        throw error;
      }
    }

    logger.success(`Successfully fetched ${allItems.length} items from collection ${collectionId}`);
    return allItems;
  }

  async getCollectionItem(collectionId, itemId) {
    logger.step(`Fetching single item ${itemId} from collection ${collectionId}`);

    try {
      const response = await this.makeRequest(
        `/collections/${collectionId}/items/${itemId}`,
        { method: 'GET' }
      );

      const item = response.data;

      logger.info(`Retrieved item ${itemId}`, {
        collectionId,
        itemId,
        itemSlug: item.fieldData?.slug
      });

      return item;
    } catch (error) {
      logger.error(`Failed to fetch collection item ${itemId}`, {
        collectionId,
        itemId,
        error: error.message
      });
      throw error;
    }
  }

  async resolveReferences(ids, collectionId) {
    if (!ids || !ids.length || !collectionId) {
      return [];
    }

    const cacheKey = `${collectionId}`;
    let collectionMap = this.referenceCache.get(cacheKey);

    if (!collectionMap) {
      logger.info(`Building reference cache for collection ${collectionId}`);
      collectionMap = {};

      try {
        const allItems = await this.getAllCollectionItems(collectionId);
        
        for (const item of allItems) {
          collectionMap[item.id] = item.fieldData?.name || item.fieldData?.title || '';
        }

        this.referenceCache.set(cacheKey, collectionMap);
        logger.success(`Reference cache built for collection ${collectionId}`, {
          itemCount: Object.keys(collectionMap).length
        });
      } catch (error) {
        logger.error(`Failed to build reference cache for collection ${collectionId}`, {
          error: error.message
        });
        return [];
      }
    }

    const resolved = [];
    for (const id of ids) {
      if (collectionMap[id]) {
        resolved.push(collectionMap[id]);
      } else {
        logger.warn(`Could not resolve reference ID: ${id}`, { collectionId });
      }
    }

    logger.debug(`Resolved ${resolved.length}/${ids.length} references`, { collectionId });
    return resolved;
  }

  async getStaticPages(options = {}) {
    const { localeId = null } = options;

    logger.step(`Fetching all static pages${localeId ? ` for locale ${localeId}` : ''}`);

    try {
      let allPages = [];
      let offset = 0;
      const limit = 100; // Webflow API max limit
      let hasMore = true;

      while (hasMore) {
        const params = {
          limit,
          offset
        };

        if (localeId) {
          params.localeId = localeId;
        }

        logger.info(`Fetching pages batch (offset: ${offset}, limit: ${limit})`);

        const response = await this.makeRequest(
          `/sites/${this.siteId}/pages`,
          { method: 'GET', params }
        );

        const pages = response.data.pages || [];
        const pagination = response.data.pagination || {};

        allPages = [...allPages, ...pages];

        logger.info(`Retrieved ${pages.length} pages in this batch`, {
          offset,
          totalSoFar: allPages.length,
          paginationTotal: pagination.total
        });

        // Check if there are more pages to fetch
        hasMore = offset + pages.length < (pagination.total || 0);
        offset += limit;

        // Small delay between pagination requests to respect rate limits
        if (hasMore) {
          await helpers.sleep(500);
        }
      }

      logger.success(`Retrieved ${allPages.length} total static pages${localeId ? ` for locale ${localeId}` : ''}`);
      return allPages;
    } catch (error) {
      logger.error('Failed to fetch static pages', { error: error.message });
      throw error;
    }
  }

  async getSiteLocales() {
    logger.step('Fetching site locales');
    try {
      const response = await this.makeRequest(`/sites/${this.siteId}`);
      const site = response.data;

      const locales = [];

      // Add primary locale
      if (site.locales && site.locales.primary) {
        locales.push({
          id: site.locales.primary.id,
          cmsId: site.locales.primary.cmsLocaleId,
          displayName: site.locales.primary.displayName,
          tag: site.locales.primary.tag,
          isPrimary: true
        });
      }

      // Add secondary locales
      if (site.locales && site.locales.secondary && Array.isArray(site.locales.secondary)) {
        site.locales.secondary.forEach(locale => {
          locales.push({
            id: locale.id,
            cmsId: locale.cmsLocaleId,
            displayName: locale.displayName,
            tag: locale.tag,
            isPrimary: false
          });
        });
      }

      logger.success(`Retrieved ${locales.length} locales`, {
        locales: locales.map(l => `${l.displayName} (${l.tag})`)
      });

      return locales;
    } catch (error) {
      logger.error('Failed to fetch site locales', { error: error.message });
      throw error;
    }
  }

  async getAllStaticPagesAllLocales() {
    logger.step('Fetching all static pages from all locales');

    try {
      const locales = await this.getSiteLocales();
      const allPagesAllLocales = [];

      for (const locale of locales) {
        logger.info(`Fetching pages for locale: ${locale.displayName} (${locale.tag})`);

        try {
          // For primary locale, don't pass localeId (Webflow API requirement)
          // For secondary locales, pass the localeId
          const fetchOptions = locale.isPrimary ? {} : { localeId: locale.id };
          const pages = await this.getStaticPages(fetchOptions);

          // Tag each page with its locale information
          const taggedPages = pages.map(page => ({
            ...page,
            localeInfo: {
              id: locale.id,
              cmsId: locale.cmsId,
              displayName: locale.displayName,
              tag: locale.tag,
              isPrimary: locale.isPrimary
            }
          }));

          allPagesAllLocales.push(...taggedPages);

          logger.success(`Fetched ${pages.length} pages for locale ${locale.displayName}`);

          // Delay between locale fetches to respect rate limits
          if (locales.indexOf(locale) < locales.length - 1) {
            await helpers.sleep(1000);
          }
        } catch (error) {
          logger.error(`Failed to fetch pages for locale ${locale.displayName}`, {
            error: error.message,
            locale: locale.tag
          });
          // Continue with other locales even if one fails
        }
      }

      logger.success(`Retrieved ${allPagesAllLocales.length} total pages across ${locales.length} locales`);
      return allPagesAllLocales;
    } catch (error) {
      logger.error('Failed to fetch pages from all locales', { error: error.message });
      throw error;
    }
  }

  async getAllStaticPagesSelectiveLocales() {
    logger.step('Fetching static pages with selective locale filtering');

    try {
      const locales = await this.getSiteLocales();
      const allPages = [];

      // Step 1: Fetch ALL pages from primary (English) locale
      const primaryLocale = locales.find(l => l.isPrimary);
      if (!primaryLocale) {
        throw new Error('No primary locale found');
      }

      logger.info(`Fetching ALL pages for primary locale: ${primaryLocale.displayName} (${primaryLocale.tag})`);
      const primaryPages = await this.getStaticPages({});

      // Tag primary pages with locale info
      const taggedPrimaryPages = primaryPages.map(page => ({
        ...page,
        localeInfo: {
          id: primaryLocale.id,
          cmsId: primaryLocale.cmsId,
          displayName: primaryLocale.displayName,
          tag: primaryLocale.tag,
          isPrimary: true
        }
      }));

      allPages.push(...taggedPrimaryPages);
      logger.success(`Fetched ${primaryPages.length} pages for primary locale ${primaryLocale.displayName}`);

      // Step 2: Get unique secondary locale tags from our folder mapping
      const secondaryLocaleTags = getAllSecondaryLocaleTags();
      logger.info(`Secondary locales to fetch: ${secondaryLocaleTags.join(', ')}`);

      // Step 3: For each secondary locale, fetch pages and filter by folder
      for (const localeTag of secondaryLocaleTags) {
        // Find the locale object matching this tag
        const locale = locales.find(l => l.tag === localeTag && !l.isPrimary);

        if (!locale) {
          logger.warn(`Secondary locale '${localeTag}' not found in site locales, skipping`);
          continue;
        }

        logger.info(`Fetching pages for secondary locale: ${locale.displayName} (${locale.tag})`);

        try {
          // Fetch all pages for this locale
          const pages = await this.getStaticPages({ localeId: locale.id });
          logger.info(`Retrieved ${pages.length} pages for locale ${locale.tag}, filtering by folder...`);

          // Filter to keep ONLY pages from the specific folders mapped to this locale
          const filteredPages = pages.filter(page => {
            const shouldInclude = shouldIncludePageForLocale(page, localeTag);
            if (shouldInclude) {
              logger.debug(`Including page '${page.slug}' from folder ${page.parentId} for locale ${localeTag}`);
            }
            return shouldInclude;
          });

          logger.info(`Filtered to ${filteredPages.length} pages for locale ${locale.tag} based on folder mapping`);

          // Tag filtered pages with locale info
          const taggedPages = filteredPages.map(page => ({
            ...page,
            localeInfo: {
              id: locale.id,
              cmsId: locale.cmsId,
              displayName: locale.displayName,
              tag: locale.tag,
              isPrimary: false
            }
          }));

          allPages.push(...taggedPages);
          logger.success(`Added ${taggedPages.length} pages for locale ${locale.displayName}`);

          // Delay between locale fetches to respect rate limits
          if (secondaryLocaleTags.indexOf(localeTag) < secondaryLocaleTags.length - 1) {
            await helpers.sleep(1000);
          }
        } catch (error) {
          logger.error(`Failed to fetch pages for locale ${locale.displayName}`, {
            error: error.message,
            locale: locale.tag
          });
          // Continue with other locales even if one fails
        }
      }

      // Step 4: Log summary
      const localeSummary = {};
      allPages.forEach(page => {
        const localeTag = page.localeInfo.tag;
        localeSummary[localeTag] = (localeSummary[localeTag] || 0) + 1;
      });

      logger.success(`Retrieved ${allPages.length} total pages with selective locale filtering`);
      logger.info('Pages per locale:', localeSummary);

      return allPages;
    } catch (error) {
      logger.error('Failed to fetch pages with selective locales', { error: error.message });
      throw error;
    }
  }

  async getPageContent(pageId, options = {}) {
    const { localeId, limit = 100, offset = 0 } = options;
    const cacheKey = `${pageId}_${localeId || 'default'}_${limit}_${offset}`;
    
    // Check cache first
    if (this.pageContentCache.has(cacheKey)) {
      logger.debug(`Retrieved page content from cache: ${pageId}`);
      return this.pageContentCache.get(cacheKey);
    }
    
    logger.step(`Fetching content for page ${pageId}`);
    try {
      const params = {
        limit,
        offset
      };

      if (localeId) {
        params.localeId = localeId;
      }

      const response = await this.makeRequest(
        `/pages/${pageId}/dom`,
        { method: 'GET', params, priority: 2 } // High priority for content
      );

      logger.success(`Retrieved content for page ${pageId}`, {
        nodesCount: response.data.nodes?.length || 0,
        pageId
      });

      // Cache the result
      this.pageContentCache.set(cacheKey, response.data);
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch content for page ${pageId}`, { 
        error: error.message,
        pageId 
      });
      throw error;
    }
  }

  async getPageMetadata(pageId, options = {}) {
    const { localeId } = options;
    const cacheKey = `${pageId}_${localeId || 'default'}`;
    
    // Check cache first
    if (this.pageMetadataCache.has(cacheKey)) {
      logger.debug(`Retrieved page metadata from cache: ${pageId}`);
      return this.pageMetadataCache.get(cacheKey);
    }
    
    logger.step(`Fetching metadata for page ${pageId}`);
    try {
      const params = {};
      
      if (localeId) {
        params.localeId = localeId;
      }

      const response = await this.makeRequest(
        `/pages/${pageId}`,
        { method: 'GET', params, priority: 1 } // Lower priority than content
      );

      logger.success(`Retrieved metadata for page ${pageId}`);
      
      // Cache the result
      this.pageMetadataCache.set(cacheKey, response.data);
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch metadata for page ${pageId}`, { 
        error: error.message,
        pageId 
      });
      throw error;
    }
  }

  // Batch method to get both content and metadata efficiently
  async getPageContentAndMetadata(pageId, options = {}) {
    logger.step(`Fetching content and metadata for page ${pageId}`);
    
    try {
      // Execute both requests concurrently but through the same queue system
      const [contentPromise, metadataPromise] = [
        this.getPageContent(pageId, options),
        this.getPageMetadata(pageId, options)
      ];
      
      const [content, metadata] = await Promise.all([contentPromise, metadataPromise]);
      
      logger.success(`Retrieved both content and metadata for page ${pageId}`);
      
      return { content, metadata };
    } catch (error) {
      logger.error(`Failed to fetch content and metadata for page ${pageId}`, { 
        error: error.message,
        pageId 
      });
      throw error;
    }
  }


  clearCache() {
    this.referenceCache.clear();
    this.collectionCache.clear();
    this.pageContentCache.clear();
    this.pageMetadataCache.clear();
    logger.info('Webflow client cache cleared');
  }

  getCacheStats() {
    return {
      referenceCacheSize: this.referenceCache.size,
      collectionCacheSize: this.collectionCache.size,
      pageContentCacheSize: this.pageContentCache.size,
      pageMetadataCacheSize: this.pageMetadataCache.size
    };
  }

  getQueueStats() {
    return {
      queueLength: this.requestQueue.length,
      isProcessingQueue: this.isProcessingQueue,
      requestsThisMinute: this.requestsThisMinute,
      rateLimitInfo: { ...this.rateLimitInfo }
    };
  }

  // Method to get rate limit status
  getRateLimitStatus() {
    const now = Date.now();
    const minuteProgress = (now - this.minuteStartTime) / 60000;
    
    return {
      limit: this.rateLimitInfo.limit,
      remaining: this.rateLimitInfo.remaining,
      requestsThisMinute: this.requestsThisMinute,
      minuteProgress: Math.round(minuteProgress * 100),
      queueLength: this.requestQueue.length,
      safeToMakeRequest: !this.shouldWaitForRateLimit(),
      nextResetIn: this.rateLimitInfo.resetTime ? Math.max(0, this.rateLimitInfo.resetTime - now) : null
    };
  }
}

export default new WebflowClient();