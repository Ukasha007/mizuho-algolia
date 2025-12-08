import logger from '../core/logger.js';
import config from '../core/config.js';
import helpers from '../core/helpers.js';
import webflowClient from './client.js';
import taxonomyResolver from './taxonomy-resolver.js';
import { CMS_COLLECTIONS, getFieldMapping, getConfiguredCollections } from '../constants/collections.js';

class CMSFetcher {
  constructor() {
    this.logger = logger.setContext('CMSFetcher');
    this.collectionMappings = new Map();
  }

  async fetchAllCollections(options = {}) {
    this.logger.step('Starting CMS collections fetch');

    try {
      const { excludeCollections = [] } = options;
      let configuredCollections = getConfiguredCollections();

      // Filter out excluded collections (e.g., 'beyond-the-obvious' for webhook-managed collections)
      if (excludeCollections.length > 0) {
        const originalCount = configuredCollections.length;
        configuredCollections = configuredCollections.filter(
          c => !excludeCollections.includes(c.id)
        );

        if (configuredCollections.length < originalCount) {
          this.logger.info(`Excluded ${originalCount - configuredCollections.length} collection(s) from sync`, {
            excluded: excludeCollections
          });
        }
      }

      if (configuredCollections.length === 0) {
        this.logger.warn('No CMS collections configured in environment variables');
        return [];
      }

      this.logger.info(`Found ${configuredCollections.length} configured collections`, {
        collections: configuredCollections.map(c => ({ name: c.name, region: c.region }))
      });

      const processedData = [];

      for (const collectionConfig of configuredCollections) {
        try {
          const items = await this.fetchCollectionById(collectionConfig.webflowId, collectionConfig);
          processedData.push(...items);
        } catch (error) {
          this.logger.error(`Failed to process collection ${collectionConfig.name}`, {
            collectionId: collectionConfig.webflowId,
            error: error.message
          });
        }
      }

      this.logger.success(`Processed ${processedData.length} items from ${configuredCollections.length} collections`);
      return processedData;
    } catch (error) {
      this.logger.error('Failed to fetch CMS collections', { error: error.message });
      throw error;
    }
  }

  async fetchSpecificCollection(collectionSlug) {
    this.logger.step(`Fetching specific collection: ${collectionSlug}`);

    try {
      // Find the collection configuration by slug (e.g., 'americas-news')
      const configuredCollections = getConfiguredCollections();
      const collectionConfig = configuredCollections.find(c => c.id === collectionSlug);

      if (!collectionConfig) {
        throw new Error(`Collection "${collectionSlug}" not found in configuration`);
      }

      this.logger.info(`Found collection: ${collectionConfig.name}`, {
        region: collectionConfig.region,
        webflowId: collectionConfig.webflowId
      });

      // Fetch and process the collection
      const items = await this.fetchCollectionById(collectionConfig.webflowId, collectionConfig);

      this.logger.success(`Fetched ${items.length} items from ${collectionConfig.name}`);
      return items;

    } catch (error) {
      this.logger.error(`Failed to fetch specific collection ${collectionSlug}`, {
        error: error.message
      });
      throw error;
    }
  }

  async fetchSingleItem(webflowCollectionId, itemId, collectionConfig) {
    this.logger.step(`Fetching single item ${itemId} from collection ${collectionConfig.name}`);

    try {
      // Fetch the single item from Webflow
      const item = await webflowClient.getCollectionItem(webflowCollectionId, itemId);

      // Apply taxonomy resolution for Beyond The Obvious collection
      let itemToProcess = item;
      if (collectionConfig.id === 'beyond-the-obvious') {
        itemToProcess = await taxonomyResolver.resolveTaxonomyReferences(item, collectionConfig);
      }

      // Get field mapping and process the item
      const fieldMapping = this.getCollectionFieldMapping(collectionConfig);
      const processedItem = await this.processCollectionItem(itemToProcess, collectionConfig, fieldMapping);

      if (!processedItem) {
        throw new Error(`Failed to process item ${itemId}`);
      }

      this.logger.success(`Successfully fetched and processed item ${itemId}`, {
        collectionId: webflowCollectionId,
        itemSlug: processedItem.slug
      });

      return processedItem;
    } catch (error) {
      this.logger.error(`Failed to fetch single item ${itemId}`, {
        collectionId: webflowCollectionId,
        itemId,
        error: error.message
      });
      throw error;
    }
  }

