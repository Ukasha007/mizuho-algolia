import { format } from 'date-fns';
import logger from '../core/logger.js';
import helpers from '../core/helpers.js';
import { SEARCH_PRIORITIES, CONTENT_TYPES } from '../constants/collections.js';
import regionalFilter from './regional-filter.js';
import dataSanitizer from '../security/data-sanitizer.js';

class CMSTransformer {
  constructor() {
    this.logger = logger.setContext('CMSTransformer');
  }

  transformForSearch(items, options = {}) {
    const { region, includeContent = true, collectionType } = options;
    
    this.logger.step(`Transforming ${items.length} CMS items for search indexing`);

    let transformedItems = items.map(item => this.transformSingleItem(item, { includeContent, collectionType }));

    if (region && region !== 'worldwide') {
      transformedItems = regionalFilter.filterByRegion(transformedItems, region);
    }

    transformedItems = this.enrichWithSearchMetadata(transformedItems);
    transformedItems = this.optimizeForSearch(transformedItems);

    const itemsWithAttachments = transformedItems.filter(item => item.attachments && item.attachments.length > 0);
    const itemsWithExternalLinks = transformedItems.filter(item => item.externalLink);

    this.logger.success(`Transformed ${transformedItems.length} CMS items for search`, {
      itemsWithAttachments: itemsWithAttachments.length,
      itemsWithExternalLinks: itemsWithExternalLinks.length
    });

    // Debug: Show a sample item with attachments
    if (itemsWithAttachments.length > 0) {
      this.logger.info(`Sample item with attachments:`, {
        title: itemsWithAttachments[0].title,
        hasDirectAttachmentsField: !!itemsWithAttachments[0].attachments,
        attachmentsValue: itemsWithAttachments[0].attachments,
        hasCustomFields: !!itemsWithAttachments[0].metadata?.customFields,
        customFieldsKeys: Object.keys(itemsWithAttachments[0].metadata?.customFields || {})
      });
    }

    return transformedItems;
  }

  transformSingleItem(item, options = {}) {
    const { includeContent = true, collectionType } = options;

    const cleanSummary = (summary) => {
      if (!summary || summary === 'undefined' || summary === 'null') return '';
      return helpers.sanitizeString(summary);
    };

    const transformed = {
      objectID: `cms_${item.id}`,
      id: item.id,
      cmsId: item.cmsId,
      type: item.type || CONTENT_TYPES.CMS_ITEM,
      collectionId: item.collectionId,
      collectionSlug: item.collectionSlug,
      collectionName: item.collectionName,
      title: helpers.sanitizeString(item.title || ''),
      slug: item.slug || '',
      url: helpers.normalizeUrl(item.url || ''),
      summary: cleanSummary(item.summary),
      region: item.region || 'worldwide',
      category: item.category || null,
      tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [],
      featured: Boolean(item.featured),
      status: item.status || 'published',
      publishedDate: this.formatDate(item.publishedDate),
      lastModified: this.formatDate(item.lastModified),
      searchText: helpers.sanitizeString(item.searchText || ''),
      searchPriority: this.calculateSearchPriority(item, collectionType),
      searchTags: this.buildSearchTags(item),
      // Add attachment and external link fields as direct top-level fields
      // For Beyond the Obvious: attachments is a string (single URL)
      // For other collections: attachments is an array of URLs
      ...(item.attachments && { attachments: item.attachments }),
      ...(item.externalLink && { externalLink: item.externalLink }),
      ...(item.attachmentSearchTerms && { attachmentSearchTerms: item.attachmentSearchTerms }),
      ...(item.externalLinkSearchTerms && { externalLinkSearchTerms: item.externalLinkSearchTerms }),

      metadata: {
        ...item.metadata,
        wordCount: this.getWordCount(item.content),
        readingTime: this.calculateReadingTime(item.content),
        lastIndexed: new Date().toISOString(),
        hasCustomFields: Object.keys(item.metadata?.customFields || {}).length > 0
      }
    };

    if (includeContent) {
      transformed.content = this.prepareContentForSearch(item.content);
    }

    if (item.metadata?.customFields) {
      transformed.customFields = this.processCustomFields(item.metadata.customFields);
    }

    return this.addTypeSpecificFields(transformed, item);
  }

