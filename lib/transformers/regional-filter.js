import logger from '../core/logger.js';
import { REGIONS, getRegionById, isValidRegion } from '../constants/regions.js';

class RegionalFilter {
  constructor() {
    this.logger = logger.setContext('RegionalFilter');
  }

  filterByRegion(items, targetRegion) {
    if (!targetRegion || targetRegion === 'worldwide') {
      this.logger.info('No regional filtering applied - returning all items');
      return items;
    }

    if (!isValidRegion(targetRegion)) {
      this.logger.warn(`Invalid region specified: ${targetRegion}. Returning all items.`);
      return items;
    }

    const normalizedRegion = targetRegion.toLowerCase();
    this.logger.step(`Filtering ${items.length} items for region: ${normalizedRegion}`);

    const filteredItems = items.filter(item => {
      return this.itemMatchesRegion(item, normalizedRegion);
    });

    this.logger.success(`Filtered to ${filteredItems.length}/${items.length} items for region: ${normalizedRegion}`);
    return filteredItems;
  }

  itemMatchesRegion(item, targetRegion) {
    if (!item || !item.region) {
      return targetRegion === 'worldwide';
    }

    const itemRegion = item.region.toLowerCase();

    // Exact region match
    if (itemRegion === targetRegion) {
      return true;
    }

    // REMOVED: worldwide items should NOT automatically appear in specific region searches
    // When searching in a specific region (e.g., EMEA), only show items from that region
    // When searching in "worldwide", only show items with region="worldwide"

    // Check for sub-region relationships (e.g., Japan items in Asia-Pacific search)
    if (this.isSubRegionMatch(itemRegion, targetRegion)) {
      return true;
    }

    return false;
  }

  isSubRegionMatch(itemRegion, targetRegion) {
    const subRegionMap = {
      'asia-pacific': ['japan'],
      'mizuho-bank': ['japan', 'asia-pacific'],
      'mizuho-trust-banking': ['japan', 'asia-pacific'],
      'mizuho-securities': ['japan', 'asia-pacific', 'americas', 'europe-middle-east-africa'],
      'mizuho-research-technologies': ['japan', 'asia-pacific']
    };

    const parentRegions = subRegionMap[itemRegion] || [];
    return parentRegions.includes(targetRegion);
  }

  groupByRegion(items) {
    this.logger.step(`Grouping ${items.length} items by region`);

    const grouped = {
      worldwide: [],
      japan: [],
      'asia-pacific': [],
      americas: [],
      'europe-middle-east-africa': [],
      'mizuho-bank': [],
      'mizuho-trust-banking': [],
      'mizuho-securities': [],
      'mizuho-research-technologies': []
    };

    for (const item of items) {
      const region = item.region?.toLowerCase() || 'worldwide';
      
      if (grouped[region]) {
        grouped[region].push(item);
      } else {
        grouped.worldwide.push(item);
        this.logger.warn(`Unknown region ${region} for item ${item.id}, added to worldwide`);
      }
    }

    const stats = Object.entries(grouped).map(([region, items]) => ({
      region,
      count: items.length
    }));

    this.logger.success('Items grouped by region', { stats });
    return grouped;
  }

  getRegionStats(items) {
    const stats = {};
    
    for (const item of items) {
      const region = item.region?.toLowerCase() || 'worldwide';
      stats[region] = (stats[region] || 0) + 1;
    }

    return stats;
  }

  enrichWithRegionMetadata(items) {
    this.logger.step(`Enriching ${items.length} items with region metadata`);

    const enrichedItems = items.map(item => {
      const region = getRegionById(item.region);
      
      return {
        ...item,
        regionMetadata: {
          id: region.id,
          name: region.name,
          slug: region.slug,
          isGlobal: region.id === 'worldwide',
          isCorporate: region.id.startsWith('mizuho-'),
          isGeographic: !region.id.startsWith('mizuho-') && region.id !== 'worldwide'
        }
      };
    });

    this.logger.success(`Enriched ${enrichedItems.length} items with region metadata`);
    return enrichedItems;
  }

  validateRegionalData(items) {
    this.logger.step(`Validating regional data for ${items.length} items`);

    const issues = [];
    const validRegions = Object.keys(REGIONS).map(key => REGIONS[key].id);

    for (const item of items) {
      if (!item.region) {
        issues.push({
          itemId: item.id,
          type: 'missing_region',
          message: 'Item has no region specified'
        });
        continue;
      }

      if (!validRegions.includes(item.region.toLowerCase())) {
        issues.push({
          itemId: item.id,
          type: 'invalid_region',
          region: item.region,
          message: `Invalid region: ${item.region}`
        });
      }
    }

    if (issues.length > 0) {
      this.logger.warn(`Found ${issues.length} regional data issues`, { 
        issueTypes: this.groupIssuesByType(issues) 
      });
    } else {
      this.logger.success('All items have valid regional data');
    }

    return {
      isValid: issues.length === 0,
      issues,
      itemsWithIssues: issues.length,
      totalItems: items.length
    };
  }

  groupIssuesByType(issues) {
    const grouped = {};
    for (const issue of issues) {
      grouped[issue.type] = (grouped[issue.type] || 0) + 1;
    }
    return grouped;
  }

  createRegionQuery(region) {
    if (!region || region === 'worldwide') {
      // When searching worldwide, only show items with region="worldwide"
      return {
        filters: 'region:"worldwide"'
      };
    }

    const normalizedRegion = region.toLowerCase();
    const regionConfig = getRegionById(normalizedRegion);

    // FIXED: Only include items from the specific region
    // Do NOT include worldwide items in region-specific searches
    const query = {
      filters: `region:"${regionConfig.id}"`
    };

    // Include child regions if this is a parent region
    if (this.isParentRegion(normalizedRegion)) {
      const childRegions = this.getChildRegions(normalizedRegion);
      if (childRegions.length > 0) {
        const childFilters = childRegions.map(child => `region:"${child}"`).join(' OR ');
        query.filters += ` OR ${childFilters}`;
      }
    }

    return query;
  }

  isParentRegion(region) {
    const parentRegions = ['asia-pacific'];
    return parentRegions.includes(region);
  }

  getChildRegions(parentRegion) {
    const childMap = {
      'asia-pacific': ['japan']
    };

    return childMap[parentRegion] || [];
  }

  applyRegionalBoost(items, targetRegion) {
    if (!targetRegion || targetRegion === 'worldwide') {
      return items;
    }

    this.logger.step(`Applying regional boost for region: ${targetRegion}`);

    const boostedItems = items.map(item => {
      const boost = this.calculateRegionalBoost(item.region, targetRegion);
      
      return {
        ...item,
        searchScore: (item.searchScore || 1) * boost,
        regionalBoost: boost
      };
    });

    const avgBoost = boostedItems.reduce((sum, item) => sum + item.regionalBoost, 0) / boostedItems.length;
    this.logger.success(`Applied regional boost (avg: ${avgBoost.toFixed(2)}) to ${boostedItems.length} items`);

    return boostedItems;
  }

  calculateRegionalBoost(itemRegion, targetRegion) {
    if (!itemRegion) return 0.5;

    const normalizedItemRegion = itemRegion.toLowerCase();
    const normalizedTargetRegion = targetRegion.toLowerCase();

    if (normalizedItemRegion === normalizedTargetRegion) {
      return 2.0;
    }

    if (normalizedItemRegion === 'worldwide') {
      return 1.0;
    }

    if (this.isSubRegionMatch(normalizedItemRegion, normalizedTargetRegion)) {
      return 1.5;
    }

    return 0.3;
  }
}

export default new RegionalFilter();