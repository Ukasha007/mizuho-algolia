import { format } from 'date-fns';
import logger from '../core/logger.js';
import helpers from '../core/helpers.js';
import { SEARCH_PRIORITIES } from '../constants/collections.js';
import regionalFilter from './regional-filter.js';

class PageTransformer {
  constructor() {
    this.logger = logger.setContext('PageTransformer');
  }

  transformForSearch(pages, options = {}) {
    const { region, includeContent = true } = options;
    
    this.logger.step(`Transforming ${pages.length} pages for search indexing`);

    let transformedPages = pages.map(page => this.transformSinglePage(page, { includeContent }));

    if (region && region !== 'worldwide') {
      transformedPages = regionalFilter.filterByRegion(transformedPages, region);
    }

    transformedPages = this.enrichWithSearchMetadata(transformedPages);
    transformedPages = this.optimizeForSearch(transformedPages);

    this.logger.success(`Transformed ${transformedPages.length} pages for search`);
    return transformedPages;
  }

  transformSinglePage(page, options = {}) {
    const { includeContent = false } = options;

    // Handle both page.locale (from staticFetcher.processPage) and page.localeInfo (from webflowClient)
    const localeData = page.locale || page.localeInfo;

    // Determine the final type value (with default) to ensure consistency
    const finalType = page.type || 'static-page';

    const transformed = {
      objectID: `page_${page.id}${localeData ? `_${localeData.tag}` : ''}`,
      id: page.id,
      type: finalType,
      title: helpers.sanitizeString(page.title || ''),
      slug: page.slug || '',
      url: helpers.normalizeUrl(page.url || ''),
      summary: helpers.sanitizeString(page.summary || ''),
      region: page.region || 'worldwide',
      publishedDate: this.formatDate(page.publishedDate),
      lastModified: this.formatDate(page.lastModified),
      isHomePage: page.metadata?.isHomePage || false,
      searchText: helpers.sanitizeString(page.searchText || ''),
      searchPriority: this.calculateSearchPriority(page),
      tags: this.extractSearchTags(page, finalType),
      // Add SEO meta fields as separate searchable attributes
      seoMetaTitle: helpers.sanitizeString(page.metadata?.seo?.title || ''),
      seoMetaDescription: helpers.sanitizeString(page.metadata?.seo?.description || ''),
      openGraphDescription: helpers.sanitizeString(page.metadata?.seo?.openGraphDescription || ''),
      // Include locale information for multi-language support
      locale: localeData ? {
        id: localeData.id,
        cmsId: localeData.cmsId,
        displayName: localeData.displayName,
        tag: localeData.tag,
        isPrimary: localeData.isPrimary
      } : null,
      metadata: {
        ...page.metadata,
        wordCount: includeContent ? this.getWordCount(page.content) : 0,
        readingTime: includeContent ? this.calculateReadingTime(page.content) : 0,
        lastIndexed: new Date().toISOString()
      }
    };

    if (includeContent && page.content) {
      transformed.content = this.prepareContentForSearch(page.content);
    }

    // Calculate searchScore for custom ranking
    transformed.searchScore = this.calculateSearchScore(transformed);

    return transformed;
  }

  transformForAlgolia(pages, options = {}) {
    this.logger.step(`Transforming ${pages.length} pages for Algolia indexing`);

    const algoliaObjects = pages.map(page => {
      const transformed = this.transformSinglePage(page, options);
      
      return {
        ...transformed,
        _tags: this.buildAlgoliaTags(page),
        _geoloc: this.buildGeoLocation(page),
        hierarchicalCategories: this.buildHierarchicalCategories(page),
        searchableAttributes: this.getSearchableAttributes(page),
        rankingInfo: this.buildRankingInfo(page)
      };
    });

    this.logger.success(`Prepared ${algoliaObjects.length} objects for Algolia`);
    return algoliaObjects;
  }