  addTypeSpecificFields(transformed, originalItem) {
    switch (transformed.type) {
      case CONTENT_TYPES.NEWS_ARTICLE:
        return this.addNewsFields(transformed, originalItem);
      case CONTENT_TYPES.INSIGHT:
        return this.addInsightFields(transformed, originalItem);
      case CONTENT_TYPES.EVENT:
        return this.addEventFields(transformed, originalItem);
      case CONTENT_TYPES.PERSON:
        return this.addPersonFields(transformed, originalItem);
      case CONTENT_TYPES.REPORT:
        return this.addReportFields(transformed, originalItem);
      case CONTENT_TYPES.CMS_ITEM:
        return this.addCmsItemFields(transformed, originalItem);
      default:
        return transformed;
    }
  }

  addNewsFields(transformed, item) {
    return {
      ...transformed,
      headline: item.headline || transformed.title,
      excerpt: item.excerpt || transformed.summary,
      author: item.author || null,
      newsType: item.newsType || 'general',
      releaseDate: this.formatDate(item.releaseDate || item.publishedDate),
      // Preserve attachment and external link fields
      ...(item.attachments && { attachments: item.attachments }),
      ...(item.externalLink && { externalLink: item.externalLink }),
      ...(item.attachmentSearchTerms && { attachmentSearchTerms: item.attachmentSearchTerms }),
      ...(item.externalLinkSearchTerms && { externalLinkSearchTerms: item.externalLinkSearchTerms })
    };
  }

  addInsightFields(transformed, item) {
    return {
      ...transformed,
      subtitle: item.subtitle || null,
      keyPoints: Array.isArray(item.keyPoints) ? item.keyPoints : [],
      relatedTopics: Array.isArray(item.relatedTopics) ? item.relatedTopics : [],
      downloadLink: item.downloadLink || null,
      // Preserve attachment and external link fields
      ...(item.attachments && { attachments: item.attachments }),
      ...(item.externalLink && { externalLink: item.externalLink }),
      ...(item.attachmentSearchTerms && { attachmentSearchTerms: item.attachmentSearchTerms }),
      ...(item.externalLinkSearchTerms && { externalLinkSearchTerms: item.externalLinkSearchTerms })
    };
  }

  addEventFields(transformed, item) {
    return {
      ...transformed,
      startDate: this.formatDate(item.startDate),
      endDate: this.formatDate(item.endDate),
      location: item.location || null,
      eventType: item.eventType || 'general',
      registrationLink: item.registrationLink || null,
      isUpcoming: this.isUpcomingEvent(item.startDate),
      isPast: this.isPastEvent(item.endDate),
      // Preserve attachment and external link fields
      ...(item.attachments && { attachments: item.attachments }),
      ...(item.externalLink && { externalLink: item.externalLink }),
      ...(item.attachmentSearchTerms && { attachmentSearchTerms: item.attachmentSearchTerms }),
      ...(item.externalLinkSearchTerms && { externalLinkSearchTerms: item.externalLinkSearchTerms })
    };
  }

  addPersonFields(transformed, item) {
    return {
      ...transformed,
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      fullName: `${item.firstName || ''} ${item.lastName || ''}`.trim() || transformed.title,
      position: item.position || null,
      department: item.department || null,
      bio: this.prepareContentForSearch(item.bio || ''),
      photo: item.photo || null,
      // Preserve attachment and external link fields
      ...(item.attachments && { attachments: item.attachments }),
      ...(item.externalLink && { externalLink: item.externalLink }),
      ...(item.attachmentSearchTerms && { attachmentSearchTerms: item.attachmentSearchTerms }),
      ...(item.externalLinkSearchTerms && { externalLinkSearchTerms: item.externalLinkSearchTerms })
    };
  }

  addReportFields(transformed, item) {
    return {
      ...transformed,
      reportType: item.reportType || 'general',
      publishYear: this.extractYear(item.publishedDate),
      downloadLink: item.downloadLink || null,
      abstract: item.abstract || transformed.summary,
      // Preserve attachment and external link fields
      ...(item.attachments && { attachments: item.attachments }),
      ...(item.externalLink && { externalLink: item.externalLink }),
      ...(item.attachmentSearchTerms && { attachmentSearchTerms: item.attachmentSearchTerms }),
      ...(item.externalLinkSearchTerms && { externalLinkSearchTerms: item.externalLinkSearchTerms })
    };
  }

