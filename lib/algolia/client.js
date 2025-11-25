import logger from '../core/logger.js';
import config from '../core/config.js';
import helpers from '../core/helpers.js';

class AlgoliaClient {
  constructor() {
    this.logger = logger.setContext('AlgoliaClient');
    this.client = null;
    this.index = null;
    this.indexName = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    try {
      const algoliasearch = (await import('algoliasearch')).default;
      const algoliaConfig = config.getAlgoliaConfig();
      
      if (!algoliaConfig.appId || !algoliaConfig.apiKey) {
        throw new Error('Algolia configuration is missing. Please check ALGOLIA_APP_ID and ALGOLIA_API_KEY environment variables.');
      }
      
      this.client = algoliasearch(algoliaConfig.appId, algoliaConfig.apiKey);
      this.indexName = algoliaConfig.indexName;
      this.index = this.client.initIndex(this.indexName);
      this.initialized = true;

      this.logger.info('Algolia client initialized', {
        indexName: this.indexName
      });
    } catch (error) {
      this.logger.error('Failed to initialize Algolia client', { 
        error: error.message 
      });
      throw error;
    }
  }

  async indexObjects(objects, options = {}) {
    await this.init();
    const { batchSize = 1000, clearIndex = false } = options;
    
    this.logger.step(`Preparing to index ${objects.length} objects to Algolia`);
    
    try {
      if (clearIndex) {
        await this.clearIndex();
      }

      const batches = helpers.chunk(objects, batchSize);
      let totalIndexed = 0;

      for (const batch of batches) {
        await this.indexBatch(batch);
        totalIndexed += batch.length;
        this.logger.info(`Indexed batch: ${totalIndexed}/${objects.length}`);
        
        if (batches.indexOf(batch) < batches.length - 1) {
          await helpers.sleep(config.getSyncConfig().rateLimitDelay);
        }
      }

      this.logger.success(`Successfully indexed ${totalIndexed} objects to Algolia`);
      return { success: true, indexed: totalIndexed };
    } catch (error) {
      this.logger.error('Failed to index objects to Algolia', { 
        error: error.message 
      });
      throw error;
    }
  }