  extractSearchTags(page, finalType = null) {
    const tags = new Set();

    // Use the finalType parameter if provided, otherwise fall back to page.type
    // This ensures the transformed type is always included in tags
    const typeToAdd = finalType || page.type;
    if (typeToAdd) tags.add(typeToAdd);

    if (page.region && page.region !== 'worldwide') tags.add(page.region);
    if (page.metadata?.isHomePage) tags.add('homepage');

    if (page.tags && Array.isArray(page.tags)) {
      page.tags.forEach(tag => tags.add(helpers.sanitizeString(tag)));
    }

    const contentTags = this.extractTagsFromContent(page);
    contentTags.forEach(tag => tags.add(tag));

    return Array.from(tags).filter(Boolean);
  }

  extractTagsFromContent(page) {
    const tags = [];
    const content = (page.content || '').toLowerCase();

    const businessKeywords = [
      'investment', 'banking', 'finance', 'securities', 'trust',
      'research', 'technology', 'corporate', 'institutional',
      'retail', 'digital', 'innovation', 'sustainability'
    ];

    businessKeywords.forEach(keyword => {
      if (content.includes(keyword)) {
        tags.push(keyword);
      }
    });

    return tags;
  }

  calculateSearchPriority(page) {
    let priority = SEARCH_PRIORITIES.MEDIUM;

    if (page.metadata?.isHomePage) {
      priority = SEARCH_PRIORITIES.HIGH;
    } else if (page.type === 'news-article') {
      priority = SEARCH_PRIORITIES.HIGH;
    } else if (page.featured) {
      priority = SEARCH_PRIORITIES.HIGH;
    } else if (page.type === 'static-page') {
      priority = SEARCH_PRIORITIES.MEDIUM;
    }

    return priority;
  }

  prepareContentForSearch(content) {
    if (!content) return '';

    let processedContent = helpers.extractTextFromHtml(content);
    processedContent = this.removeExcessiveWhitespace(processedContent);
    processedContent = this.truncateContent(processedContent, 5000);
    
    return helpers.sanitizeString(processedContent);
  }