  addCmsItemFields(transformed, item) {
    // For Beyond The Obvious collection, preserve all BTO-specific fields
    if (item.collectionSlug === 'beyond-the-obvious') {
      return {
        ...transformed,
        // Preserve all BTO fields that were added in cms-fetcher
        ...(item.featuredInsight !== undefined && { featuredInsight: item.featuredInsight }),
        ...(item.mediumType && { mediumType: item.mediumType }),
        ...(item.contentType && { contentType: item.contentType }),
        ...(item.metaDescription && { metaDescription: item.metaDescription }),
        ...(item.metaKeywords && { metaKeywords: item.metaKeywords }),
        ...(item.seo && { seo: item.seo }),
        ...(item.image && { image: item.image }),
        ...(item.categories && { categories: item.categories }),
        ...(item.industries && { industries: item.industries }),
        ...(item.insightsType && { insightsType: item.insightsType }),
        ...(item.areasOfInterest && { areasOfInterest: item.areasOfInterest }),
        ...(item.taxonomySearchTerms && { taxonomySearchTerms: item.taxonomySearchTerms }),
        // Include attachment fields for Beyond The Obvious
        ...(item.attachments && { attachments: item.attachments }),
        ...(item.attachmentSearchTerms && { attachmentSearchTerms: item.attachmentSearchTerms }),
        // Include dedicated link and media fields
        ...(item.pdfDocument && { pdfDocument: item.pdfDocument }),
        ...(item.externalLink && { externalLink: item.externalLink }),
        ...(item.video && { video: item.video })
      };
    }

    // For other cms-item types, preserve attachment and external link fields
    return {
      ...transformed,
      // Include attachment fields for all other collections
      ...(item.attachments && { attachments: item.attachments }),
      ...(item.externalLink && { externalLink: item.externalLink }),
      ...(item.attachmentSearchTerms && { attachmentSearchTerms: item.attachmentSearchTerms }),
      ...(item.externalLinkSearchTerms && { externalLinkSearchTerms: item.externalLinkSearchTerms })
    };
  }

  buildSearchTags(item) {
    const tags = new Set();

    if (item.type) tags.add(item.type);
    if (item.collectionSlug) tags.add(item.collectionSlug);
    if (item.region && item.region !== 'worldwide') tags.add(item.region);
    if (item.category) tags.add(helpers.sanitizeString(item.category));
    if (item.featured) tags.add('featured');
    if (item.status) tags.add(item.status);

    if (Array.isArray(item.tags)) {
      item.tags.forEach(tag => tags.add(helpers.sanitizeString(tag)));
    }

    const contentTags = this.extractTagsFromContent(item);
    contentTags.forEach(tag => tags.add(tag));

    const temporalTags = this.generateTemporalTags(item);
    temporalTags.forEach(tag => tags.add(tag));

    return Array.from(tags).filter(Boolean);
  }

  extractTagsFromContent(item) {
    const tags = [];
    const content = (item.content || item.summary || '').toLowerCase();

    const businessKeywords = [
      'investment', 'banking', 'finance', 'securities', 'trust',
      'research', 'technology', 'corporate', 'institutional',
      'retail', 'digital', 'innovation', 'sustainability',
      'esg', 'compliance', 'risk', 'market', 'analysis'
    ];

    businessKeywords.forEach(keyword => {
      if (content.includes(keyword)) {
        tags.push(keyword);
      }
    });

    if (item.type === CONTENT_TYPES.NEWS_ARTICLE) {
      if (content.includes('announcement')) tags.push('announcement');
      if (content.includes('acquisition')) tags.push('acquisition');
      if (content.includes('partnership')) tags.push('partnership');
    }

    return tags;
  }

  generateTemporalTags(item) {
    const tags = [];
    
    if (item.publishedDate) {
      const date = new Date(item.publishedDate);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      
      tags.push(`year_${year}`);
      tags.push(`quarter_${year}_q${Math.ceil(month / 3)}`);
      tags.push(`month_${year}_${String(month).padStart(2, '0')}`);

      const now = new Date();
      const daysDiff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      
      if (daysDiff <= 7) tags.push('recent');
      if (daysDiff <= 30) tags.push('this_month');
      if (daysDiff <= 90) tags.push('this_quarter');
    }

    if (item.type === CONTENT_TYPES.EVENT) {
      if (this.isUpcomingEvent(item.startDate)) tags.push('upcoming');
      if (this.isPastEvent(item.endDate)) tags.push('past');
    }

    return tags;
  }