  async indexBatch(batch, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.index.saveObjects(batch);
        this.logger.debug(`Batch indexed successfully`, { 
          objectCount: batch.length,
          taskID: response.taskID,
          attempt 
        });
        return response;
      } catch (error) {
        if (error.message.includes('too big')) {
          // For size errors, filter out problematic objects and retry
          this.logger.warn(`Batch contains oversized objects, filtering and retrying`, {
            batchSize: batch.length,
            attempt
          });
          
          const filteredBatch = this.filterOversizedObjects(batch);
          if (filteredBatch.length < batch.length) {
            return await this.indexBatch(filteredBatch, 1); // Single retry for filtered batch
          }
        }
        
        if (attempt === retries) {
          this.logger.error('Failed to index batch after all retries', { 
            error: error.message,
            batchSize: batch.length,
            attempts: retries
          });
          throw error;
        }
        
        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        this.logger.warn(`Batch indexing failed, retrying in ${delay}ms`, {
          attempt,
          error: error.message,
          batchSize: batch.length
        });
        
        await helpers.sleep(delay);
      }
    }
  }

  filterOversizedObjects(batch) {
    return batch.filter(obj => {
      const size = JSON.stringify(obj).length;
      if (size > 9500) {
        this.logger.warn(`Skipping oversized object`, {
          objectID: obj.objectID,
          size,
          title: obj.title?.substring(0, 50) + '...'
        });
        return false;
      }
      return true;
    });
  }

  async clearIndex() {
    await this.init();
    this.logger.step('Clearing Algolia index');
    try {
      const response = await this.index.clearObjects();
      this.logger.success('Index cleared successfully', { 
        taskID: response.taskID 
      });
      return response;
    } catch (error) {
      this.logger.error('Failed to clear index', { error: error.message });
      throw error;
    }
  }

  async updateSettings(settings) {
    await this.init();
    this.logger.step('Updating Algolia index settings');
    try {
      const response = await this.index.setSettings(settings);
      this.logger.success('Index settings updated', { 
        taskID: response.taskID 
      });
      return response;
    } catch (error) {
      this.logger.error('Failed to update index settings', { 
        error: error.message 
      });
      throw error;
    }
  }

  async search(query, options = {}) {
    await this.init();
    
    try {
      const searchOptions = {
        hitsPerPage: options.hitsPerPage || 20,
        page: options.page || 0,
        attributesToRetrieve: ['*'],
        attributesToHighlight: ['title', 'summary', 'content'],
        highlightPreTag: '<mark>',
        highlightPostTag: '</mark>',
        ...options
      };

      const response = await this.index.search(query, searchOptions);
      
      this.logger.info(`Search completed for query: "${query}"`, {
        hits: response.hits.length,
        totalHits: response.nbHits,
        processingTime: response.processingTimeMS
      });

      return response;
    } catch (error) {
      this.logger.error('Search failed', { 
        query, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Browse all objectIDs of a specific type
   * @param {string} type - The type to filter by (e.g., 'static-page', 'cms-item')
   * @returns {Promise<string[]>} - Array of objectIDs
   */
  async getAllObjectIDsByType(type) {
    await this.init();
    this.logger.debug(`Browsing all objectIDs for type: ${type}`);

    try {
      const objectIDs = [];

      await this.index.browseObjects({
        filters: `type:${type}`,
        attributesToRetrieve: ['objectID'],
        batch: (batch) => {
          objectIDs.push(...batch.map(obj => obj.objectID));
        }
      });

      this.logger.info(`Found ${objectIDs.length} objects of type: ${type}`);
      return objectIDs;
    } catch (error) {
      this.logger.error('Failed to browse objectIDs by type', {
        type,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Browse all objectIDs of a specific collection
   * @param {string} collectionSlug - The collection slug to filter by
   * @returns {Promise<string[]>} - Array of objectIDs
   */
  async getAllObjectIDsByCollection(collectionSlug) {
    await this.init();
    this.logger.debug(`Browsing all objectIDs for collection: ${collectionSlug}`);

    try {
      const objectIDs = [];

      await this.index.browseObjects({
        filters: `collectionSlug:${collectionSlug}`,
        attributesToRetrieve: ['objectID'],
        batch: (batch) => {
          objectIDs.push(...batch.map(obj => obj.objectID));
        }
      });

      this.logger.info(`Found ${objectIDs.length} objects in collection: ${collectionSlug}`);
      return objectIDs;
    } catch (error) {
      this.logger.error('Failed to browse objectIDs by collection', {
        collectionSlug,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete objects from Algolia by objectID
   * @param {string[]} objectIDs - Array of objectIDs to delete
   * @param {Object} options - Options for deletion
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteObjects(objectIDs, options = {}) {
    await this.init();

    if (!Array.isArray(objectIDs) || objectIDs.length === 0) {
      this.logger.debug('No objects to delete');
      return { deleted: 0 };
    }

    const { dryRun = false } = options;

    if (dryRun) {
      this.logger.warn(`[DRY RUN] Would delete ${objectIDs.length} objects`, {
        sampleIDs: objectIDs.slice(0, 5),
        totalCount: objectIDs.length
      });
      return { deleted: 0, dryRun: true };
    }

    this.logger.step(`Deleting ${objectIDs.length} objects from Algolia`);

    try {
      const response = await this.index.deleteObjects(objectIDs);
      this.logger.success(`Deleted ${objectIDs.length} objects`, {
        taskID: response.taskID
      });
      return { deleted: objectIDs.length, taskID: response.taskID };
    } catch (error) {
      this.logger.error('Failed to delete objects', {
        error: error.message,
        objectCount: objectIDs.length
      });
      throw error;
    }
  }

  /**
   * Safely delete orphaned objects with safety threshold
   * @param {string[]} webflowIDs - Array of current Webflow objectIDs (source of truth)
   * @param {string[]} algoliaIDs - Array of Algolia objectIDs (current index state)
   * @param {Object} options - Options for safe deletion
   * @returns {Promise<Object>} - Deletion result with safety checks
   */
  async safeDeleteOrphaned(webflowIDs, algoliaIDs, options = {}) {
    const {
      safetyThreshold = 0.6, // Default: abort if >60% would be deleted
      dryRun = false,
      entityType = 'objects'
    } = options;

    // Find orphaned IDs (in Algolia but not in Webflow)
    const webflowIDSet = new Set(webflowIDs);
    const orphanedIDs = algoliaIDs.filter(id => !webflowIDSet.has(id));

    if (orphanedIDs.length === 0) {
      this.logger.info(`No orphaned ${entityType} found`);
      return {
        deleted: 0,
        total: algoliaIDs.length,
        orphaned: 0,
        safetyCheckPassed: true
      };
    }

    const deletionPercentage = orphanedIDs.length / algoliaIDs.length;

    // Safety check: abort if deletion percentage exceeds threshold
    if (deletionPercentage > safetyThreshold) {
      const errorMsg = `SAFETY THRESHOLD EXCEEDED: Would delete ${orphanedIDs.length}/${algoliaIDs.length} ${entityType} (${Math.round(deletionPercentage * 100)}%). Threshold: ${Math.round(safetyThreshold * 100)}%`;
      this.logger.error(errorMsg, {
        orphanedCount: orphanedIDs.length,
        totalInAlgolia: algoliaIDs.length,
        webflowCount: webflowIDs.length,
        deletionPercentage: Math.round(deletionPercentage * 100),
        thresholdPercentage: Math.round(safetyThreshold * 100),
        sampleOrphanedIDs: orphanedIDs.slice(0, 10)
      });

      throw new Error(errorMsg);
    }

    this.logger.info(`Found ${orphanedIDs.length} orphaned ${entityType} to delete`, {
      orphanedCount: orphanedIDs.length,
      totalInAlgolia: algoliaIDs.length,
      webflowCount: webflowIDs.length,
      deletionPercentage: Math.round(deletionPercentage * 100),
      safetyThreshold: Math.round(safetyThreshold * 100)
    });

    // Delete orphaned objects
    const deleteResult = await this.deleteObjects(orphanedIDs, { dryRun });

    return {
      deleted: deleteResult.deleted,
      total: algoliaIDs.length,
      orphaned: orphanedIDs.length,
      safetyCheckPassed: true,
      dryRun,
      taskID: deleteResult.taskID
    };
  }

  async prepareObjectsForIndexing(objects) {
    this.logger.step(`Preparing ${objects.length} objects for Algolia indexing`);

    const prepared = objects.map(obj => this.prepareObject(obj));
    const validated = this.validateObjects(prepared);

    const objectsWithAttachments = validated.filter(obj => obj.attachments && obj.attachments.length > 0);
    const objectsWithExternalLinks = validated.filter(obj => obj.externalLink);

    this.logger.success(`Prepared ${validated.length}/${objects.length} objects for indexing`, {
      objectsWithAttachments: objectsWithAttachments.length,
      objectsWithExternalLinks: objectsWithExternalLinks.length
    });

    return validated;
  }

  prepareObject(obj) {
    const prepared = {
      objectID: obj.objectID || `${obj.type}_${obj.id}`,
      ...obj
    };

    // CRITICAL FIX: Clean up summary field before any processing
    // If summary is the string "undefined", "null", or empty, set to empty string
    if (!prepared.summary || prepared.summary === 'undefined' || prepared.summary === 'null' || prepared.summary.trim() === '') {
      prepared.summary = '';
    }

    if (prepared.content && prepared.content.length > 8000) {
      prepared.content = prepared.content.substring(0, 8000) + '...';
      prepared.contentTruncated = true;
    }

    if (prepared.searchText && prepared.searchText.length > 3000) {
      prepared.searchText = prepared.searchText.substring(0, 3000) + '...';
      prepared.searchTextTruncated = true;
    }

    // Ensure total object size is under 10KB (aggressive checking)
    let objectSize = JSON.stringify(prepared).length;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (objectSize > 9000 && attempts < maxAttempts) {
      attempts++;
      
      if (prepared.content && prepared.content.length > 1000) {
        const newLength = Math.max(1000, Math.floor(prepared.content.length * 0.7));
        prepared.content = prepared.content.substring(0, newLength) + '...';
        prepared.contentTruncated = true;
      }
      
      if (prepared.searchText && prepared.searchText.length > 500) {
        const newLength = Math.max(500, Math.floor(prepared.searchText.length * 0.7));
        prepared.searchText = prepared.searchText.substring(0, newLength) + '...';
        prepared.searchTextTruncated = true;
      }
      
      // Remove large metadata if needed
      if (prepared.metadata && JSON.stringify(prepared.metadata).length > 2000) {
        if (prepared.metadata.customFields) {
          delete prepared.metadata.customFields;
        }
      }
      
      objectSize = JSON.stringify(prepared).length;
      
      // If still too big, remove more fields
      if (objectSize > 9000) {
        if (prepared.summary && prepared.summary.length > 500) {
          prepared.summary = prepared.summary.substring(0, 500) + '...';
        }
        if (prepared.searchTags && prepared.searchTags.length > 10) {
          prepared.searchTags = prepared.searchTags.slice(0, 10);
        }
      }
    }
    
    // Final check - if still too big, log warning and skip problematic fields
    if (objectSize > 9000) {
      this.logger.warn(`Object still too large after truncation: ${objectSize} bytes`, {
        objectID: prepared.objectID,
        title: prepared.title?.substring(0, 50) + '...'
      });
      
      // Last resort - remove content entirely and other large fields
      delete prepared.content;
      delete prepared.searchText;
      delete prepared.metadata;
      delete prepared.hierarchicalCategories;
      delete prepared.searchableAttributes;
      delete prepared.rankingInfo;
      delete prepared._tags;
      prepared.contentRemoved = true;
      
      // Keep only essential fields for search
      const essentialFields = {
        objectID: prepared.objectID,
        id: prepared.id,
        type: prepared.type,
        title: prepared.title,
        summary: prepared.summary?.substring(0, 200) + '...',
        region: prepared.region,
        collectionSlug: prepared.collectionSlug,
        collectionName: prepared.collectionName,
        url: prepared.url,
        status: prepared.status,
        publishedDate: prepared.publishedDate,
        contentRemoved: true
      };
      
      return essentialFields;
    }

    const excludeFields = ['metadata.customFields'];
    excludeFields.forEach(field => {
      const keys = field.split('.');
      let current = prepared;
      for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]]) {
          current = current[keys[i]];
        } else {
          return;
        }
      }
      if (current && typeof current === 'object') {
        delete current[keys[keys.length - 1]];
      }
    });

    return prepared;
  }

  validateObjects(objects) {
    const valid = [];
    const invalid = [];

    for (const obj of objects) {
      if (this.isValidObject(obj)) {
        valid.push(obj);
      } else {
        invalid.push(obj);
      }
    }

    if (invalid.length > 0) {
      this.logger.warn(`Found ${invalid.length} invalid objects`, {
        invalidObjects: invalid.map(obj => ({ 
          objectID: obj.objectID, 
          issues: this.getValidationIssues(obj) 
        }))
      });
    }

    return valid;
  }

  isValidObject(obj) {
    if (!obj.objectID || typeof obj.objectID !== 'string') return false;
    if (!obj.title || typeof obj.title !== 'string' || obj.title.trim().length === 0) return false;
    if (!obj.type || typeof obj.type !== 'string') return false;
    
    return true;
  }

  getValidationIssues(obj) {
    const issues = [];
    
    if (!obj.objectID) issues.push('Missing objectID');
    if (!obj.title || obj.title.trim().length === 0) issues.push('Missing or empty title');
    if (!obj.type) issues.push('Missing type');
    
    return issues;
  }

  getOptimalIndexSettings() {
    return {
      searchableAttributes: [
        'title',
        'seoMetaTitle',
        'seoMetaDescription',
        'openGraphDescription',
        'summary',
        'content',
        'searchText',
        'tags',
        'category',
        'searchTags',
        'fullName',
        'position',
        'department'
      ],
      attributesForFaceting: [
        'searchable(type)',
        'searchable(region)',
        'searchable(collectionSlug)',
        'searchable(collectionName)',
        'searchable(category)',
        'searchable(tags)',
        'searchable(searchTags)',
        'searchable(locale.tag)',
        'searchable(locale.displayName)',
        'locale.isPrimary',
        'status',
        'publishYear',
        'eventType',
        'newsType',
        'reportType',
        'isUpcoming',
        'isPast',
        'includeInSearch',
        // Beyond The Obvious specific facets
        'searchable(categories)',
        'searchable(industries)',
        'searchable(insightsType)',
        'searchable(areasOfInterest)',
        'searchable(mediumType)',
        'searchable(contentType)',
        'featuredInsight'
      ],
      ranking: [
        'typo',
        'geo',
        'words',
        'filters',
        'proximity',
        'attribute',
        'exact',
        'custom'
      ],
      customRanking: [
        'desc(searchPriority)',
        'desc(publishedDate)'
        // Removed searchScore to let Algolia's natural exact matching take full precedence
        // The 'exact' criterion in the ranking array above will prioritize exact keyword matches
      ],
      attributesToHighlight: [
        'title',
        'summary',
        'content'
      ],
      attributesToSnippet: [
        'content:50',
        'summary:30'
      ],
      hitsPerPage: 20,
      maxValuesPerFacet: 100,
      // STRICT MATCHING: Only show exact or close matches
      typoTolerance: 'min', // Minimize typo tolerance - prioritize exact matches
      minWordSizefor1Typo: 6, // Increased from 4 - only allow 1 typo for words 6+ chars
      minWordSizefor2Typos: 10, // Increased from 8 - only allow 2 typos for words 10+ chars
      separatorsToIndex: '+#',
      removeWordsIfNoResults: 'none', // Changed from 'lastWords' - don't show far-fetched results
      queryLanguages: ['en'],
      // Additional strict matching settings
      advancedSyntax: true, // Enable exact phrase matching with quotes
      allowTyposOnNumericTokens: false // Don't allow typos in numbers
    };
  }

  async configureIndex() {
    await this.init();
    this.logger.step('Configuring Algolia index with optimal settings');
    try {
      const settings = this.getOptimalIndexSettings();
      await this.updateSettings(settings);
      this.logger.success('Index configured successfully');
    } catch (error) {
      this.logger.error('Failed to configure index', { error: error.message });
      throw error;
    }
  }

  logIndexingPreview(objects) {
    if (objects.length === 0) {
      this.logger.warn('No objects to preview');
      return;
    }

    const sample = objects.slice(0, 3);
    const stats = this.generateIndexingStats(objects);
    
    this.logger.info('Indexing Preview', {
      totalObjects: objects.length,
      sampleObjects: sample.map(obj => ({
        objectID: obj.objectID,
        type: obj.type,
        title: obj.title?.substring(0, 50) + '...',
        region: obj.region
      })),
      stats
    });
  }

  generateIndexingStats(objects) {
    const typeStats = {};
    const regionStats = {};
    let totalContentLength = 0;

    objects.forEach(obj => {
      typeStats[obj.type] = (typeStats[obj.type] || 0) + 1;
      regionStats[obj.region] = (regionStats[obj.region] || 0) + 1;

      if (obj.content) {
        totalContentLength += obj.content.length;
      }
    });

    return {
      byType: typeStats,
      byRegion: regionStats,
      averageContentLength: Math.round(totalContentLength / objects.length)
    };
  }

  /**
   * Get the Algolia client instance (for direct API calls)
   * @returns {Object} - Algolia client
   */
  getClient() {
    if (!this.initialized) {
      throw new Error('Algolia client not initialized. Call init() first.');
    }
    return this.client;
  }

  /**
   * Get the Algolia index instance (for direct index operations)
   * @returns {Object} - Algolia index
   */
  getIndex() {
    if (!this.initialized) {
      throw new Error('Algolia client not initialized. Call init() first.');
    }
    return this.index;
  }
}

export default new AlgoliaClient();