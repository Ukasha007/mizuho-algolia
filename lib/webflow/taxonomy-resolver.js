import logger from '../core/logger.js';
import webflowClient from './client.js';

class TaxonomyResolver {
  constructor() {
    this.logger = logger.setContext('TaxonomyResolver');
    this.taxonomyCache = new Map();
  }

  async resolveTaxonomyReferences(item, collectionConfig) {
    if (collectionConfig.id !== 'beyond-the-obvious') {
      return item;
    }

    this.logger.debug(`Resolving taxonomy references for Beyond The Obvious item: ${item.id}`);

    try {
      const fieldData = item.fieldData || {};
      const resolvedItem = { ...item, fieldData: { ...fieldData } };

      // Resolve single reference fields based on actual Webflow field names
      if (fieldData['other-insights-category']) {
        resolvedItem.fieldData['other-insights-category-resolved'] = await this.resolveSingleReference(
          fieldData['other-insights-category'],
          'WEBFLOW_INSIGHTS_CATEGORIES_CMS_ID'
        );
      }

      // Handle area-of-interest (singular) field from actual Webflow data
      if (fieldData['area-of-interest']) {
        // Check if it's an array (multi-reference) or single value
        if (Array.isArray(fieldData['area-of-interest'])) {
          resolvedItem.fieldData['area-of-interest-resolved'] = await this.resolveMultipleReferences(
            fieldData['area-of-interest'],
            'WEBFLOW_AREAS_OF_INTEREST_CMS_ID'
          );
        } else {
          // Single reference
          resolvedItem.fieldData['area-of-interest-resolved'] = await this.resolveSingleReference(
            fieldData['area-of-interest'],
            'WEBFLOW_AREAS_OF_INTEREST_CMS_ID'
          );
        }
      }

      // Only try to resolve these fields if they exist in the data
      if (fieldData['insights-type']) {
        resolvedItem.fieldData['insights-type-resolved'] = await this.resolveSingleReference(
          fieldData['insights-type'],
          'WEBFLOW_INSIGHTS_TYPES_CMS_ID'
        );
      }

      if (fieldData['industry-types'] && Array.isArray(fieldData['industry-types'])) {
        resolvedItem.fieldData['industry-types-resolved'] = await this.resolveMultipleReferences(
          fieldData['industry-types'],
          'WEBFLOW_INDUSTRY_TYPES_CMS_ID'
        );
      }

      // Note: medium-type appears to be a plain text field based on the example, not a reference
      // If it becomes a reference field in the future, we can add it here

      this.logger.debug(`Successfully resolved taxonomy references for item: ${item.id}`);
      return resolvedItem;

    } catch (error) {
      this.logger.error(`Failed to resolve taxonomy references for item ${item.id}`, {
        error: error.message
      });
      // Return original item if resolution fails to prevent breaking the sync
      return item;
    }
  }

  async resolveSingleReference(referenceId, envVarName) {
    if (!referenceId) return null;

    try {
      const collectionId = process.env[envVarName];
      if (!collectionId) {
        this.logger.warn(`Taxonomy collection ID not found for ${envVarName}`);
        return null;
      }

      const taxonomyItems = await this.getTaxonomyItems(collectionId);
      const matchedItem = taxonomyItems.find(item => item.id === referenceId);

      return matchedItem ? this.extractItemName(matchedItem) : null;

    } catch (error) {
      this.logger.error(`Failed to resolve single reference ${referenceId}`, {
        envVar: envVarName,
        error: error.message
      });
      return null;
    }
  }

  async resolveMultipleReferences(referenceIds, envVarName) {
    if (!referenceIds || !Array.isArray(referenceIds) || referenceIds.length === 0) {
      return [];
    }

    try {
      const collectionId = process.env[envVarName];
      if (!collectionId) {
        this.logger.warn(`Taxonomy collection ID not found for ${envVarName}`);
        return [];
      }

      const taxonomyItems = await this.getTaxonomyItems(collectionId);
      const resolvedNames = [];

      for (const referenceId of referenceIds) {
        const matchedItem = taxonomyItems.find(item => item.id === referenceId);
        if (matchedItem) {
          const name = this.extractItemName(matchedItem);
          if (name) {
            resolvedNames.push(name);
          }
        }
      }

      return resolvedNames;

    } catch (error) {
      this.logger.error(`Failed to resolve multiple references`, {
        envVar: envVarName,
        referenceCount: referenceIds.length,
        error: error.message
      });
      return [];
    }
  }

  async getTaxonomyItems(collectionId) {
    if (this.taxonomyCache.has(collectionId)) {
      return this.taxonomyCache.get(collectionId);
    }

    try {
      this.logger.debug(`Fetching taxonomy items for collection: ${collectionId}`);
      const items = await webflowClient.getAllCollectionItems(collectionId);

      // Cache the items to avoid repeated API calls
      this.taxonomyCache.set(collectionId, items);

      this.logger.debug(`Cached ${items.length} taxonomy items for collection: ${collectionId}`);
      return items;

    } catch (error) {
      this.logger.error(`Failed to fetch taxonomy items for collection ${collectionId}`, {
        error: error.message
      });
      // Return empty array to prevent breaking the sync
      return [];
    }
  }

  extractItemName(taxonomyItem) {
    const fieldData = taxonomyItem.fieldData || {};

    // Try common name fields in order of preference
    const nameFields = ['name', 'title', 'label', 'display-name'];

    for (const field of nameFields) {
      if (fieldData[field] && typeof fieldData[field] === 'string') {
        return fieldData[field].trim();
      }
    }

    // Fallback to the item's slug or id if no name field is found
    if (fieldData.slug) {
      return fieldData.slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    this.logger.warn(`No name field found for taxonomy item ${taxonomyItem.id}`);
    return null;
  }

  clearCache() {
    this.taxonomyCache.clear();
    this.logger.info('Taxonomy cache cleared');
  }

  getCacheStats() {
    return {
      cachedCollections: this.taxonomyCache.size,
      collections: Array.from(this.taxonomyCache.keys())
    };
  }
}

export default new TaxonomyResolver();