  calculateSearchPriority(item, collectionType) {
    let priority = SEARCH_PRIORITIES.MEDIUM;

    if (item.featured) {
      priority = SEARCH_PRIORITIES.HIGH;
    }

    switch (item.type) {
      case CONTENT_TYPES.NEWS_ARTICLE:
        priority = Math.max(priority, SEARCH_PRIORITIES.HIGH);
        break;
      case CONTENT_TYPES.INSIGHT:
        priority = Math.max(priority, SEARCH_PRIORITIES.HIGH);
        break;
      case CONTENT_TYPES.EVENT:
        if (this.isUpcomingEvent(item.startDate)) {
          priority = Math.max(priority, SEARCH_PRIORITIES.HIGH);
        }
        break;
      case CONTENT_TYPES.PERSON:
        priority = Math.max(priority, SEARCH_PRIORITIES.MEDIUM);
        break;
      default:
        priority = SEARCH_PRIORITIES.MEDIUM;
    }

    const freshnessBoost = this.calculateFreshnessBoost(item.publishedDate);
    if (freshnessBoost > 0.8) {
      priority = Math.max(priority, SEARCH_PRIORITIES.HIGH);
    }

    return priority;
  }

  prepareContentForSearch(content) {
    if (!content) return '';

    let processedContent = helpers.extractTextFromHtml(content);
    processedContent = this.removeExcessiveWhitespace(processedContent);
    processedContent = this.truncateContent(processedContent, 8000);
    
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

  processCustomFields(customFields) {
    const processed = {};
    
    for (const [key, value] of Object.entries(customFields)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'string') {
          processed[key] = helpers.sanitizeString(value);
        } else if (Array.isArray(value)) {
          processed[key] = value.filter(Boolean);
        } else {
          processed[key] = value;
        }
      }
    }
    
