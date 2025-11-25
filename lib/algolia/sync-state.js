import algoliaClient from './client.js';
import logger from '../core/logger.js';

/**
 * Sync State Manager
 *
 * Stores and retrieves last sync timestamps using Algolia's index metadata.
 * This allows us to track when we last synced without needing a separate database.
 */
class SyncStateManager {
  constructor() {
    this.logger = logger.setContext('SyncStateManager');
    this.stateObjectId = 'sync-state-metadata';
  }

  /**
   * Get the last sync time for a specific sync type
   * @param {string} syncType - Type of sync (e.g., 'static-pages', 'cms-collection')
   * @returns {Promise<Date|null>} - Last sync time or null if never synced
   */
  async getLastSyncTime(syncType = 'static-pages') {
    try {
      await algoliaClient.init();
      const client = algoliaClient.getClient();
      const index = client.initIndex(algoliaClient.indexName);

      // Try to get the state object
      const stateObject = await index.getObject(this.stateObjectId);

      if (stateObject && stateObject.lastSyncTimes && stateObject.lastSyncTimes[syncType]) {
        const lastSyncTime = new Date(stateObject.lastSyncTimes[syncType]);
        this.logger.info(`Last sync time retrieved for ${syncType}`, {
          syncType,
          lastSyncTime: lastSyncTime.toISOString()
        });
        return lastSyncTime;
      }

      this.logger.info(`No previous sync found for ${syncType}`);
      return null;
    } catch (error) {
      if (error.status === 404) {
        this.logger.info(`State object not found - first sync for ${syncType}`);
        return null;
      }
      this.logger.error('Failed to get last sync time', { error: error.message });
      throw error;
    }
  }

  /**
   * Update the last sync time for a specific sync type
   * @param {string} syncType - Type of sync
   * @param {Date} timestamp - The sync timestamp (defaults to now)
   */
  async setLastSyncTime(syncType = 'static-pages', timestamp = new Date()) {
    try {
      await algoliaClient.init();
      const client = algoliaClient.getClient();
      const index = client.initIndex(algoliaClient.indexName);

      // Get existing state or create new
      let stateObject;
      try {
        stateObject = await index.getObject(this.stateObjectId);
      } catch (error) {
        if (error.status === 404) {
          stateObject = {
            objectID: this.stateObjectId,
            type: 'metadata',
            lastSyncTimes: {}
          };
        } else {
          throw error;
        }
      }

      // Update the sync time for this type
      stateObject.lastSyncTimes = stateObject.lastSyncTimes || {};
      stateObject.lastSyncTimes[syncType] = timestamp.toISOString();
      stateObject.lastUpdated = new Date().toISOString();

      // Save back to Algolia
      await index.saveObject(stateObject);

      this.logger.success(`Sync time updated for ${syncType}`, {
        syncType,
        timestamp: timestamp.toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to set last sync time', { error: error.message });
      throw error;
    }
  }

  /**
   * Get sync statistics
   * @returns {Promise<Object>} - Sync state for all types
   */
  async getSyncState() {
    try {
      await algoliaClient.init();
      const client = algoliaClient.getClient();
      const index = client.initIndex(algoliaClient.indexName);

      const stateObject = await index.getObject(this.stateObjectId);
      return stateObject;
    } catch (error) {
      if (error.status === 404) {
        return {
          objectID: this.stateObjectId,
          type: 'metadata',
          lastSyncTimes: {},
          message: 'No syncs performed yet'
        };
      }
      throw error;
    }
  }

  /**
   * Reset sync state (for debugging or full re-sync)
   * @param {string} syncType - Type to reset, or 'all' to reset everything
   */
  async resetSyncState(syncType = 'all') {
    try {
      await algoliaClient.init();
      const client = algoliaClient.getClient();
      const index = client.initIndex(algoliaClient.indexName);

      if (syncType === 'all') {
        // Delete the entire state object
        await index.deleteObject(this.stateObjectId);
        this.logger.info('All sync state reset');
      } else {
        // Just remove one sync type
        const stateObject = await index.getObject(this.stateObjectId);
        if (stateObject.lastSyncTimes) {
          delete stateObject.lastSyncTimes[syncType];
          await index.saveObject(stateObject);
          this.logger.info(`Sync state reset for ${syncType}`);
        }
      }
    } catch (error) {
      if (error.status === 404) {
        this.logger.info('No state to reset');
        return;
      }
      this.logger.error('Failed to reset sync state', { error: error.message });
      throw error;
    }
  }
}

export default new SyncStateManager();