  removeExcessiveWhitespace(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  truncateContent(content, maxLength) {
    if (!content || content.length <= maxLength) return content;
    
    const truncated = content.substring(0, maxLength);
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    
    if (lastSpaceIndex > maxLength * 0.8) {
      return truncated.substring(0, lastSpaceIndex) + '...';
    }
    
    return truncated + '...';
  }

  getWordCount(content) {
    if (!content) return 0;
    const text = helpers.extractTextFromHtml(content);
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  calculateReadingTime(content) {
    const wordCount = this.getWordCount(content);
    const wordsPerMinute = 200;
    return Math.ceil(wordCount / wordsPerMinute);
  }

  formatDate(dateString) {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      return format(date, 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
    } catch (error) {
      this.logger.warn(`Invalid date format: ${dateString}`);
      return null;
    }
  }

  buildAlgoliaTags(page) {
    // Ensure we use the same finalType logic as transformSinglePage
    const finalType = page.type || 'static-page';
    const tags = this.extractSearchTags(page, finalType);

    if (page.publishedDate) {
      const date = new Date(page.publishedDate);
      tags.push(`year_${date.getFullYear()}`);
      tags.push(`month_${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}`);
    }

    return tags;
  }

  buildGeoLocation(page) {
    const regionCoordinates = {
      'japan': { lat: 35.6762, lng: 139.6503 },
      'americas': { lat: 40.7128, lng: -74.0060 },
      'europe-middle-east-africa': { lat: 51.5074, lng: -0.1278 }
    };

    return regionCoordinates[page.region] || null;
  }

  buildHierarchicalCategories(page) {
    const categories = {
      lvl0: page.type || 'page',
      lvl1: `${page.type || 'page'} > ${page.region || 'worldwide'}`,
      lvl2: page.category ? `${page.type || 'page'} > ${page.region || 'worldwide'} > ${page.category}` : null
    };

    return Object.fromEntries(Object.entries(categories).filter(([, value]) => value !== null));
  }

  getSearchableAttributes(page) {
    const attributes = ['title', 'seoMetaTitle', 'seoMetaDescription', 'openGraphDescription', 'summary', 'searchText'];

    if (page.tags && page.tags.length > 0) {
      attributes.push('tags');
    }

    if (page.content) {
      attributes.push('content');
    }

    return attributes;
  }

  buildRankingInfo(page) {
    return {
      priority: page.searchPriority || SEARCH_PRIORITIES.MEDIUM,
      boost: this.calculateContentBoost(page),
      freshness: this.calculateFreshnessScore(page),
      engagement: this.calculateEngagementScore(page)
    };
  }

  calculateContentBoost(page) {
    let boost = 1.0;

    if (page.metadata?.isHomePage) boost *= 2.0;
    if (page.featured) boost *= 1.5;
    if (page.type === 'news-article') boost *= 1.3;
    
    const wordCount = this.getWordCount(page.content);
    if (wordCount > 500) boost *= 1.2;
    if (wordCount > 1000) boost *= 1.1;

    return Math.round(boost * 100) / 100;
  }

  calculateFreshnessScore(page) {
    if (!page.publishedDate) return 0.5;

    const now = new Date();
    const publishedDate = new Date(page.publishedDate);
    const daysSincePublished = (now - publishedDate) / (1000 * 60 * 60 * 24);

    if (daysSincePublished <= 7) return 1.0;
    if (daysSincePublished <= 30) return 0.8;
    if (daysSincePublished <= 90) return 0.6;
    if (daysSincePublished <= 365) return 0.4;
    
    return 0.2;
  }

  calculateEngagementScore(page) {
    let score = 0.5;

    if (page.metadata?.isHomePage) score = 1.0;
    else if (page.type === 'news-article') score = 0.9;
    else if (page.type === 'insight') score = 0.8;
    else if (page.featured) score = 0.8;

    return score;
  }

  calculateSearchScore(page) {
    // Composite score for custom ranking (0-1000 scale)
    let score = 0;

    // Priority score (0-400 points)
    const priorityPoints = {
      [SEARCH_PRIORITIES.HIGH]: 400,
      [SEARCH_PRIORITIES.MEDIUM]: 200,
      [SEARCH_PRIORITIES.LOW]: 100
    };
    score += priorityPoints[page.searchPriority] || 200;

    // Freshness score (0-200 points)
    if (page.publishedDate) {
      const now = new Date();
      const publishedDate = new Date(page.publishedDate);
      const daysSincePublished = (now - publishedDate) / (1000 * 60 * 60 * 24);

      if (daysSincePublished <= 7) score += 200;
      else if (daysSincePublished <= 30) score += 160;
      else if (daysSincePublished <= 90) score += 120;
      else if (daysSincePublished <= 365) score += 80;
      else score += 40;
    }

    // Content quality score (0-200 points)
    let qualityPoints = 0;
    if (page.title && page.title.length > 0) qualityPoints += 40;
    if (page.seoMetaTitle && page.seoMetaTitle.length > 0) qualityPoints += 40;
    if (page.seoMetaDescription && page.seoMetaDescription.length > 0) qualityPoints += 40;
    if (page.openGraphDescription && page.openGraphDescription.length > 0) qualityPoints += 40;
    if (page.searchText && page.searchText.length > 100) qualityPoints += 40;
    score += qualityPoints;

    // Special pages bonus (0-200 points)
    if (page.isHomePage) score += 200;
    else if (page.featured) score += 100;

    return score;
  }

  enrichWithSearchMetadata(pages) {
    return pages.map(page => ({
      ...page,
      searchMetadata: {
        indexedAt: new Date().toISOString(),
        searchableContent: this.buildSearchableContent(page),
        keyTerms: this.extractKeyTerms(page),
        contentHash: this.generateContentHash(page)
      }
    }));
  }

  buildSearchableContent(page) {
    return [
      page.title,
      page.seoMetaTitle,
      page.seoMetaDescription,
      page.openGraphDescription,
      page.summary,
      page.content,
      ...(page.tags || [])
    ].filter(Boolean).join(' ');
  }

  extractKeyTerms(page) {
    const content = this.buildSearchableContent(page).toLowerCase();
    const words = content.split(/\s+/).filter(word => word.length > 3);
    
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  generateContentHash(page) {
    const content = this.buildSearchableContent(page);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  optimizeForSearch(pages) {
    return pages
      .filter(page => page.title && page.title.length > 0)
      .sort((a, b) => (b.searchPriority || 0) - (a.searchPriority || 0));
  }
}

export default new PageTransformer();