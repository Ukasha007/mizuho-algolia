# Mizuho Algolia Search

Enterprise-grade search indexing system that synchronizes content from Webflow CMS to Algolia, providing fast, regional-filtered search capabilities across Mizuho's global website.

## Table of Contents

- [Overview](#overview)
- [Technologies](#technologies)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Regional Configuration](#regional-configuration)
- [API Reference](#api-reference)
- [Data Flow](#data-flow)
- [Cron Jobs & Automated Syncing](#cron-jobs--automated-syncing)
- [Testing](#testing)
- [Idempotency & Concurrency Protection](#idempotency--concurrency-protection)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Overview

This system automatically indexes content from **34+ Webflow CMS collections** and static pages into Algolia, supporting:

- ✅ **Regional filtering** across 9 regions (Worldwide, Japan, Asia Pacific, Americas, EMEA, and business divisions)
- ✅ **Dynamic CMS content** - 4,382+ items from multiple collections
- ✅ **Static pages** - All published Webflow pages
- ✅ **Real-time synchronization** with Webflow's API v2
- ✅ **Enterprise-grade performance** optimized for Vercel serverless architecture
- ✅ **Smart data transformation** with sanitization and field mapping
- ✅ **Automatic retry logic** with rate limiting for API calls

---

## Technologies

### Core Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | 18+ | Runtime environment |
| **Webflow API** | v2 | CMS and pages data source |
| **Algolia** | v4.25+ | Search index and engine |
| **Vercel** | Latest | Serverless hosting platform |

### Dependencies

```json
{
  "algoliasearch": "^4.25.2",    // Algolia search client
  "axios": "^1.7.7",             // HTTP client for API calls
  "cheerio": "^1.0.0",           // HTML parsing
  "date-fns": "^4.1.0",          // Date manipulation
  "dotenv": "^16.4.5",           // Environment variables
  "node-html-parser": "^6.1.13", // HTML parsing
  "zod": "^3.23.8"               // Schema validation
}
```

### Architecture Pattern

- **Serverless Functions** - Vercel edge functions for API endpoints
- **ES Modules** - Modern JavaScript with `import/export`
- **Environment-based Configuration** - `.env` for credentials
- **Modular Design** - Separated concerns (fetching, transformation, indexing)

---

## Architecture

```
┌─────────────────┐
│  Webflow CMS    │
│  (34 Collections│
│   + Static Pages│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   Sync Scripts (Node.js)            │
│   ├── cms-fetcher.js                │
│   ├── static-fetcher.js             │
│   └── sync-cms-collections.js       │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   Data Transformation                │
│   ├── Field Mapping                  │
│   ├── Regional Classification        │
│   ├── Content Sanitization           │
│   └── Search Optimization            │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   Algolia Search Index               │
│   └── mizuho_content                 │
│       └── 4,382+ searchable objects  │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│   Search API (Vercel Functions)      │
│   └── /api/search                    │
└─────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **Webflow Account** with API access
3. **Algolia Account** with search index created
4. **Vercel Account** (for deployment)
5. **Git** installed on your machine

### Initial Setup

#### 1. Clone the Repository

```bash
git clone <repository-url>
cd mizuho-algolia-search
```

#### 2. Install Dependencies

```bash
npm install
```

#### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
# ============================================
# REQUIRED - Webflow Configuration
# ============================================
WEBFLOW_API_TOKEN=your_webflow_api_token_here
WEBFLOW_SITE_ID=your_webflow_site_id_here

# ============================================
# REQUIRED - Algolia Configuration
# ============================================
ALGOLIA_APP_ID=your_algolia_app_id
ALGOLIA_API_KEY=your_algolia_admin_api_key
ALGOLIA_SEARCH_KEY=your_algolia_search_only_key
ALGOLIA_INDEX_NAME=mizuho_content

# ============================================
# REQUIRED - CMS Collection IDs
# ============================================
# Get these from your Webflow CMS Collections
# Navigate to: Webflow → CMS → [Collection] → Settings → Collection ID

# Americas Region
CMS_AMERICAS_PEOPLE=your_collection_id_here
CMS_AMERICAS_EVENTS=your_collection_id_here
CMS_AMERICAS_INSIGHTS=your_collection_id_here
CMS_AMERICAS_AWARDS=your_collection_id_here
CMS_AMERICAS_NEWS=your_collection_id_here
CMS_BRAZIL_INFORMATION=your_collection_id_here

# Business Divisions
CMS_BANK_NEWS=your_collection_id_here
CMS_SECURITIES_NEWS=your_collection_id_here
CMS_TRUST_AND_BANKING_NEWS=your_collection_id_here

# Asia Pacific Region
CMS_ASIA_PACIFIC_INSIGHTS=your_collection_id_here
CMS_ASIA_PACIFIC_NEWS=your_collection_id_here
CMS_MALAYSIA_INFORMATION=your_collection_id_here
CMS_HONG_KONG_INFORMATION=your_collection_id_here
CMS_SINGAPORE_INFORMATION=your_collection_id_here
CMS_TAIWAN_INFORMATION=your_collection_id_here
CMS_GIFT_CITY_INFORMATION=your_collection_id_here

# Japan Region
CMS_JAPAN_INTL_CARDS=your_collection_id_here

# EMEA Region
CMS_EMEA_NEWS=your_collection_id_here
CMS_EMEA_EVENTS=your_collection_id_here
CMS_EMEA_PEOPLE=your_collection_id_here
CMS_EMEA_LEADERS=your_collection_id_here
CMS_FRANCE_INFORMATION=your_collection_id_here
CMS_SAUDI_ARABIA_INFORMATION=your_collection_id_here
CMS_RUSSIA_INFORMATION=your_collection_id_here

# Worldwide/Global Region
CMS_BEYOND_THE_OBVIOUS=your_collection_id_here
CMS_GLOBAL_NEWS=your_collection_id_here
CMS_GLOBAL_NEWS_RELEASES=your_collection_id_here
CMS_MIZUHO_GLOBAL_SERVICES=your_collection_id_here
CMS_NEWS_AND_ANNOUNCEMENTS=your_collection_id_here
CMS_DIGITAL_ARTICLES=your_collection_id_here
CMS_FINANCIAL_STATEMENTS_DATA=your_collection_id_here
CMS_BASEL_CAPITAL_DATA=your_collection_id_here
CMS_LIQUIDITY_DATA=your_collection_id_here
CMS_ANNUAL_DATA=your_collection_id_here

# ============================================
# OPTIONAL - Performance Configuration
# ============================================
NODE_ENV=production
LOG_LEVEL=info

# ============================================
# OPTIONAL - Regional Folder IDs (for static pages)
# ============================================
FOLDER_AMERICAS=folder_id_here
FOLDER_EMEA=folder_id_here
FOLDER_ASIA_PACIFIC=folder_id_here
FOLDER_JAPAN=folder_id_here
FOLDER_BANK=folder_id_here
FOLDER_SECURITIES=folder_id_here
FOLDER_TRUST_BANKING=folder_id_here

# ============================================
# OPTIONAL - Site Configuration
# ============================================
SITE_BASE_URL=https://www.mizuhogroup.com
```

#### 4. Validate Configuration

```bash
npm run validate-env
```

This will check that all required environment variables are set correctly.

---

## Local Development

### Running Development Server

Start the Vercel development server to test API endpoints locally:

```bash
npm run dev
```

The server will start at `http://localhost:3000`

### Available Local Endpoints

Test these endpoints in your browser or with Postman/cURL:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `http://localhost:3000/api/health` | GET | Check system health |
| `http://localhost:3000/api/search?q=sustainability` | GET | Test search |
| `http://localhost:3000/api/sync/collections` | POST | Sync CMS collections |
| `http://localhost:3000/api/sync/pages` | POST | Sync static pages |
| `http://localhost:3000/api/sync/full` | POST | Full synchronization |

### Sync CMS Collections Locally

To manually sync CMS collections to Algolia:

```bash
# Sync all 34 collections
npm run sync-cms

# Sync specific collections
npm run sync-cms-specific AMERICAS_INSIGHTS BEYOND_THE_OBVIOUS
```

**Expected output:**
```
✅ SUCCESS - CMS collections sync completed successfully
📊 Collections: 34
📄 Items indexed: 4,382
⏱️  Duration: ~22 minutes
```

### Sync Static Pages Locally

To sync static Webflow pages:

```bash
npm run push-to-algolia
```

---

## Deployment

### Deploy to Vercel

#### Option 1: Vercel CLI (Recommended for developers)

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

#### Option 2: GitHub Integration (Recommended for production)

1. **Connect Repository to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js/Node.js project

2. **Configure Environment Variables**
   - In Vercel dashboard → Project Settings → Environment Variables
   - Add all variables from your `.env` file
   - Important: Add them for **Production**, **Preview**, and **Development** environments

3. **Deploy**
   - Push to `main` branch → Auto-deploys to production
   - Push to feature branch → Auto-deploys to preview URL

#### Option 3: Manual Deploy

```bash
npm run deploy
```

### Vercel Configuration

The project includes a `vercel.json` configuration file with serverless functions and cron jobs:

```json
{
  "version": 2,
  "name": "mizuho-algolia-search",
  "functions": {
    "api/**/*.js": {
      "runtime": "@vercel/node",
      "maxDuration": 300
    }
  },
  "env": {
    "NODE_ENV": "production"
  },
  "crons": [
    {
      "path": "/api/sync-static-pages",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/sync-collections?collectionId=americas-people",
      "schedule": "21 * * * *"
    }
    // ... 33 more cron jobs (see vercel.json for full list)
  ]
}
```

**Key settings:**
- `maxDuration: 300` - Functions can run up to 5 minutes (required for large syncs)
- `crons` - 35 automated hourly sync jobs (requires Vercel Pro plan)
- `runtime: @vercel/node` - Node.js serverless runtime

### Post-Deployment

1. **Verify Deployment**
   ```bash
   curl https://your-project.vercel.app/api/health
   ```

   **Expected response:**
   ```json
   {
     "success": true,
     "data": {
       "status": "healthy",
       "connections": { "webflow": true, "algolia": true }
     }
   }
   ```

2. **Test Search**
   ```bash
   curl https://your-project.vercel.app/api/search?q=sustainability&region=americas
   ```

3. **Verify Cron Jobs are Configured**

   Go to Vercel Dashboard → Your Project → **Cron Jobs** tab

   You should see all 35 cron jobs listed with their schedules.

4. **Monitor First Cron Execution**

   Wait for the next hour `:00` and check logs:

   ```bash
   # Watch for cron executions
   vercel logs --follow | grep "x-vercel-cron"
   ```

   **Expected logs:**
   ```
   [INFO] Request authenticated via x-vercel-cron header
   [STEP] Starting static pages synchronization
   [SUCCESS] Synced 651 static pages
   ```

5. **Monitor Regular Logs**
   - Go to Vercel Dashboard → Your Project → **Logs**
   - View real-time function executions
   - Filter by "cron" to see automated syncs

---

## Available Scripts

### Production Scripts

```bash
# Synchronization - Individual Collections
node scripts/sync-single-collection.js <collection-slug>
# Example: node scripts/sync-single-collection.js americas-news
# Time: 30 seconds - 2 minutes per collection

# Synchronization - All Collections
node scripts/sync-cms-collections.js
# Time: ~30-60 minutes for all 34 collections (~4,382 items)

# Synchronization - Static Pages Only
node scripts/sync-static-pages-only.js
# Time: ~10-20 minutes (~651 pages)

# Deployment
npm run dev                   # Start Vercel dev server (localhost:3000)
npm run build                 # Build for production (echo 'No build step needed')
npm run deploy                # Deploy to Vercel production

# Utilities
npm run validate-env          # Validate environment variables
npm run lint                  # Lint code (ESLint)
npm run lint:fix              # Auto-fix lint issues
```

### Script Details

#### Sync Single Collection

**Script:** `scripts/sync-single-collection.js`

Syncs one specific CMS collection to Algolia.

**Usage:**
```bash
node scripts/sync-single-collection.js <collection-slug>

# Examples:
node scripts/sync-single-collection.js americas-news      # ~1,220 items, 1-2 min
node scripts/sync-single-collection.js emea-news          # ~182 items, 30-60 sec
node scripts/sync-single-collection.js bank-news          # ~721 items, 1 min
node scripts/sync-single-collection.js beyond-the-obvious # ~141 items, 30 sec
```

**To see all available collections:**
```bash
node scripts/sync-single-collection.js
# (running without arguments shows list of 34 collections)
```

**Example output:**
```bash
🚀 Syncing collection: americas-news

[STEP] Syncing specific collection: americas-news
[INFO] Fetched 1220 items from collection americas-news
[SUCCESS] Successfully indexed 1220 objects to Algolia

🎉 SYNC COMPLETE!
📦 Collection: americas-news
📤 Items indexed: 1220
✅ Success: Yes
```

#### Sync All Collections

**Script:** `scripts/sync-cms-collections.js`

Syncs all 34 CMS collections sequentially.

**Usage:**
```bash
node scripts/sync-cms-collections.js
```

**Time:** ~30-60 minutes
**Items:** ~4,382 items across 34 collections
**Output:** Progress for each collection + final summary

#### Sync Static Pages Only

**Script:** `scripts/sync-static-pages-only.js`

Syncs only static Webflow pages (no CMS collections).

**Usage:**
```bash
node scripts/sync-static-pages-only.js
```

**Time:** ~10-20 minutes
**Items:** ~651 pages (with selective locale fetching)
**Output:** Page processing progress + final count

---

## Project Structure

```
mizuho-algolia-search/
├── api/                          # Vercel serverless functions
│   ├── health.js                # Health check endpoint
│   ├── search.js                # Search endpoint
│   ├── sync-pages.js            # Static pages sync
│   ├── sync-collections.js      # CMS collections sync
│   └── sync/
│       └── full-sync.js         # Full synchronization
│
├── lib/                          # Core application logic
│   ├── algolia/                 # Algolia integration
│   │   ├── client.js           # Algolia client setup
│   │   └── indexer.js          # Indexing operations
│   ├── constants/               # Configuration
│   │   ├── collections.js      # 34 CMS collections + field mappings
│   │   └── regions.js          # 9 regional definitions
│   ├── core/                    # Core utilities
│   │   ├── config.js           # App configuration
│   │   ├── helpers.js          # Utility functions
│   │   ├── logger.js           # Structured logging
│   │   └── performance-monitor.js
│   ├── security/
│   │   └── data-sanitizer.js   # XSS protection, HTML sanitization
│   ├── transformers/            # Data transformation
│   │   ├── cms-transformer.js  # CMS data → Algolia format
│   │   ├── page-transformer.js # Pages data → Algolia format
│   │   └── regional-filter.js  # Regional filtering logic
│   └── webflow/                 # Webflow integration
│       ├── client.js           # Webflow API client (v2)
│       ├── cms-fetcher.js      # CMS collections fetcher
│       ├── static-fetcher.js   # Static pages fetcher
│       └── taxonomy-resolver.js # Taxonomy resolution
│
├── scripts/                      # Utility scripts
│   ├── sync-cms-collections.js # Main CMS sync script
│   ├── push-to-algolia.js      # Static pages sync script
│   └── validate-env.js         # Environment validation
│
├── types/                        # Type definitions
├── .env                         # Environment variables (not in git)
├── .env.example                 # Environment template
├── .gitignore                   # Git ignore rules
├── package.json                 # Dependencies & scripts
├── vercel.json                  # Vercel configuration
├── REGIONAL_CATEGORIZATION.md   # Regional setup documentation
└── README.md                    # This file
```

**Total:** 25 JavaScript files (production-ready, no test files)

---

## Regional Configuration

The system supports **9 distinct regions** with hard-coded assignments for CMS collections and dynamic detection for static pages.

### Supported Regions

| Region ID | Region Name | Content Examples |
|-----------|-------------|------------------|
| `worldwide` | Worldwide | Global news, Beyond The Obvious, Financial data |
| `americas` | Americas | Americas news, insights, events |
| `asia-pacific` | Asia Pacific | APAC news, country information |
| `japan` | Japan | Japan-specific content |
| `europe-middle-east-africa` | EMEA | European, Middle East, Africa content |
| `mizuho-bank` | Mizuho Bank | Bank division news |
| `mizuho-securities` | Mizuho Securities | Securities division content |
| `mizuho-trust-banking` | Mizuho Trust & Banking | Trust banking content |
| `mizuho-research-technologies` | Mizuho R&T | Research and technology |

### CMS Collections Regional Assignment

**Hard-coded** in [`lib/constants/collections.js`](lib/constants/collections.js):

```javascript
CMS_COLLECTIONS = {
  AMERICAS_NEWS: {
    id: 'americas-news',
    name: 'Americas News',
    region: 'americas',  // ← Hard-coded
    ...
  }
}
```

### Static Pages Regional Assignment

**Dynamic detection** via two methods (see [`lib/webflow/static-fetcher.js:550-589`](lib/webflow/static-fetcher.js#L550-L589)):

1. **Folder-based** - If page is in a regional folder
2. **Keyword-based** - If slug/title contains regional keywords
3. **Default** - Falls back to `worldwide`

See [`REGIONAL_CATEGORIZATION.md`](REGIONAL_CATEGORIZATION.md) for complete documentation.

---

## API Reference

### Health Check

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-21T00:00:00.000Z",
  "services": {
    "webflow": "connected",
    "algolia": "connected"
  }
}
```

### Search

**Endpoint:** `GET /api/search`

**Parameters:**
- `q` (required) - Search query
- `region` (optional) - Regional filter (default: worldwide)
- `page` (optional) - Page number (default: 0)
- `hitsPerPage` (optional) - Results per page (default: 20)

**Example:**
```bash
curl "https://your-project.vercel.app/api/search?q=sustainability&region=americas&page=0"
```

**Response:**
```json
{
  "hits": [...],
  "nbHits": 42,
  "page": 0,
  "nbPages": 3,
  "hitsPerPage": 20
}
```

### Sync CMS Collections

**Endpoint:** `POST /api/sync/collections`

**Body:**
```json
{
  "collections": ["AMERICAS_INSIGHTS", "BEYOND_THE_OBVIOUS"]
}
```

**Response:**
```json
{
  "success": true,
  "itemsIndexed": 470,
  "collections": 2,
  "duration": "2m 30s"
}
```

### Full Synchronization

**Endpoint:** `POST /api/sync/full`

**Body:**
```json
{
  "region": "worldwide",
  "includeStatic": true,
  "includeCMS": true,
  "clearIndex": false
}
```

---

## Data Flow

### CMS Collections Sync Flow

```
1. Environment Variable Check
   ↓
2. Fetch from Webflow API v2
   ├── Batch fetching (100 items/request)
   ├── Rate limiting (60 requests/minute)
   └── Automatic retries on failure
   ↓
3. Process Each Item
   ├── Extract fields via field mapping
   ├── Assign region (hard-coded by collection)
   ├── Clean summary (remove "undefined" strings)
   └── Build searchable content
   ↓
4. Transform for Algolia
   ├── Sanitize HTML/XSS protection
   ├── Add search metadata
   ├── Calculate search scores
   └── Build hierarchical categories
   ↓
5. Index to Algolia
   ├── Batch upload (100 items/batch)
   ├── Update index settings
   └── Verify completion
```

### Static Pages Sync Flow

```
1. Fetch All Published Pages from Webflow
   ├── Exclude: 404, admin, test, utility pages
   └── Exclude: Branch pages
   ↓
2. For Each Page
   ├── Extract content from DOM nodes
   ├── Extract SEO metadata
   ├── Detect region (folder → keywords → default)
   └── Build search text
   ↓
3. Transform & Index
   └── Same as CMS flow above
```

---

## Cron Jobs & Automated Syncing

### Overview

The system uses **35 Vercel cron jobs** to automatically sync content every hour:

- **1 job** for static pages (runs at `:00`, takes ~20 minutes)
- **34 jobs** for CMS collections (staggered from `:21` to `:54`, each takes 30 sec - 2 min)

**Key Benefits:**
- ✅ No manual syncing needed
- ✅ Content stays fresh (hourly updates)
- ✅ Each job completes well within Vercel's 5-minute timeout
- ✅ Jobs run in parallel (collections sync while pages sync)
- ✅ One collection failing doesn't affect others

---

### Cron Schedule Design

```
Hour:Minute  | Job                          | Duration | Items
-------------|------------------------------|----------|-------
   :00       | Static Pages Sync            | ~20 min  | ~651 pages
   :21       | americas-people              | ~1 min   | ~150 items
   :22       | americas-events              | ~45 sec  | ~89 items
   :23       | americas-insights            | ~1 min   | ~234 items
   :24       | americas-awards              | ~30 sec  | ~58 items
   :25       | americas-news                | ~2 min   | ~1,220 items
   :26       | brazil-information           | ~30 sec  | ~45 items
   :27       | beyond-the-obvious           | ~45 sec  | ~141 items
   :28       | bank-news                    | ~1 min   | ~721 items
   :29       | securities-news              | ~1 min   | ~312 items
   :30       | trust-and-banking-news       | ~45 sec  | ~198 items
   :31       | asia-pacific-insights        | ~30 sec  | ~67 items
   :32       | asia-pacific-news            | ~45 sec  | ~123 items
   :33       | malaysia-information         | ~20 sec  | ~12 items
   :34       | hong-kong-information        | ~20 sec  | ~15 items
   :35       | singapore-information        | ~20 sec  | ~18 items
   :36       | taiwan-information           | ~20 sec  | ~9 items
   :37       | gift-city-information        | ~20 sec  | ~8 items
   :38       | japan-intl-cards             | ~20 sec  | ~23 items
   :39       | emea-news                    | ~45 sec  | ~182 items
   :40       | emea-events                  | ~30 sec  | ~45 items
   :41       | emea-people                  | ~30 sec  | ~78 items
   :42       | emea-leaders                 | ~20 sec  | ~34 items
   :43       | france-information           | ~20 sec  | ~11 items
   :44       | saudi-arabia-information     | ~20 sec  | ~7 items
   :45       | russia-information           | ~20 sec  | ~6 items
   :46       | global-news                  | ~1 min   | ~456 items
   :47       | global-news-releases         | ~45 sec  | ~234 items
   :48       | mizuho-global-services       | ~30 sec  | ~89 items
   :49       | news-and-announcements       | ~45 sec  | ~167 items
   :50       | digital-articles             | ~30 sec  | ~92 items
   :51       | financial-statements-data    | ~20 sec  | ~34 items
   :52       | basel-capital-data           | ~20 sec  | ~28 items
   :53       | liquidity-data               | ~20 sec  | ~19 items
   :54       | annual-data                  | ~20 sec  | ~24 items
```

**Design rationale:**
- Static pages start at `:00` and run for ~20 minutes
- Collections start at `:21` (after static pages have started)
- Staggered 1 minute apart to avoid overlapping API calls
- All jobs complete before next hour begins

---

### Vercel Configuration

The cron jobs are configured in [`vercel.json`](vercel.json):

```json
{
  "version": 2,
  "functions": {
    "api/**/*.js": {
      "runtime": "@vercel/node",
      "maxDuration": 300
    }
  },
  "crons": [
    {
      "path": "/api/sync-static-pages",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/sync-collections?collectionId=americas-people",
      "schedule": "21 * * * *"
    },
    {
      "path": "/api/sync-collections?collectionId=americas-events",
      "schedule": "22 * * * *"
    },
    // ... 32 more collections (see vercel.json for full list)
  ]
}
```

**Schedule format:** [Cron expression](https://crontab.guru/)
- `0 * * * *` = Every hour at minute 0
- `21 * * * *` = Every hour at minute 21
- etc.

---

### What Happens When a Cron Job Runs

1. **Vercel triggers the endpoint** at scheduled time
2. **Auth is bypassed** (Vercel adds `x-vercel-cron` header)
3. **Deduplication check** via `x-vercel-cron-id` header
4. **In-flight lock** prevents concurrent runs of same collection
5. **Sync executes:**
   - Fetch from Webflow
   - Transform data
   - Index to Algolia
6. **Lock released** when done
7. **Logs visible** in Vercel dashboard

---

### Monitoring Cron Jobs

#### View Cron Execution Logs

```bash
# Real-time logs
vercel logs --follow

# Filter for cron executions
vercel logs --follow | grep "x-vercel-cron"

# View specific endpoint logs
vercel logs --follow | grep "sync-collections"
```

#### Check Cron Job Status in Vercel Dashboard

1. Go to your project in Vercel
2. Click **Cron Jobs** tab
3. See all scheduled jobs and their last execution status

#### Verify a Specific Collection Synced

```bash
# Check Algolia for recently updated items
curl "https://your-project.vercel.app/api/search?q=&filters=collectionSlug:americas-news"
```

---

### Local Testing vs. Production Cron

| Aspect | Local Testing | Production Cron |
|--------|---------------|-----------------|
| **Trigger** | Manual: `node scripts/...` | Automatic: Vercel cron |
| **Auth** | No auth required | Auth via `x-vercel-cron` header |
| **Frequency** | On-demand | Every hour |
| **Logs** | Terminal output | Vercel dashboard |
| **Deduplication** | N/A (manual) | Automatic via cronId |

**Key Point:** When you run `node scripts/sync-single-collection.js americas-news` locally, you're testing the **exact same code** that the cron job at `:25` will run in production.

---

### Troubleshooting Cron Jobs

#### Cron job not running

**Symptoms:** No logs, Algolia not updating

**Check:**
```bash
# 1. Verify crons are configured
cat vercel.json | grep -A 50 '"crons"'

# 2. Check Vercel dashboard Cron Jobs tab
# 3. Ensure Vercel Pro plan is active (crons require Pro)

# 4. Test endpoint manually
curl -X POST https://your-project.vercel.app/api/sync-collections \
  -H "x-api-key: YOUR_API_SECRET_KEY" \
  -d '{"collectionId": "americas-news"}'
```

#### Cron job timing out

**Symptoms:** Logs show timeout error

**Cause:** Collection too large for 5-minute timeout

**Solution:**
- Check `maxDuration: 300` in `vercel.json` (should be 300, not 60)
- Large collections like `americas-news` (~1,220 items) should complete in ~2 minutes
- If consistently timing out, check Webflow API rate limits

#### Duplicate cron executions

**Symptoms:** Logs show "Duplicate cron execution detected"

**Cause:** Vercel retrying due to network issues (this is normal)

**Solution:** No action needed - system automatically skips duplicates via deduplication

---

## Idempotency & Concurrency Protection

### Overview

The system has two layers of protection to ensure reliable syncing:

1. **Deduplication** - Prevents duplicate cron executions from wasting API quota
2. **In-Flight Locks** - Prevents concurrent syncs of the same collection

---

### Deduplication (Preventing Duplicate Cron Runs)

**Problem:** Vercel may retry a cron job if it detects network issues, causing duplicate API calls to Webflow/Algolia.

**Solution:** Track unique cron execution IDs.

**How it works:**

1. Vercel sends `x-vercel-cron-id` header with each cron execution
2. System stores recently seen cronIds in memory (Map)
3. If same cronId appears again → skip execution
4. Old cronIds auto-cleaned after 2 hours

**Code location:** [`lib/algolia/indexer.js:31-58`](lib/algolia/indexer.js)

```javascript
isDuplicateCronExecution(cronId) {
  if (!cronId) return false; // Not a cron job, allow

  // Clean up old entries (>2 hours)
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  for (const [id, timestamp] of this.cronExecutions.entries()) {
    if (timestamp < twoHoursAgo) {
      this.cronExecutions.delete(id);
    }
  }

  // Check if we've seen this cronId
  if (this.cronExecutions.has(cronId)) {
    return true; // Duplicate!
  }

  // Record this execution
  this.cronExecutions.set(cronId, Date.now());
  return false;
}
```

**Logs to look for:**
```
[WARN] Skipping duplicate cron execution for collection: americas-news
```

This is **expected behavior** and prevents wasted API calls.

---

### In-Flight Locks (Preventing Concurrent Syncs)

**Problem:** Multiple cron jobs or manual syncs could run simultaneously, causing conflicts.

**Solution:** Track which collections are currently syncing.

**How it works:**

1. Before starting sync, check if collection is already syncing
2. If yes → skip and return early
3. If no → mark as "in flight" (add to Set)
4. When sync completes/fails → remove from Set (in `finally` block)

**Code location:** [`lib/algolia/indexer.js:60-85`](lib/algolia/indexer.js)

```javascript
// Check if sync is in progress
isSyncInProgress(syncId) {
  return this.activeSyncs.has(syncId);
}

// Start sync (acquire lock)
startSync(syncId) {
  this.activeSyncs.add(syncId);
  this.logger.info('Sync started', { syncId, activeCount: this.activeSyncs.size });
}

// End sync (release lock)
endSync(syncId) {
  this.activeSyncs.delete(syncId);
  this.logger.info('Sync completed', { syncId, activeCount: this.activeSyncs.size });
}
```

**Usage in sync methods:**

```javascript
async syncSpecificCollection(collectionSlug, options = {}) {
  // Check for concurrent sync
  if (this.isSyncInProgress(collectionSlug)) {
    return { success: false, message: 'Sync already in progress' };
  }

  this.startSync(collectionSlug);

  try {
    // ... sync logic ...
  } finally {
    this.endSync(collectionSlug); // Always release lock
  }
}
```

**Logs to look for:**
```
[INFO] Sync started {"syncId":"americas-news","activeCount":1}
[INFO] Sync completed {"syncId":"americas-news","activeCount":0}
```

If you see:
```
[WARN] Sync already in progress for collection: americas-news
```

This means the lock is working correctly.

---

### Combined Protection Flow

```
Vercel Cron Triggers → /api/sync-collections?collectionId=americas-news
                       ↓
              Check: isDuplicateCronExecution(x-vercel-cron-id)?
                       ↓
                   YES → Skip (return early)
                   NO  → Continue
                       ↓
              Check: isSyncInProgress("americas-news")?
                       ↓
                   YES → Skip (return early)
                   NO  → startSync("americas-news")
                       ↓
              Execute sync (fetch → transform → index)
                       ↓
              endSync("americas-news") in finally block
```

This ensures **no duplicate work** even if:
- Vercel retries a cron job
- Manual sync is triggered while cron is running
- Network issues cause multiple requests

---

### Testing Protection Mechanisms

#### Test Deduplication Locally

You can't easily test this locally since it requires `x-vercel-cron-id` header from Vercel. But you can simulate:

```javascript
// In your script, manually pass a cronId
await algoliaIndexer.syncSpecificCollection('americas-news', {
  cronId: 'test-cron-123'
});

// Run again with same cronId
await algoliaIndexer.syncSpecificCollection('americas-news', {
  cronId: 'test-cron-123' // Should skip (duplicate)
});
```

#### Test In-Flight Lock Locally

Run two syncs concurrently:

```bash
# Terminal 1
node scripts/sync-single-collection.js americas-news

# Terminal 2 (start immediately)
node scripts/sync-single-collection.js americas-news
```

**Expected:** Second one should return immediately with "Sync already in progress" message.

---

## Testing

### Understanding Local vs. Production Testing

| Environment | What Runs | How to Trigger | Use Case |
|-------------|-----------|----------------|----------|
| **Local** | CLI Scripts | `node scripts/...` | Manual testing, development, debugging |
| **Production** | Vercel Cron Jobs | Automatic (hourly) | Automated syncing in production |

**Key Point:** The same sync logic runs in both environments. Local scripts let you test manually what cron jobs will do automatically in production.

---

### Local Testing - Individual Collections

Test syncing **one collection at a time** (fast, recommended for development):

```bash
# Test a specific collection
node scripts/sync-single-collection.js <collection-slug>

# Examples (different sizes for testing):
node scripts/sync-single-collection.js emea-leaders          # Small: ~50 items, 20 sec
node scripts/sync-single-collection.js emea-news             # Medium: ~182 items, 45 sec
node scripts/sync-single-collection.js bank-news             # Large: ~721 items, 1.5 min
node scripts/sync-single-collection.js americas-news         # X-Large: ~1,220 items, 2 min
```

**What happens:**
1. Script fetches items from Webflow CMS
2. Transforms data for Algolia
3. Indexes to your Algolia index
4. Shows detailed progress logs

**When to use:**
- Testing individual collections
- Debugging specific collection issues
- Quick validation of changes
- Development workflow

---

### Local Testing - All Collections

Test syncing **all 34 collections** (slow, comprehensive):

```bash
# Sync all collections sequentially
node scripts/sync-cms-collections.js
```

**Duration:** 30-60 minutes
**Items:** ~4,382 items across 34 collections

**Example output:**
```bash
🚀 Syncing 34 CMS Collections to Algolia
==========================================

✅ [1/34] americas-people... (150 items) - 45s
✅ [2/34] americas-events... (89 items) - 30s
✅ [3/34] americas-insights... (234 items) - 1m 10s
...
✅ [34/34] annual-data... (45 items) - 20s

🎉 ALL COLLECTIONS SYNCED!
Total items indexed: 4,382
Time taken: 42m 15s
```

**When to use:**
- Initial setup and validation
- Pre-deployment testing
- Full data refresh
- Comprehensive testing

---

### Local Testing - Static Pages Only

Test syncing **static Webflow pages**:

```bash
node scripts/sync-static-pages-only.js
```

**Duration:** 10-20 minutes
**Items:** ~651 pages (with selective locale fetching)

**When to use:**
- Testing page content extraction
- Validating locale filtering
- Testing page regional assignment

---

### Available Collection Slugs (All 34)

Use these slugs with `node scripts/sync-single-collection.js <slug>`:

**Americas (6):**
- `americas-news`, `americas-people`, `americas-events`, `americas-insights`, `americas-awards`, `brazil-information`

**EMEA (7):**
- `emea-news`, `emea-people`, `emea-events`, `emea-leaders`, `france-information`, `saudi-arabia-information`, `russia-information`

**Asia Pacific (7):**
- `asia-pacific-news`, `asia-pacific-insights`, `malaysia-information`, `hong-kong-information`, `singapore-information`, `taiwan-information`, `gift-city-information`

**Business Units (3):**
- `bank-news`, `securities-news`, `trust-and-banking-news`

**Japan (1):**
- `japan-intl-cards`

**Worldwide (10):**
- `beyond-the-obvious`, `global-news`, `global-news-releases`, `mizuho-global-services`, `news-and-announcements`, `digital-articles`, `financial-statements-data`, `basel-capital-data`, `liquidity-data`, `annual-data`

**Pro Tip:** Run `node scripts/sync-single-collection.js` (without arguments) to see this list.

---

### Testing Strategy Recommendations

#### Quick Validation (5-10 minutes)
```bash
# Test 3-4 collections from different regions
node scripts/sync-single-collection.js americas-news
node scripts/sync-single-collection.js emea-news
node scripts/sync-single-collection.js bank-news
node scripts/sync-single-collection.js beyond-the-obvious
```

#### Comprehensive Validation (30-60 minutes)
```bash
# Full sync
node scripts/sync-cms-collections.js
```

#### Pre-Deployment Checklist
```bash
# 1. Validate environment
npm run validate-env

# 2. Test one small collection
node scripts/sync-single-collection.js emea-leaders

# 3. Test one large collection
node scripts/sync-single-collection.js americas-news

# 4. If both pass, optionally test full sync
node scripts/sync-cms-collections.js
```

---

### Testing Local API Endpoints

Start the development server:

```bash
npm run dev
# Server starts at http://localhost:3000
```

#### 1. Test Health Endpoint

```bash
curl http://localhost:3000/api/health
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-10-25T...",
    "connections": {
      "webflow": true,
      "algolia": true,
      "overall": true
    }
  }
}
```

#### 2. Test Search Endpoint

```bash
curl "http://localhost:3000/api/search?q=sustainability&region=americas"
```

**Expected response:**
```json
{
  "success": true,
  "data": {
    "hits": [...],
    "nbHits": 42,
    "page": 0,
    "nbPages": 3
  }
}
```

#### 3. Test Sync Endpoint (requires auth)

```bash
# Sync a specific collection via API
curl -X POST http://localhost:3000/api/sync-collections \
  -H "x-api-key: YOUR_API_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"collectionId": "americas-news", "dryRun": false}'
```

---

### Production Testing (After Deployment)

Once deployed to Vercel, test the same endpoints:

```bash
# Set your production URL
PROD_URL="https://your-project.vercel.app"

# Test health
curl $PROD_URL/api/health

# Test search
curl "$PROD_URL/api/search?q=sustainability&region=americas"

# Check cron job execution (requires Vercel CLI)
vercel logs --follow | grep "x-vercel-cron"
```

---

## Troubleshooting

### Common Issues

#### 1. "Missing required environment variables"

**Cause:** `.env` file not configured properly

**Solution:**
```bash
# Copy example file
cp .env.example .env

# Edit .env and add your credentials
nano .env

# Validate
npm run validate-env
```

#### 2. "Webflow connection failed"

**Cause:** Invalid Webflow API token or site ID

**Solution:**
- Go to Webflow → Settings → Integrations → API Access
- Generate new token with read permissions
- Verify site ID is correct (from Webflow URL)

#### 3. "Algolia indexing failed"

**Cause:** Invalid Algolia credentials or insufficient permissions

**Solution:**
- Check Algolia dashboard → API Keys
- Ensure you're using **Admin API Key** (not Search-Only key)
- Verify index name matches your configuration

#### 4. "Sync times out"

**Cause:** Large collections take time (expected)

**Solution:**
- For development, use `npm run sync-cms-specific` for individual collections
- For production, run full sync during off-peak hours
- Typical sync time: 20-25 minutes for all 4,382 items

#### 5. "Undefined" appearing in summaries

**Cause:** Fixed in latest version

**Solution:**
```bash
# Re-sync to apply fix
npm run sync-cms
```

The fix ensures that missing summary fields show **blank** instead of "undefined".

#### 6. Vercel function timeout

**Cause:** Serverless function execution limit (60 seconds default)

**Solution:**
- For large syncs, use the CLI scripts directly (not via API)
- Or increase timeout in `vercel.json`:
```json
{
  "functions": {
    "api/**/*.js": {
      "maxDuration": 60
    }
  }
}
```

### Debug Logs

Enable detailed logging:

```env
LOG_LEVEL=debug
```

Then run sync to see detailed logs.

---

## Contributing

### Development Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Follow existing code patterns
   - Keep functions modular
   - Add JSDoc comments for public functions

3. **Test Locally**
   ```bash
   npm run lint
   npm run sync-cms-specific AMERICAS_INSIGHTS
   ```

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

5. **Push & Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

### Code Standards

- **ES Modules** - Use `import/export` (not `require`)
- **Async/Await** - Preferred over callbacks/promises
- **Error Handling** - Always use try/catch with proper logging
- **Environment Variables** - Never commit `.env` file
- **Comments** - JSDoc for functions, inline for complex logic only

### Pull Request Checklist

- [ ] Code follows existing patterns
- [ ] Environment variables documented in `.env.example`
- [ ] Tested locally with `npm run dev`
- [ ] Tested sync with at least one collection
- [ ] Lint passes (`npm run lint`)
- [ ] No sensitive data in commits

---

## Additional Resources

### Documentation

- **Regional Setup:** See [`REGIONAL_CATEGORIZATION.md`](REGIONAL_CATEGORIZATION.md)
- **Webflow API Docs:** [https://developers.webflow.com/](https://developers.webflow.com/)
- **Algolia Docs:** [https://www.algolia.com/doc/](https://www.algolia.com/doc/)
- **Vercel Docs:** [https://vercel.com/docs](https://vercel.com/docs)

### Support

For questions or issues:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review existing GitHub issues
3. Create a new issue with detailed reproduction steps

---

## License

MIT License - Mizuho Development Team

---

## Summary

This is an **enterprise-grade search indexing system** that:

✅ Indexes **4,382+ items** from 34 CMS collections
✅ Supports **9 regional filters** for global content discovery
✅ Provides **fast, accurate search** via Algolia
✅ Runs on **Vercel serverless** infrastructure
✅ Includes **automatic data sanitization** and XSS protection
✅ Features **smart field mapping** and fallback handling

Built with **Webflow API v2**, **Algolia Search**, and **Vercel Serverless Functions**

---

*Last Updated: October 25, 2025*
*Version: 1.1.0*
*Total Items Indexed: 4,382+*