  async fetchCollectionById(webflowCollectionId, collectionConfig) {
    this.logger.info(`Processing collection: ${collectionConfig.name} (${collectionConfig.region})`);

    try {
      const items = await webflowClient.getAllCollectionItems(webflowCollectionId);
      const fieldMapping = this.getCollectionFieldMapping(collectionConfig);
      const processedItems = [];

      for (const item of items) {
        try {
          // Apply taxonomy resolution for Beyond The Obvious collection
          let itemToProcess = item;
          if (collectionConfig.id === 'beyond-the-obvious') {
            itemToProcess = await taxonomyResolver.resolveTaxonomyReferences(item, collectionConfig);
          }

          const processedItem = await this.processCollectionItem(itemToProcess, collectionConfig, fieldMapping);
          if (processedItem) {
            processedItems.push(processedItem);
          }
        } catch (error) {
          this.logger.error(`Failed to process item ${item.id}`, {
            collectionId: webflowCollectionId,
            itemId: item.id,
            error: error.message
          });
        }
      }

      this.logger.success(`Processed ${processedItems.length}/${items.length} items from ${collectionConfig.name}`);
      return processedItems;
    } catch (error) {
      this.logger.error(`Failed to fetch collection data for ${collectionConfig.name}`, {
        error: error.message
      });
      throw error;
    }
  }

  async fetchCollectionData(collection) {
    this.logger.info(`Processing collection: ${collection.displayName} (${collection.slug})`);
    
    try {
      const items = await webflowClient.getAllCollectionItems(collection.id);
      const fieldMapping = this.getCollectionFieldMapping(collection);
      const processedItems = [];

      for (const item of items) {
        try {
          const processedItem = await this.processCollectionItem(item, collection, fieldMapping);
          if (processedItem) {
            processedItems.push(processedItem);
          }
        } catch (error) {
          this.logger.error(`Failed to process item ${item.id}`, {
            collectionId: collection.id,
            itemId: item.id,
            error: error.message
          });
        }
      }

      this.logger.success(`Processed ${processedItems.length}/${items.length} items from ${collection.slug}`);
      return processedItems;
    } catch (error) {
      this.logger.error(`Failed to fetch collection data for ${collection.slug}`, {
        error: error.message
      });
      throw error;
    }
  }

