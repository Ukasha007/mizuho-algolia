import logger from '../core/logger.js';
import cmsFetcher from '../webflow/cms-fetcher.js';
import cmsTransformer from '../transformers/cms-transformer.js';
import algoliaClient from '../algolia/client.js';
import { CMS_COLLECTIONS, getConfiguredCollections } from '../constants/collections.js';

const processorLogger = logger.setContext('WebhookProcessor');

class WebhookProcessor {
  constructor() {
    this.logger = processorLogger;
  }

  async processWebhookEvent(triggerType, webhookData) {
    this.logger.info(`Processing webhook event: ${triggerType}`, {
      itemId: webhookData.itemId,
      collectionId: webhookData.collectionId,
      isDraft: webhookData.isDraft,
      isArchived: webhookData.isArchived
    });

    // Get collection configuration
    const collectionConfig = this.getCollectionConfig(webhookData.collectionId);

    if (!collectionConfig) {
      throw new Error(`Collection ${webhookData.collectionId} not found in configuration`);
    }

    // Only process Beyond the Obvious collection
    if (collectionConfig.id !== 'beyond-the-obvious') {
      this.logger.info('Ignoring webhook for non-BTO collection', {
        collectionId: collectionConfig.id,
        collectionName: collectionConfig.name
      });
      return {
        processed: false,
        reason: 'Not a Beyond the Obvious collection item'
      };
    }

    switch (triggerType) {
      case 'collection_item_created':
      case 'collection_item_changed':
      case 'collection_item_published':
        return await this.handleCreateOrUpdate(webhookData, collectionConfig);

      case 'collection_item_deleted':
      case 'collection_item_unpublished':
        return await this.handleDeleteOrUnpublish(webhookData, collectionConfig);

      default:
        throw new Error(`Unsupported trigger type: ${triggerType}`);
    }
  }

  async handleCreateOrUpdate(webhookData, collectionConfig) {
    this.logger.step('Handling item creation/update', {
      itemId: webhookData.itemId,
      collection: collectionConfig.name
    });

    try {
      // Skip draft and archived items
      if (webhookData.isDraft || webhookData.isArchived) {
        this.logger.info('Skipping draft or archived item', {
          itemId: webhookData.itemId,
          isDraft: webhookData.isDraft,
          isArchived: webhookData.isArchived
        });
        return {
          processed: false,
          reason: 'Item is draft or archived'
        };
      }

      // Fetch the full item data from Webflow
      const item = await cmsFetcher.fetchSingleItem(
        webhookData.collectionId,
        webhookData.itemId,
        collectionConfig
      );

      if (!item) {
        throw new Error(`Failed to fetch item ${webhookData.itemId}`);
      }

      // Transform for Algolia
      const transformedItems = cmsTransformer.transformForSearch([item], {
        type: 'cms',
        collectionSlug: collectionConfig.id,
        region: collectionConfig.region
      });

      if (transformedItems.length === 0) {
        throw new Error(`Failed to transform item ${webhookData.itemId}`);
      }

      // Index to Algolia
      const result = await algoliaClient.indexObjects(transformedItems, {
        clearIndex: false
      });

      this.logger.success('Successfully indexed item to Algolia', {
        itemId: webhookData.itemId,
        objectId: transformedItems[0].objectID,
        indexed: result.indexed
      });

      return {
        processed: true,
        action: 'indexed',
        objectId: transformedItems[0].objectID,
        itemsIndexed: result.indexed
      };
    } catch (error) {
      this.logger.error('Failed to handle item creation/update', {
        itemId: webhookData.itemId,
        error: error.message
      });
      throw error;
    }
  }

  async handleDeleteOrUnpublish(webhookData, collectionConfig) {
    this.logger.step('Handling item deletion/unpublish', {
      itemId: webhookData.itemId,
      collection: collectionConfig.name
    });

    try {
      // Construct the Algolia object ID
      const objectId = `cms_${webhookData.itemId}`;

      // Delete from Algolia
      await algoliaClient.deleteObjects([objectId]);

      this.logger.success('Successfully deleted item from Algolia', {
        itemId: webhookData.itemId,
        objectId
      });

      return {
        processed: true,
        action: 'deleted',
        objectId,
        itemsDeleted: 1
      };
    } catch (error) {
      this.logger.error('Failed to handle item deletion/unpublish', {
        itemId: webhookData.itemId,
        error: error.message
      });
      throw error;
    }
  }

  getCollectionConfig(webflowCollectionId) {
    const configuredCollections = getConfiguredCollections();
    return configuredCollections.find(c => c.webflowId === webflowCollectionId);
  }
}

export default new WebhookProcessor();
