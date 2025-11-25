/**
 * Country-specific folder to secondary locale mapping
 *
 * This defines which secondary locales should be fetched for specific country folders.
 *
 * Strategy:
 * - Primary locale (English): Fetch ALL pages from all folders
 * - Secondary locales: Fetch ONLY pages from specific country folders with their designated locale
 *
 * Example:
 * - Russia folder: Fetch English (all pages) + Russian (Russia folder pages only)
 * - France folder: Fetch English (all pages) + French (France folder pages only)
 */

/**
 * Folder-to-Locale mapping configuration
 * Key: Folder ID from Webflow (parentId of pages)
 * Value: { localeTag, countryName, parentRegion }
 */
export const FOLDER_LOCALE_MAPPING = {
  // Russia (within EMEA)
  // Pages with parentId = 689d16db29c2308c6235d686 are Russia pages
  '689d16db29c2308c6235d686': {
    localeTag: 'ru',
    countryName: 'Russia',
    parentRegion: 'emea'
  },

  // China (within Asia-Pacific)
  // Pages with parentId = 68a24f748e3ac8e899e08e14 are China pages
  '68a24f748e3ac8e899e08e14': {
    localeTag: 'ja',
    countryName: 'China',
    parentRegion: 'asia-pacific'
  },

  // Taiwan (within Asia-Pacific)
  // Pages with parentId = 68a25ff4475f436877b30c3d are Taiwan pages
  '68a25ff4475f436877b30c3d': {
    localeTag: 'ja',
    countryName: 'Taiwan',
    parentRegion: 'asia-pacific'
  },

  // Saudi Arabia (within EMEA)
  // Pages with parentId = 6819fdd016cb2ef079e37121 are Saudi Arabia pages
  '6819fdd016cb2ef079e37121': {
    localeTag: 'ar-SA',
    countryName: 'Saudi Arabia',
    parentRegion: 'emea'
  },

  // France (within EMEA)
  // Pages with parentId = 6818bd83939cfc6e372a50da are France pages
  '6818bd83939cfc6e372a50da': {
    localeTag: 'fr-FR',
    countryName: 'France',
    parentRegion: 'emea'
  },

  // Japan (top-level folder)
  // Pages with parentId = 6822019595a10292719b5451 are Japan pages
  '6822019595a10292719b5451': {
    localeTag: 'ja',
    countryName: 'Japan',
    parentRegion: 'japan'
  }
};

/**
 * Get the locale configuration for a specific folder ID
 * @param {string} folderId - Webflow folder ID
 * @returns {Object|null} Locale configuration or null if not found
 */
export function getLocaleForFolder(folderId) {
  return FOLDER_LOCALE_MAPPING[folderId] || null;
}

/**
 * Check if a folder ID should have secondary locale pages fetched
 * @param {string} folderId - Webflow folder ID
 * @returns {boolean} True if folder has a secondary locale mapping
 */
export function shouldFetchSecondaryLocale(folderId) {
  return folderId in FOLDER_LOCALE_MAPPING;
}

/**
 * Get all unique secondary locale tags that should be fetched
 * @returns {Array<string>} Array of unique locale tags (e.g., ['ru', 'ja', 'ar-SA', 'fr-FR'])
 */
export function getAllSecondaryLocaleTags() {
  const localeTags = Object.values(FOLDER_LOCALE_MAPPING).map(config => config.localeTag);
  return [...new Set(localeTags)]; // Remove duplicates (e.g., 'ja' appears multiple times)
}

/**
 * Get all folder IDs for a specific locale tag
 * @param {string} localeTag - Locale tag (e.g., 'ja', 'ru', 'fr-FR')
 * @returns {Array<string>} Array of folder IDs that use this locale
 */
export function getFoldersForLocale(localeTag) {
  return Object.entries(FOLDER_LOCALE_MAPPING)
    .filter(([_, config]) => config.localeTag === localeTag)
    .map(([folderId, _]) => folderId);
}

/**
 * Check if a page should be included based on its URL path and the target locale
 * @param {Object} page - Page object from Webflow
 * @param {string} targetLocaleTag - The locale tag we're fetching for
 * @returns {boolean} True if page should be included
 */
export function shouldIncludePageForLocale(page, targetLocaleTag) {
  // Get the page's URL path
  const pagePath = (page.publishedPath || page.slug || '').toLowerCase();

  // If no path, exclude it
  if (!pagePath) {
    return false;
  }

  // Define URL patterns for each locale
  // This includes pages in the country folder AND all its subfolders
  const localeUrlPatterns = {
    'ja': ['/taiwan/', '/china/', '/japan/'],      // Japanese: Taiwan, China, Japan pages
    'fr-FR': ['/france/'],                          // French: France pages
    'ru': ['/russia/'],                             // Russian: Russia pages
    'ar-SA': ['/saudi-arabia/']                     // Arabic: Saudi Arabia pages
  };

  // Get the patterns for the target locale
  const patterns = localeUrlPatterns[targetLocaleTag];

  if (!patterns) {
    return false;
  }

  // Check if the page URL contains any of the patterns
  return patterns.some(pattern => pagePath.includes(pattern));
}

export default {
  FOLDER_LOCALE_MAPPING,
  getLocaleForFolder,
  shouldFetchSecondaryLocale,
  getAllSecondaryLocaleTags,
  getFoldersForLocale,
  shouldIncludePageForLocale
};