    return processed;
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
      if (isNaN(date.getTime())) return null;
      return format(date, 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
    } catch (error) {
      this.logger.warn(`Invalid date format: ${dateString}`);
      return null;
    }
  }

  extractYear(dateString) {
    if (!dateString) return null;
    try {
      return new Date(dateString).getFullYear();
    } catch {
      return null;
    }
  }

  isUpcomingEvent(startDate) {
    if (!startDate) return false;
    try {
      const eventDate = new Date(startDate);
      const now = new Date();
      return eventDate > now;
    } catch {
      return false;
    }
  }

  isPastEvent(endDate) {
    if (!endDate) return false;
    try {
      const eventDate = new Date(endDate);
      const now = new Date();
      return eventDate < now;
    } catch {
      return false;
    }
  }

  calculateFreshnessBoost(publishedDate) {
    if (!publishedDate) return 0.5;

    try {
      const now = new Date();
      const pubDate = new Date(publishedDate);
      const daysSincePublished = (now - pubDate) / (1000 * 60 * 60 * 24);

      if (daysSincePublished <= 1) return 1.0;
      if (daysSincePublished <= 7) return 0.9;
      if (daysSincePublished <= 30) return 0.7;
      if (daysSincePublished <= 90) return 0.5;
      if (daysSincePublished <= 365) return 0.3;
      
      return 0.1;
    } catch {
      return 0.5;
    }
  }

  enrichWithSearchMetadata(items) {
    return items.map(item => ({
      ...item,
      searchMetadata: {
        indexedAt: new Date().toISOString(),
        searchableContent: this.buildSearchableContent(item),
        keyTerms: this.extractKeyTerms(item),
        contentHash: this.generateContentHash(item),
        searchScore: this.calculateSearchScore(item)
      }
    }));
  }

  buildSearchableContent(item) {
    const parts = [
      item.title,
      item.summary,
      item.content,
      item.category,
      ...(item.tags || []),
      ...(item.searchTags || [])
    ];

    if (item.type === CONTENT_TYPES.PERSON) {
      parts.push(item.fullName, item.position, item.department);
    }

    return parts.filter(Boolean).join(' ');
  }

  extractKeyTerms(item) {
    const content = this.buildSearchableContent(item).toLowerCase();
    const words = content.split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));
    
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([word]) => word);
  }

  isStopWord(word) {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'is', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'will',
      'would', 'could', 'should', 'this', 'that', 'these', 'those', 'from'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  generateContentHash(item) {
    const content = this.buildSearchableContent(item);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  calculateSearchScore(item) {
    let score = 1.0;

    score *= (item.searchPriority || 1) / SEARCH_PRIORITIES.MEDIUM;
    score *= this.calculateFreshnessBoost(item.publishedDate);
    
    if (item.featured) score *= 1.5;
    if (item.metadata?.wordCount > 500) score *= 1.2;
    if (item.tags && item.tags.length > 3) score *= 1.1;

    return Math.round(score * 100) / 100;
  }

  optimizeForSearch(items) {
    return items
      .filter(item => item.title && item.title.length > 0)
      .filter(item => item.status === 'published' || !item.status)
      .sort((a, b) => {
        const scoreA = a.searchMetadata?.searchScore || a.searchPriority || 0;
        const scoreB = b.searchMetadata?.searchScore || b.searchPriority || 0;
        return scoreB - scoreA;
      });
  }

  transformForAlgolia(items, options = {}) {
    this.logger.step(`Transforming ${items.length} items for Algolia indexing`);

    const algoliaObjects = items.map(item => {
      const transformed = this.transformSingleItem(item, options);
      
      const algoliaObject = {
        ...transformed,
        _tags: transformed.searchTags,
        _geoloc: this.buildGeoLocation(item),
        hierarchicalCategories: this.buildHierarchicalCategories(item),
        searchableAttributes: this.getSearchableAttributes(item),
        rankingInfo: this.buildRankingInfo(item)
      };
      
      // Sanitize the object for security
      const sanitized = dataSanitizer.sanitizeObject(algoliaObject);
      return sanitized;
    }).filter(Boolean); // Remove any null objects that were filtered out by sanitizer

    this.logger.success(`Prepared ${algoliaObjects.length} objects for Algolia (${items.length - algoliaObjects.length} filtered for security)`);
    return algoliaObjects;
  }

  buildGeoLocation(item) {
    const regionCoordinates = {
      'japan': { lat: 35.6762, lng: 139.6503 },
      'americas': { lat: 40.7128, lng: -74.0060 },
      'europe-middle-east-africa': { lat: 51.5074, lng: -0.1278 }
    };

    return regionCoordinates[item.region] || null;
  }

  buildHierarchicalCategories(item) {
    const categories = {
      lvl0: item.collectionName || item.type,
      lvl1: `${item.collectionName || item.type} > ${item.region || 'worldwide'}`,
      lvl2: item.category ? `${item.collectionName || item.type} > ${item.region || 'worldwide'} > ${item.category}` : null
    };

    return Object.fromEntries(Object.entries(categories).filter(([, value]) => value !== null));
  }

  getSearchableAttributes(item) {
    const attributes = ['title', 'summary', 'searchText', 'searchTags'];
    
    if (item.content) attributes.push('content');
    if (item.category) attributes.push('category');
    if (item.tags && item.tags.length > 0) attributes.push('tags');

    if (item.type === CONTENT_TYPES.PERSON) {
      attributes.push('fullName', 'position', 'department');
    }

    return attributes;
  }

  buildRankingInfo(item) {
    return {
      priority: item.searchPriority || SEARCH_PRIORITIES.MEDIUM,
      boost: this.calculateContentBoost(item),
      freshness: this.calculateFreshnessBoost(item.publishedDate),
      engagement: this.calculateEngagementScore(item),
      searchScore: item.searchMetadata?.searchScore || 1.0
    };
  }

  calculateContentBoost(item) {
    let boost = 1.0;

    if (item.featured) boost *= 1.8;
    if (item.type === CONTENT_TYPES.NEWS_ARTICLE) boost *= 1.4;
    if (item.type === CONTENT_TYPES.INSIGHT) boost *= 1.3;
    
    const wordCount = item.metadata?.wordCount || 0;
    if (wordCount > 1000) boost *= 1.3;
    else if (wordCount > 500) boost *= 1.1;

    if (item.tags && item.tags.length > 5) boost *= 1.1;

    return Math.round(boost * 100) / 100;
  }

  calculateEngagementScore(item) {
    let score = 0.5;

    switch (item.type) {
      case CONTENT_TYPES.NEWS_ARTICLE:
        score = 0.9;
        break;
      case CONTENT_TYPES.INSIGHT:
        score = 0.8;
        break;
      case CONTENT_TYPES.EVENT:
        score = this.isUpcomingEvent(item.startDate) ? 0.9 : 0.6;
        break;
      case CONTENT_TYPES.PERSON:
        score = 0.7;
        break;
      default:
        score = 0.6;
    }

    if (item.featured) score = Math.min(1.0, score * 1.2);

    return score;
  }
}

export default new CMSTransformer();