  async processCollectionItem(item, collectionConfig, fieldMapping) {
    if (!this.shouldProcessItem(item)) {
      return null;
    }

    const fieldData = item.fieldData || {};

    const processedItem = {
      id: item.id,
      cmsId: item.cmsLocaleId,
      type: this.getContentType(collectionConfig.id),
      collectionId: collectionConfig.webflowId,
      collectionSlug: collectionConfig.endpoint,
      collectionName: collectionConfig.name,
      title: this.extractField(fieldData, fieldMapping.title) || 'Untitled',
      slug: this.extractField(fieldData, fieldMapping.slug) || helpers.createSlug(item.id),
      url: this.buildItemUrl(collectionConfig.endpoint, fieldData, fieldMapping),
      summary: this.extractSummaryField(fieldData, fieldMapping, collectionConfig),
      content: this.extractField(fieldData, fieldMapping.content) || '',
      publishedDate: this.extractField(fieldData, fieldMapping.publishDate) || item.createdOn,
      lastModified: this.extractField(fieldData, fieldMapping.lastModified) || item.lastUpdated,
      region: collectionConfig.region || 'worldwide',
      tags: await this.extractTags(fieldData, fieldMapping),
      category: await this.extractCategory(fieldData, fieldMapping),
      featured: this.extractField(fieldData, fieldMapping.featured) || false,
      status: this.extractField(fieldData, fieldMapping.status) || 'published',
      searchText: '',
      metadata: {
        isDraft: item.isDraft || false,
        isArchived: item.isArchived || false,
        lastPublished: item.lastPublished,
        collectionType: collectionConfig.id,
        // Only add customFields for non-Beyond The Obvious collections
        ...(collectionConfig.id !== 'beyond-the-obvious' && {
          customFields: this.extractCustomFields(fieldData, fieldMapping)
        })
      }
    };

    // Extract attachment and external link fields for all applicable collections
    this.extractAttachmentAndLinkFields(processedItem, fieldData, fieldMapping);

    // Add Beyond The Obvious specific fields as clean, filterable top-level fields
    if (collectionConfig.id === 'beyond-the-obvious') {
      // Core content fields
      processedItem.featuredInsight = this.extractField(fieldData, fieldMapping.featuredInsight) || false;
      processedItem.mediumType = this.extractField(fieldData, fieldMapping.mediumType) || '';
      processedItem.contentType = this.extractField(fieldData, fieldMapping.type) || '';
      processedItem.metaDescription = this.extractField(fieldData, fieldMapping.metaDescription) || '';
      processedItem.metaKeywords = this.extractField(fieldData, fieldMapping.metaKeywords) || '';
      processedItem.seo = this.extractField(fieldData, fieldMapping.seo) || '';

      // Image field for Algolia display (URL only)
      const imageData = this.extractImageField(fieldData, fieldMapping.mainImage);
      if (imageData && imageData.url) {
        processedItem.image = imageData.url; // Just the URL string
      }

      // Clean taxonomy fields for filtering (resolved names only)
      processedItem.categories = this.extractField(fieldData, fieldMapping.otherInsightsCategoryResolved) || '';
      processedItem.industries = this.extractField(fieldData, fieldMapping.industryTypesResolved) || [];
      processedItem.insightsType = this.extractField(fieldData, fieldMapping.insightsTypeResolved) || '';
      processedItem.areasOfInterest = this.extractField(fieldData, fieldMapping.areasOfInterestResolved) || [];

      // Add resolved taxonomy names to search text for better discoverability
      const taxonomyTerms = [
        ...(processedItem.industries || []),
        processedItem.insightsType,
        processedItem.categories,
        ...(processedItem.areasOfInterest || [])
      ].filter(Boolean);

      if (taxonomyTerms.length > 0) {
        processedItem.taxonomySearchTerms = taxonomyTerms.join(' ');
      }

    }

    processedItem.searchText = this.buildSearchText(processedItem);

    this.logger.debug(`Processed item: ${processedItem.title}`, {
      id: processedItem.id,
      type: processedItem.type,
      region: processedItem.region,
      hasAttachments: !!processedItem.attachments,
      hasExternalLink: !!processedItem.externalLink,
      attachmentCount: processedItem.attachments?.length || 0
    });


    return processedItem;
  }

  extractField(fieldData, fieldName) {
    if (!fieldName || !fieldData) return '';

    const value = fieldData[fieldName];

    if (value === null || value === undefined) return '';

    if (typeof value === 'string') {
      const sanitized = helpers.sanitizeString(helpers.extractTextFromHtml(value));
      // Ensure we never return the string "undefined"
      return sanitized === 'undefined' ? '' : sanitized;
    }

    return value;
  }

  /**
   * Smart summary extraction - only uses the mapped summary field
   * Returns empty string if no summary found (never null or undefined)
   */
  extractSummaryField(fieldData, fieldMapping, collectionConfig) {
    // Only use the specifically mapped summary field
    if (fieldMapping.summary) {
      const value = this.extractField(fieldData, fieldMapping.summary);
      if (value && value.trim()) {
        this.logger.debug(`Found summary in field: ${fieldMapping.summary}`, {
          collection: collectionConfig.name,
          fieldName: fieldMapping.summary
        });
        return value;
      }
    }

    // No summary found - return empty string (not null/undefined)
    // This is intentional - not all collections have summaries
    return '';
  }

