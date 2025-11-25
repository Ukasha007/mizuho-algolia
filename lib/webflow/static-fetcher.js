import logger from '../core/logger.js';
import config from '../core/config.js';
import helpers from '../core/helpers.js';
import webflowClient from './client.js';
import { getRegionById } from '../constants/regions.js';
import { getLocaleForFolder } from '../constants/locale-folders.js';

class StaticPageFetcher {
  constructor() {
    this.logger = logger.setContext('StaticPageFetcher');
  }

  async fetchAllPages(options = {}) {
    const syncConfig = config.getSyncConfig();
    const {
      batchSize = syncConfig.staticPagesBatchSize,
      maxConcurrent = syncConfig.staticPagesMaxConcurrent,
      fetchAllLocales = syncConfig.fetchAllLocales
    } = options;
    this.logger.step('Starting static pages fetch with rate limiting', {
      batchSize,
      maxConcurrent,
      fetchAllLocales
    });

    try {
      // Fetch pages with selective locale filtering (primary + specific secondary locales only)
      const pages = fetchAllLocales
        ? await webflowClient.getAllStaticPagesSelectiveLocales()
        : await webflowClient.getStaticPages();

      this.logger.info(`Found ${pages.length} pages to process${fetchAllLocales ? ' (across all locales)' : ''}`);
      
      // Show rate limit status before starting
      const rateLimitStatus = webflowClient.getRateLimitStatus();
      this.logger.info('Rate limit status before processing', rateLimitStatus);
      
      const processedPages = [];
      const batches = this.chunkArray(pages, batchSize);
      
      this.logger.info(`Processing ${pages.length} pages in ${batches.length} batches of ${batchSize}`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchNumber = i + 1;
        
        this.logger.info(`Processing batch ${batchNumber}/${batches.length} (${batch.length} pages)`);
        
        try {
          // Process batch with limited concurrency
          const batchResults = await this.processBatch(batch, maxConcurrent);
          processedPages.push(...batchResults.filter(Boolean));
          
          this.logger.success(`Completed batch ${batchNumber}: ${batchResults.length} pages processed`);
          
          // Show progress and rate limit status
          const currentStatus = webflowClient.getRateLimitStatus();
          this.logger.info(`Progress: ${processedPages.length}/${pages.length} pages completed`, {
            rateLimitRemaining: currentStatus.remaining,
            queueLength: currentStatus.queueLength
          });

          // Small delay between batches only if we're very close to rate limit
          // The queue system already handles rate limiting, so we don't need long waits here
          if (i < batches.length - 1 && currentStatus.remaining < 10) {
            const waitTime = 2000; // Just 2 seconds to be safe
            this.logger.info(`Rate limit low (${currentStatus.remaining} remaining), waiting ${waitTime / 1000}s before next batch`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          
        } catch (error) {
          this.logger.error(`Batch ${batchNumber} failed`, { error: error.message });
          // Continue with next batch instead of failing completely
        }
      }

      this.logger.success(`Processed ${processedPages.length}/${pages.length} static pages with rate limiting`);
      
      // Final cache and queue stats
      const finalStats = {
        cacheStats: webflowClient.getCacheStats(),
        queueStats: webflowClient.getQueueStats()
      };
      this.logger.info('Final processing stats', finalStats);
      
      return processedPages;
    } catch (error) {
      this.logger.error('Failed to fetch static pages', { error: error.message });
      throw error;
    }
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async processBatch(pages, maxConcurrent = 3) {
    const processedPages = [];
    const chunks = this.chunkArray(pages, maxConcurrent);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (page) => {
        try {
          return await this.processPage(page);
        } catch (error) {
          this.logger.error(`Failed to process page ${page.slug}`, {
            pageId: page.id,
            error: error.message
          });
          return null;
        }
      });
      
      const results = await Promise.all(promises);
      processedPages.push(...results.filter(Boolean));

      // Small delay between concurrent chunks (configurable via INTER_REQUEST_DELAY)
      const syncConfig = config.getSyncConfig();
      if (chunks.indexOf(chunk) < chunks.length - 1 && syncConfig.interRequestDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, syncConfig.interRequestDelay));
      }
    }
    
