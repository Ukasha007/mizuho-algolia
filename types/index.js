export const ContentTypes = {
  STATIC_PAGE: 'static-page',
  CMS_ITEM: 'cms-item',
  NEWS_ARTICLE: 'news-article',
  INSIGHT: 'insight',
  EVENT: 'event',
  PERSON: 'person',
  REPORT: 'report',
  RESEARCH: 'research'
};

export const Regions = {
  WORLDWIDE: 'worldwide',
  JAPAN: 'japan',
  ASIA_PACIFIC: 'asia-pacific',
  AMERICAS: 'americas',
  EUROPE_MIDDLE_EAST_AFRICA: 'europe-middle-east-africa',
  MIZUHO_BANK: 'mizuho-bank',
  MIZUHO_TRUST_BANKING: 'mizuho-trust-banking',
  MIZUHO_SECURITIES: 'mizuho-securities',
  MIZUHO_RESEARCH_TECHNOLOGIES: 'mizuho-research-technologies'
};

export const SearchPriorities = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

export const ApiResponseSchema = {
  success: 'boolean',
  timestamp: 'string',
  data: 'object',
  error: 'string|null'
};

export const WebflowItemSchema = {
  id: 'string',
  cmsId: 'string',
  fieldData: 'object',
  isArchived: 'boolean',
  isDraft: 'boolean',
  lastPublished: 'string|null',
  lastUpdated: 'string',
  createdOn: 'string'
};

export const ProcessedItemSchema = {
  objectID: 'string',
  id: 'string',
  type: 'string',
  title: 'string',
  slug: 'string',
  url: 'string',
  summary: 'string',
  content: 'string',
  region: 'string',
  publishedDate: 'string|null',
  lastModified: 'string',
  tags: 'array',
  searchTags: 'array',
  featured: 'boolean',
  searchPriority: 'number',
  metadata: 'object'
};

export const AlgoliaObjectSchema = {
  objectID: 'string',
  title: 'string',
  summary: 'string',
  content: 'string',
  type: 'string',
  region: 'string',
  tags: 'array',
  _tags: 'array',
  _geoloc: 'object|null',
  hierarchicalCategories: 'object',
  searchableAttributes: 'array',
  rankingInfo: 'object'
};

export const SyncOptionsSchema = {
  region: 'string|null',
  dryRun: 'boolean',
  includeStatic: 'boolean',
  includeCMS: 'boolean',
  clearIndex: 'boolean',
  batchSize: 'number'
};

export const SearchOptionsSchema = {
  query: 'string',
  region: 'string|null',
  type: 'string|null',
  page: 'number',
  hitsPerPage: 'number',
  filters: 'string'
};

export default {
  ContentTypes,
  Regions,
  SearchPriorities,
  ApiResponseSchema,
  WebflowItemSchema,
  ProcessedItemSchema,
  AlgoliaObjectSchema,
  SyncOptionsSchema,
  SearchOptionsSchema
};