  extractImageField(fieldData, fieldName) {
    if (!fieldName || !fieldData) return null;

    const imageData = fieldData[fieldName];

    if (!imageData || typeof imageData !== 'object') return null;

    return {
      fileId: imageData.fileId || '',
      url: imageData.url || '',
      alt: imageData.alt || '',
      width: imageData.width,
      height: imageData.height
    };
  }

  extractFileField(fieldData, fieldName) {
    if (!fieldName || !fieldData) return null;

    const fileData = fieldData[fieldName];

    if (!fileData) return null;

    // Handle both single file and array of files
    if (Array.isArray(fileData)) {
      return fileData.map(file => this.extractSingleFile(file)).filter(Boolean);
    } else if (typeof fileData === 'object') {
      return this.extractSingleFile(fileData);
    }

    return null;
  }

  extractSingleFile(fileData) {
    if (!fileData || typeof fileData !== 'object') return null;

    return {
      fileId: fileData.fileId || '',
      url: fileData.url || '',
      fileName: fileData.fileName || fileData.name || '',
      fileSize: fileData.fileSize || fileData.size || 0,
      fileType: fileData.fileType || fileData.mimeType || '',
      alt: fileData.alt || ''
    };
  }

  extractExternalLinkField(fieldData, fieldName) {
    if (!fieldName || !fieldData) return null;

    const linkData = fieldData[fieldName];

    if (!linkData) return null;

    // Handle string URL directly
    if (typeof linkData === 'string') {
      return {
        url: linkData,
        title: '',
        isExternal: this.isExternalUrl(linkData)
      };
    }

    // Handle link object
    if (typeof linkData === 'object') {
      return {
        url: linkData.url || linkData.href || '',
        title: linkData.title || linkData.text || '',
        isExternal: this.isExternalUrl(linkData.url || linkData.href || '')
      };
    }

    return null;
  }

  isExternalUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // Check if it starts with http/https (external) vs relative path (internal)
    return url.startsWith('http://') || url.startsWith('https://');
  }

  extractAttachmentAndLinkFields(processedItem, fieldData, fieldMapping) {
    // Extract file attachments - try multiple possible field names
    const fileFields = [
      'documentAttachment',
      'reportAttachment',
      'pdfForDownload',
      'pdfAsset'
    ];

    const attachments = [];
    for (const fieldName of fileFields) {
      if (fieldMapping[fieldName]) {
        const fileData = this.extractFileField(fieldData, fieldMapping[fieldName]);
        if (fileData) {
          // Handle both single file and array of files
          if (Array.isArray(fileData)) {
            attachments.push(...fileData);
          } else {
            attachments.push(fileData);
          }
        }
      }
    }

    if (attachments.length > 0) {
      // Store just the URLs for cleaner Algolia data
      processedItem.attachments = attachments.map(file => file.url).filter(Boolean);

      // Add attachment info to search text for better discoverability
      const attachmentSearchTerms = attachments.map(file =>
        [file.fileName, file.alt, file.fileType].filter(Boolean).join(' ')
      ).filter(Boolean);

      if (attachmentSearchTerms.length > 0) {
        processedItem.attachmentSearchTerms = attachmentSearchTerms.join(' ');
      }
    }

    // Extract external links
    if (fieldMapping.externalLink) {
      const externalLink = this.extractExternalLinkField(fieldData, fieldMapping.externalLink);
      if (externalLink && externalLink.url) {
        // Store just the URL value as-is for cleaner Algolia data
        processedItem.externalLink = externalLink.url;

        // Add link title to search text if available
        if (externalLink.title) {
          processedItem.externalLinkSearchTerms = externalLink.title;
        }
      }
    }
  }

  async extractRegion(fieldData, fieldMapping, collection) {
    const regionField = this.extractField(fieldData, fieldMapping.region);
    
    if (regionField) {
      if (typeof regionField === 'string') {
        return helpers.normalizeRegion(regionField);
      }
      
      if (Array.isArray(regionField) && regionField.length > 0) {
        const resolved = await webflowClient.resolveReferences(
          regionField,
          this.getRegionCollectionId(collection)
        );
        return resolved.length > 0 ? helpers.normalizeRegion(resolved[0]) : 'worldwide';
      }
    }

    const collectionRegion = this.inferRegionFromCollection(collection);
    if (collectionRegion) {
      return collectionRegion;
    }

    return 'worldwide';
  }

  async extractTags(fieldData, fieldMapping) {
    const tagsField = this.extractField(fieldData, fieldMapping.tags);
    
    if (!tagsField) return [];
    
    if (typeof tagsField === 'string') {
      return tagsField.split(',').map(tag => helpers.sanitizeString(tag.trim())).filter(Boolean);
    }
    
    if (Array.isArray(tagsField)) {
      try {
        const resolved = await webflowClient.resolveReferences(tagsField, this.getTagsCollectionId());
        return resolved.filter(Boolean);
      } catch (error) {
        this.logger.warn('Failed to resolve tag references', { error: error.message });
        return [];
      }
    }
    
    return [];
  }

  async extractCategory(fieldData, fieldMapping) {
    const categoryField = this.extractField(fieldData, fieldMapping.category);
    
    if (!categoryField) return null;
    
    if (typeof categoryField === 'string') {
      return helpers.sanitizeString(categoryField);
    }
    
    if (Array.isArray(categoryField) && categoryField.length > 0) {
      try {
        const resolved = await webflowClient.resolveReferences(
          categoryField,
          this.getCategoryCollectionId()
        );
        return resolved.length > 0 ? resolved[0] : null;
      } catch (error) {
        this.logger.warn('Failed to resolve category reference', { error: error.message });
        return null;
      }
    }
    
    return null;
  }

  extractCustomFields(fieldData, fieldMapping) {
    const customFields = {};
    const standardFields = new Set(Object.values(fieldMapping));

    // Fields that we handle specially and should not be treated as custom fields
    const excludedFields = new Set([
      'document-attachment',
      'report-attachment',
      'pdf-for-download',
      'pdf-asset',
      'external-link',
      'link-url'
    ]);

    for (const [key, value] of Object.entries(fieldData)) {
      if (!standardFields.has(key) && !excludedFields.has(key) && value !== null && value !== undefined) {
        customFields[key] = value;
      }
    }

    return customFields;
  }

  buildSearchText(item) {
    const searchParts = [
      item.title,
      item.summary,
      item.content,
      item.category,
      ...(item.tags || []),
      item.taxonomySearchTerms,
      item.attachmentSearchTerms,
      item.externalLinkSearchTerms
    ].filter(Boolean);

    // Add Beyond The Obvious specific fields to search text
    if (item.mediumType || item.metaDescription || item.seo || item.contentType) {
      searchParts.push(
        item.mediumType,
        item.metaDescription,
        item.seo,
        item.contentType
      );

      // Add image alt text if available (from the clean image field)
      if (item.image && item.image.alt) {
        searchParts.push(item.image.alt);
      }
    }

    return searchParts.filter(Boolean).join(' ');
  }

  buildItemUrl(collectionSlug, fieldData, fieldMapping) {
    const slug = this.extractField(fieldData, fieldMapping.slug);
    const finalSlug = slug || (fieldData.title ? helpers.createSlug(fieldData.title) : 'item');

    // Map collections to their proper nested folder structure
    const urlMappings = {
      // Securities collections
      'securities-news': `/securities/securities-information/${finalSlug}`,

      // Asia Pacific country collections
      'singapore-information': `/asia-pacific/singapore/sp-information/${finalSlug}`,
      'taiwan-information': `/asia-pacific/taiwan/tw-information/${finalSlug}`,
      'hong-kong-information': `/asia-pacific/hong-kong/hk-information/${finalSlug}`,
      'malaysia-information': `/asia-pacific/malaysia/my-information/${finalSlug}`,
      'gift-city-information': `/asia-pacific/gift-city/gc-information/${finalSlug}`,

      // Americas country collections
      'brazil-information': `/americas/brazil/information/${finalSlug}`,

      // EMEA country collections
      'france-information': `/emea/france/fr-information/${finalSlug}`,
      'russia-information': `/emea/russia/ru-information/${finalSlug}`
    };

    // Return custom URL if mapping exists, otherwise use default structure
    if (urlMappings[collectionSlug]) {
      return urlMappings[collectionSlug];
    }

    // Default structure for other collections
    return `/${collectionSlug}/${finalSlug}`;
  }

  shouldProcessCollection(collection) {
    if (!collection || !collection.slug) return false;
    if (collection.isDeleted) return false;
    
    const excludedCollections = [
      'form-submissions',
      'comments',
      'audit-logs',
      'system',
      'temp',
      'test'
    ];
    
    return !excludedCollections.includes(collection.slug);
  }

  shouldProcessItem(item) {
    if (!item || !item.fieldData) return false;
    if (item.isDeleted) return false;
    if (item.isDraft) return false;
    if (item.isArchived) return false;
    
    // Only include published items
    const status = this.extractField(item.fieldData, 'status') || 'published';
    if (status.toLowerCase() === 'draft' || status.toLowerCase() === 'archived') return false;
    
    return true;
  }

  getContentType(collectionSlug) {
    // Check if collection name contains these keywords
    if (collectionSlug.includes('news')) {
      return 'news-article';
    }
    if (collectionSlug.includes('insights')) {
      return 'insight';
    }
    if (collectionSlug.includes('events')) {
      return 'event';
    }
    if (collectionSlug.includes('people')) {
      return 'person';
    }
    if (collectionSlug.includes('reports')) {
      return 'report';
    }
    if (collectionSlug.includes('research')) {
      return 'research';
    }

    // Default fallback
    return 'cms-item';
  }

  getCollectionType(collectionSlug) {
    return Object.values(CMS_COLLECTIONS).find(
      col => col.endpoint === collectionSlug
    )?.id || 'unknown';
  }

  getCollectionFieldMapping(collection) {
    if (!this.collectionMappings.has(collection.id)) {
      const collectionType = this.getCollectionType(collection.endpoint || collection.slug);
      const mapping = getFieldMapping(collectionType);

      // Debug EMEA News specifically
      if (collection.endpoint === 'emea-news') {
        this.logger.info(`🔍 EMEA News field mapping debug:`, {
          collectionName: collection.name,
          collectionId: collection.id,
          collectionEndpoint: collection.endpoint,
          collectionType: collectionType,
          hasDocumentAttachment: !!mapping.documentAttachment,
          hasExternalLink: !!mapping.externalLink,
          mappingKeys: Object.keys(mapping)
        });
      }

      this.collectionMappings.set(collection.id, mapping);
    }

    return this.collectionMappings.get(collection.id);
  }

  inferRegionFromCollection(collectionData) {
    const slug = collectionData.slug?.toLowerCase() || '';
    const name = collectionData.displayName?.toLowerCase() || '';

    const regionKeywords = {
      'japan': ['japan', 'japanese', 'jp'],
      'asia-pacific': ['asia', 'pacific', 'asiapacific', 'apac'],
      'americas': ['americas', 'america', 'us', 'usa'],
      'europe-middle-east-africa': ['europe', 'emea', 'middle-east', 'africa'],
      'mizuho-bank': ['bank'],
      'mizuho-securities': ['securities'],
      'mizuho-trust-banking': ['trust'],
      'mizuho-research-technologies': ['research', 'technology']
    };

    for (const [region, keywords] of Object.entries(regionKeywords)) {
      if (keywords.some(keyword => slug.includes(keyword) || name.includes(keyword))) {
        return region;
      }
    }

    return null;
  }

  getRegionCollectionId(collection) {
    return null;
  }

  getTagsCollectionId() {
    return null;
  }

  getCategoryCollectionId() {
    return null;
  }
}

export default new CMSFetcher();