    return processedPages;
  }

  async processPage(page) {
    if (!this.shouldProcessPage(page)) {
      this.logger.debug(`Skipping page ${page.slug}`, { reason: 'filtered out' });
      return null;
    }

    this.logger.info(`Processing page: ${page.slug}`);

    try {
      // Fetch only metadata (not content/DOM) to get SEO information
      let metadata = null;
      if (page.slug && !this.isExcludedPage(page.slug)) {
        metadata = await this.fetchPageMetadata(page.id, page.localeInfo);
      }

      // Extract page name (title) with priority: SEO title > page title > slug
      const extractPageName = () => {
        // Priority 1: SEO meta title
        if (metadata?.seo?.title && helpers.isValidTitle(metadata.seo.title)) {
          return metadata.seo.title;
        }
        // Priority 2: Page title from metadata
        if (metadata?.title && helpers.isValidTitle(metadata.title)) {
          return metadata.title;
        }
        // Priority 3: Page title from initial fetch
        if (page.title && helpers.isValidTitle(page.title)) {
          return page.title;
        }
        // Priority 4: Convert slug to title
        return helpers.slugToTitle(page.slug);
      };

      // Extract SEO meta title (keep separate for searchability)
      const seoMetaTitle = metadata?.seo?.title || '';

      // Extract SEO meta description
      const seoMetaDescription = metadata?.seo?.description || '';

      // Extract Open Graph description (separate from SEO meta description)
      // Webflow API v2 typically provides this as openGraphDescription or ogDescription
      const openGraphDescription = metadata?.seo?.openGraphDescription ||
                                    metadata?.seo?.ogDescription ||
                                    metadata?.openGraph?.description || '';

      const pageData = {
        id: page.id,
        type: 'static-page',
        // Page name (display title)
        title: extractPageName(),
        slug: page.slug,
        url: this.buildPageUrl(page),
        publishedDate: page.createdOn,
        lastModified: page.lastModified,
        region: this.extractRegionFromPage(page),
        // Store SEO meta description as summary for searchability
        summary: seoMetaDescription,
        // Build search text from SEO fields including Open Graph description
        searchText: this.buildSearchText(seoMetaTitle, seoMetaDescription, openGraphDescription),
        // Include locale information if available
        locale: page.localeInfo ? {
          id: page.localeInfo.id,
          cmsId: page.localeInfo.cmsId,
          displayName: page.localeInfo.displayName,
          tag: page.localeInfo.tag,
          isPrimary: page.localeInfo.isPrimary
        } : null,
        metadata: {
          isHomePage: page.slug === 'home' || page.slug === '',
          seo: {
            title: seoMetaTitle,
            description: seoMetaDescription,
            openGraphDescription: openGraphDescription,
            keywords: metadata?.seo?.keywords || []
          }
        }
      };

      this.logger.debug(`Processed page ${page.slug}`, {
        pageName: pageData.title,
        seoMetaTitle: seoMetaTitle ? 'present' : 'missing',
        seoMetaDescription: seoMetaDescription ? 'present' : 'missing',
        openGraphDescription: openGraphDescription ? 'present' : 'missing',
        region: pageData.region
      });

      return pageData;
    } catch (error) {
      this.logger.error(`Error processing page ${page.slug}`, { error: error.message });
      throw error;
    }
  }

  async fetchPageMetadata(pageId, localeInfo) {
    try {
      this.logger.debug(`Fetching metadata for page ID: ${pageId}`);

      // Fetch only page metadata, not DOM content
      const options = {};
      if (localeInfo && !localeInfo.isPrimary) {
        options.localeId = localeInfo.id;
      }

      const metadata = await webflowClient.getPageMetadata(pageId, options);

      this.logger.debug(`Successfully fetched metadata for page ${pageId}`, {
        hasTitle: !!metadata?.title,
        hasSeoTitle: !!metadata?.seo?.title,
        hasSeoDescription: !!metadata?.seo?.description
      });

      return metadata;
    } catch (error) {
      this.logger.warn(`Failed to fetch metadata for page ${pageId}`, {
        error: error.message,
        pageId
      });
      return null;
    }
  }

  extractContentFromWebflowDOM(nodes) {
    if (!nodes || !Array.isArray(nodes)) {
      return '';
    }

    let content = '';
    
    // Extract text from Webflow DOM nodes based on API v2 structure
    const extractFromNode = (node) => {
      if (!node || typeof node !== 'object') {
        return '';
      }
      
      let nodeContent = '';
      
      // Handle different node types as per Webflow API v2
      switch (node.type) {
        case 'text':
          // Extract from text node - check both html and text properties
          if (node.text) {
            if (node.text.text) {
              nodeContent += node.text.text + ' ';
            } else if (node.text.html) {
              // Strip HTML tags if only HTML is available
              nodeContent += this.stripHtmlTags(node.text.html) + ' ';
            }
          }
          break;
          
        case 'image':
          // Add alt text from images for better searchability
          if (node.image && node.image.alt) {
            nodeContent += node.image.alt + ' ';
          }
          break;
          
        case 'select':
          // Add option texts from select elements
          if (node.choices && Array.isArray(node.choices)) {
            node.choices.forEach(choice => {
              if (choice.text) {
                nodeContent += choice.text + ' ';
              }
            });
          }
          break;
          
        case 'text-input':
          // Add placeholder text
          if (node.placeholder) {
            nodeContent += node.placeholder + ' ';
          }
          break;
          
        case 'submit-button':
          // Add button value and waiting text
          if (node.value) {
            nodeContent += node.value + ' ';
          }
          if (node.waitingText) {
            nodeContent += node.waitingText + ' ';
          }
          break;
          
        case 'component-instance':
          // Extract from component property overrides
          if (node.propertyOverrides && Array.isArray(node.propertyOverrides)) {
            node.propertyOverrides.forEach(override => {
              if (override.text) {
                if (override.text.text) {
                  nodeContent += override.text.text + ' ';
                } else if (override.text.html) {
                  nodeContent += this.stripHtmlTags(override.text.html) + ' ';
                }
              }
            });
          }
          break;
          
        default:
          // Handle any other node types by checking for common properties
          if (node.text) {
            if (typeof node.text === 'string') {
              nodeContent += node.text + ' ';
            } else if (node.text.text) {
              nodeContent += node.text.text + ' ';
            } else if (node.text.html) {
              nodeContent += this.stripHtmlTags(node.text.html) + ' ';
            }
          }
          break;
      }
      
      // Recursively extract from children if they exist
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          nodeContent += extractFromNode(child);
        }
      }
      
      return nodeContent;
    };
    
    // Extract content from all DOM nodes
    for (const node of nodes) {
      content += extractFromNode(node);
    }
    
    // Clean up the content
    return content.trim().replace(/\s+/g, ' ');
  }

  stripHtmlTags(html) {
    if (!html) return '';
    // Simple HTML tag removal - could be enhanced with a proper HTML parser if needed
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  extractSummaryFromContent(content) {
    if (!content) return '';
    
    // Take first 200 characters for summary
    const summary = content.substring(0, 200);
    return summary.endsWith(' ') ? summary.trim() : summary.trim() + '...';
  }

  extractSEOFromWebflowDOM(nodes) {
    // Extract SEO-relevant content from DOM nodes
    // This is basic extraction - page metadata will provide better SEO info
    const content = this.extractContentFromWebflowDOM(nodes);
    
    return {
      title: '',
      description: content.length > 160 ? content.substring(0, 160) + '...' : content,
      keywords: []
    };
  }

  extractMainContent(root) {
    // Remove unwanted elements first
    const unwantedSelectors = [
      'nav', 'header', 'footer', 'aside', 
      '.navigation', '.nav', '.sidebar', '.menu',
      'script', 'style', 'noscript', 
      '.breadcrumb', '.social-share',
      '[class*="cookie"]', '[class*="popup"]'
    ];

    unwantedSelectors.forEach(selector => {
      root.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Try specific content selectors
    const selectors = [
      'main',
      '[role="main"]', 
      '.main-content',
      '.content',
      '.page-content',
      'article',
      '.post-content',
      '.entry-content',
      '.container .content',
      '.wrapper .content'
    ];

    for (const selector of selectors) {
      const element = root.querySelector(selector);
      if (element) {
        const content = helpers.extractTextFromHtml(element.innerHTML);
        if (content && content.trim().length > 50) {
          return content;
        }
      }
    }

    // Fallback to body content
    const body = root.querySelector('body');
    if (body) {
      return helpers.extractTextFromHtml(body.innerHTML);
    }

    return helpers.extractTextFromHtml(root.innerHTML);
  }

  extractSummary(root, content) {
    const metaDescription = root.querySelector('meta[name="description"]');
    if (metaDescription) {
      return metaDescription.getAttribute('content') || '';
    }

    const ogDescription = root.querySelector('meta[property="og:description"]');
    if (ogDescription) {
      return ogDescription.getAttribute('content') || '';
    }

    const firstParagraph = root.querySelector('p');
    if (firstParagraph) {
      return helpers.extractTextFromHtml(firstParagraph.innerHTML);
    }

    return content.slice(0, 250) + (content.length > 250 ? '...' : '');
  }

  extractOpenGraph(root) {
    const ogTags = root.querySelectorAll('meta[property^="og:"]');
    const openGraph = {};

    ogTags.forEach(tag => {
      const property = tag.getAttribute('property');
      const content = tag.getAttribute('content');
      if (property && content) {
        const key = property.replace('og:', '');
        openGraph[key] = content;
      }
    });

    return openGraph;
  }

  extractSEO(root) {
    const title = root.querySelector('title')?.text || '';
    const description = root.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const keywords = root.querySelector('meta[name="keywords"]')?.getAttribute('content') || '';
    const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';

    return {
      title,
      description,
      keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
      canonical
    };
  }

  buildSearchText(seoTitle, seoDescription, openGraphDescription) {
    return [seoTitle, seoDescription, openGraphDescription].filter(Boolean).join(' ');
  }

  shouldProcessPage(page) {
    // Skip deleted/archived pages
    if (page.isDeleted || page.archived) {
      this.logger.debug(`Skipping deleted/archived page: ${page.slug}`, { reason: 'deleted or archived' });
      return false;
    }

    // Skip pages without slugs
    if (!page.slug) {
      this.logger.debug(`Skipping page without slug`, { pageId: page.id });
      return false;
    }

    // Skip draft pages - only process published pages
    // Webflow uses 'draft' field (draft: true = not published, draft: false = published)
    if (page.draft === true) {
      this.logger.debug(`Skipping draft page: ${page.slug}`, { reason: 'page is draft' });
      return false;
    }

    // Skip branch pages (development branches)
    if (this.isBranchPage(page)) return false;

    // Skip excluded pages (404, password, etc.)
    if (this.isExcludedPage(page.slug)) return false;

    // REMOVED: Keep test and template pages - user wants them indexed
    // if (this.isTestOrTemplatePage(page)) return false;

    return true;
  }

  isExcludedPage(slug) {
    const excludedPages = [
      '404',
      '401',
      'password',
      'thank-you',
      'search',
      'sitemap',
      'robots',
      'manifest'
    ];

    const excludedPatterns = [
      /^utility-/,
      /^admin-/
      // REMOVED: test- and dev- patterns - user wants test pages indexed
      // /^test-/,
      // /^dev-/
    ];

    if (excludedPages.includes(slug)) return true;

    return excludedPatterns.some(pattern => pattern.test(slug));
  }

  isBranchPage(page) {
    // PREFERRED: Use Webflow's isBranch field (most reliable)
    if (page.isBranch === true) {
      this.logger.debug(`Skipping branch page: ${page.slug}`, {
        pageId: page.id,
        reason: 'isBranch flag is true'
      });
      return true;
    }

    // Also check slug for branch_ prefix (common pattern for branch pages)
    if (page.slug && typeof page.slug === 'string') {
      if (page.slug.startsWith('branch_') || page.slug.startsWith('branch-')) {
        this.logger.debug(`Skipping branch page by slug: ${page.slug}`, {
          reason: 'slug starts with branch_'
        });
        return true;
      }
    }

    // Check if page URL contains 'branch--' or 'branch_'
    if (page.url && typeof page.url === 'string') {
      if (page.url.includes('branch--') || page.url.includes('branch_')) {
        this.logger.debug(`Skipping branch page: ${page.slug}`, {
          url: page.url,
          reason: 'URL contains branch pattern'
        });
        return true;
      }
    }

    return false;
  }

  isTestOrTemplatePage(page) {
    const slug = page.slug?.toLowerCase() || '';
    const title = page.title?.toLowerCase() || '';

    // Keywords that indicate test or template pages
    const testTemplateKeywords = [
      'test',
      'testing',
      'template',
      'sample',
      'example',
      'demo',
      'prototype'
    ];

    // Check if slug or title contains any test/template keywords
    const hasTestTemplateKeyword = testTemplateKeywords.some(keyword =>
      slug.includes(keyword) || title.includes(keyword)
    );

    if (hasTestTemplateKeyword) {
      this.logger.debug(`Skipping test/template page: ${page.slug}`, {
        pageId: page.id,
        title: page.title,
        reason: 'contains test or template keyword'
      });
      return true;
    }

    return false;
  }

  extractRegionFromPage(page) {
    const parentFolderId = page.parentId || page.parentFolder;

    // PRIORITY ORDER (CORRECTED):
    // 1. Check folder ID first (most reliable for locale pages)
    // 2. Fall back to URL parsing if no folder match
    // 3. Keyword matching as last resort
    // This ensures locale pages like /jp/asia-pacific/china/about
    // are assigned based on their folder (China -> asia-pacific)
    // rather than URL parsing (which would incorrectly assign to asia-pacific root)

    // Step 1: Check if this is a country-specific folder (e.g., Russia, China, Taiwan)
    // This is HIGHEST priority for locale pages
    if (parentFolderId) {
      const folderConfig = getLocaleForFolder(parentFolderId);

      if (folderConfig && folderConfig.parentRegion) {
        // Map parentRegion to our region format
        const regionMapping = {
          'emea': 'europe-middle-east-africa',
          'asia-pacific': 'asia-pacific',
          'americas': 'americas',
          'japan': 'japan'
        };
        const region = regionMapping[folderConfig.parentRegion] || folderConfig.parentRegion;
        this.logger.debug(`Assigned region from country folder: ${region}`, {
          pageSlug: page.slug,
          countryFolder: folderConfig.countryName,
          parentFolderId,
          localeTag: folderConfig.localeTag
        });
        return region;
      }

      // Step 2: Check if this is a top-level regional or entity folder
      const folderRegionMapping = {
        [process.env.FOLDER_AMERICAS]: 'americas',
        [process.env.FOLDER_EMEA]: 'europe-middle-east-africa',
        [process.env.FOLDER_ASIA_PACIFIC]: 'asia-pacific',
        [process.env.FOLDER_JAPAN]: 'japan',
        [process.env.FOLDER_BANK]: 'mizuho-bank',
        [process.env.FOLDER_SECURITIES]: 'mizuho-securities',
        [process.env.FOLDER_TRUST_BANKING]: 'mizuho-trust-banking',
        [process.env.FOLDER_INFORMATION_RESEARCH]: 'mizuho-research-technologies'
      };

      if (folderRegionMapping[parentFolderId]) {
        this.logger.debug(`Assigned region from top-level folder: ${folderRegionMapping[parentFolderId]}`, {
          pageSlug: page.slug,
          parentFolderId
        });
        return folderRegionMapping[parentFolderId];
      }
    }

    // Step 3: Parse URL path structure as fallback (for pages without folder IDs)
    // This handles pages like /americas/about or /asia-pacific/services
    const url = page.publishedPath || '';
    if (url) {
      const urlSegments = url.split('/').filter(Boolean);

      // Check for regional path segments in URL
      const regionalPathMapping = {
        'americas': 'americas',
        'asia-pacific': 'asia-pacific',
        'europe-middle-east-africa': 'europe-middle-east-africa',
        'emea': 'europe-middle-east-africa',
        'japan': 'japan',
        'mizuho-bank': 'mizuho-bank',
        'mizuho-securities': 'mizuho-securities',
        'mizuho-trust-banking': 'mizuho-trust-banking',
        'mizuho-research-technologies': 'mizuho-research-technologies'
      };

      for (const segment of urlSegments) {
        const normalizedSegment = segment.toLowerCase();
        if (regionalPathMapping[normalizedSegment]) {
          this.logger.debug(`Assigned region from URL path: ${regionalPathMapping[normalizedSegment]}`, {
            pageSlug: page.slug,
            urlPath: url,
            matchedSegment: normalizedSegment
          });
          return regionalPathMapping[normalizedSegment];
        }
      }
    }

    // Step 4: Fallback to keyword-based detection
    const slug = page.slug?.toLowerCase() || '';
    const title = page.title?.toLowerCase() || '';

    const regionKeywords = {
      'japan': ['japan', 'japanese', 'jp'],
      'asia-pacific': ['asia', 'pacific', 'asiapacific', 'apac'],
      'americas': ['americas', 'america', 'us', 'usa', 'north-america'],
      'europe-middle-east-africa': ['europe', 'emea', 'middle-east', 'africa', 'european'],
      'mizuho-bank': ['bank', 'banking'],
      'mizuho-securities': ['securities', 'trading', 'investment'],
      'mizuho-trust-banking': ['trust', 'trust-banking'],
      'mizuho-research-technologies': ['research', 'technology']
    };

    for (const [region, keywords] of Object.entries(regionKeywords)) {
      if (keywords.some(keyword => slug.includes(keyword) || title.includes(keyword))) {
        this.logger.debug(`Assigned region from keyword match: ${region}`, {
          pageSlug: page.slug,
          slug,
          title
        });
        return region;
      }
    }

    // Step 5: Default to worldwide if no match found
    // This includes pages without parentFolderId (root level pages)
    this.logger.debug(`Assigned region: worldwide (default fallback)`, {
      pageSlug: page.slug,
      parentFolderId: parentFolderId || 'none',
      reason: 'No folder, URL path, or keyword match found'
    });
    return 'worldwide';
  }

  buildPageUrl(page) {
    // Use actual Mizuho domain from environment or fallback to production domain
    const baseUrl = process.env.SITE_BASE_URL || 'https://www.mizuhogroup.com';

    // PREFERRED: Use publishedPath from Webflow if available (most accurate)
    if (page.publishedPath) {
      // publishedPath already includes locale prefix for secondary locales
      // e.g., "/fr-FR/about" or "/about"
      return `${baseUrl}${page.publishedPath}`;
    }

    // FALLBACK: Build URL manually if publishedPath is not available
    let url = baseUrl;

    // Add locale path segment if applicable (e.g., /ja, /fr, etc.)
    if (page.localeInfo && !page.localeInfo.isPrimary && page.localeInfo.tag) {
      url += `/${page.localeInfo.tag}`;
    }

    // Add page slug
    if (page.slug !== 'home' && page.slug !== '') {
      url += `/${page.slug}`;
    }

    return url;
  }

  generateSummary(processedPages) {
    const summary = {
      totalPages: processedPages.length,
      regionCounts: {},
      locale: 'en-US', // Currently only English
      publishedPages: processedPages.length, // All fetched pages are published
      categories: {},
      processingDate: new Date().toISOString()
    };

    processedPages.forEach(page => {
      // Count by region
      const region = page.region || 'unknown';
      summary.regionCounts[region] = (summary.regionCounts[region] || 0) + 1;

      // Count by category (based on page type/content)
      const category = this.categorizePageContent(page);
      summary.categories[category] = (summary.categories[category] || 0) + 1;
    });

    return summary;
  }

  categorizePageContent(page) {
    const slug = page.slug?.toLowerCase() || '';
    const title = page.title?.toLowerCase() || '';
    
    if (page.metadata?.isHomePage || slug === 'home') return 'homepage';
    if (slug.includes('about') || title.includes('about')) return 'about';
    if (slug.includes('contact') || title.includes('contact')) return 'contact';
    if (slug.includes('service') || title.includes('service')) return 'services';
    if (slug.includes('product') || title.includes('product')) return 'products';
    if (slug.includes('investor') || title.includes('investor')) return 'investor-relations';
    if (slug.includes('career') || slug.includes('job') || title.includes('career')) return 'careers';
    if (slug.includes('news') || title.includes('news')) return 'news';
    if (slug.includes('insight') || title.includes('insight')) return 'insights';
    if (slug.includes('resource') || title.includes('resource')) return 'resources';
    
    return 'general';
  }

  async fetchAndSummarize() {
    this.logger.step('Fetching and processing static pages with full content scraping');
    
    try {
      const pages = await this.fetchAllPages();
      const summary = this.generateSummary(pages);

      this.logger.success('Static pages processing complete', summary);

      // Log detailed summary
      console.log('\n📊 STATIC PAGES SUMMARY');
      console.log('========================');
      console.log(`📄 Total pages processed: ${summary.totalPages}`);
      console.log(`✅ Published pages: ${summary.publishedPages}`);
      console.log(`🌍 Active locale: ${summary.locale}`);
      console.log('\n🌎 Pages per region:');
      
      Object.entries(summary.regionCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([region, count]) => {
          const regionObj = getRegionById(region);
          const regionName = regionObj?.name || region;
          console.log(`  • ${regionName}: ${count} pages`);
        });

      console.log('\n📂 Pages per category:');
      Object.entries(summary.categories)
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
          console.log(`  • ${category}: ${count} pages`);
        });
      
      console.log(`\n⏰ Processed at: ${summary.processingDate}\n`);

      return { pages, summary };
    } catch (error) {
      this.logger.error('Failed to fetch and summarize static pages', { error: error.message });
      throw error;
    }
  }
}

export default new StaticPageFetcher();