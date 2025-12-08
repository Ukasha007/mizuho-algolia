# Mizuho Algolia Search

Enterprise-grade search indexing system that synchronizes content from Webflow CMS to Algolia, providing fast, regional-filtered search capabilities across Mizuho's global website.

## Table of Contents

- [Overview](#overview)
- [Technologies](#technologies)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Updating Serverless Functions](#updating-serverless-functions)
- [Updating Environment Variables in Production](#updating-environment-variables-in-production)
- [Updating Vercel Configuration](#updating-vercel-configuration)
- [Rollback & Emergency Procedures](#rollback--emergency-procedures)
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
- [Client Guide - Quick Reference](#client-guide---quick-reference)

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
| **Node.js** | 22.x | Runtime environment |
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

1. **Node.js 22.x** - [Download here](https://nodejs.org/)
2. **Webflow Account** with API access
3. **Algolia Account** with search index created
4. **Vercel Account** with Pro plan (for deployment)
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
LOG_LEVEL=info  # Options: error, warn, info, debug (optimized for Vercel's 256-line limit)

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
  "functions": {
    "api/**/*.js": {
      "maxDuration": 300
    }
  },
  "env": {
    "NODE_ENV": "production",
    "LOG_LEVEL": "info"
  },
  "crons": [
    {
      "path": "/api/sync-static-pages-incremental",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/sync-static-pages-incremental?forceFullSync=true",
      "schedule": "0 3 1 * *"
    },
    {
      "path": "/api/sync/full?region=americas",
      "schedule": "0 4 * * *"
    }
    // ... 7 more regional cron jobs (see vercel.json for full list)
  ]
}
```

**Key settings:**
- `maxDuration: 300` - Functions can run up to 5 minutes (required for large syncs)
- `crons` - 10 automated daily sync jobs (requires Vercel Pro plan)
- `LOG_LEVEL: info` - Optimized to stay under Vercel's 256-line log limit
- Runtime auto-detected from package.json (Node.js 22.x)

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

   You should see all 10 cron jobs listed with their schedules.

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

## Updating Serverless Functions

### Modifying Existing Functions

When you need to modify or enhance existing serverless functions (e.g., adding a new feature to the search endpoint):

1. **Edit Function Code**
   - Serverless functions are located in the `/api/` directory
   - Make your changes to the desired function (e.g., [api/search.js](api/search.js))
   - Example: Adding a new query parameter or filter

2. **Test Locally**
   ```bash
   # Start local development server
   npm run dev

   # Test your changes
   curl "http://localhost:3000/api/search?q=test&region=americas"
   ```

3. **Deploy Changes**

   **Option A: Auto-deploy via GitHub (Recommended)**
   ```bash
   git add api/search.js
   git commit -m "feat: add new filter to search endpoint"
   git push origin main
   # Vercel automatically deploys on push to main branch
   ```

   **Option B: Manual deploy via CLI**
   ```bash
   vercel --prod
   ```

4. **Verify Deployment**
   ```bash
   # Test production endpoint
   curl "https://your-project.vercel.app/api/search?q=test"

   # Check deployment status
   vercel ls
   ```

### Adding New Serverless Functions

To create a new API endpoint:

1. **Create Function File**
   ```bash
   # Example: Create a new stats endpoint
   touch api/stats.js
   ```

2. **Write Function Code**
   ```javascript
   // api/stats.js
   export default async function handler(req, res) {
     try {
       // Your logic here
       const stats = {
         totalIndexed: 4382,
         lastSync: new Date().toISOString()
       };

       res.status(200).json({
         success: true,
         data: stats
       });
     } catch (error) {
       res.status(500).json({
         success: false,
         error: error.message
       });
     }
   }
   ```

3. **Test Locally**
   ```bash
   npm run dev
   curl "http://localhost:3000/api/stats"
   ```

4. **Deploy** (same process as modifying existing functions)

### Important Notes

- ⚠️ **All changes to `/api/` directory require redeployment** to take effect in production
- Vercel auto-detects new files in `/api/` as serverless functions
- Function timeout is configured in `vercel.json` (default: 300 seconds)
- Use `npm run dev` to test with exact production behavior locally
- Test authentication and CORS headers if your endpoint requires them
- Monitor function logs after deployment: `vercel logs --follow`

### Common Function Modifications

**Adding a New Query Parameter:**
```javascript
// api/search.js
const { q, region, newParam } = req.query;
// Implement logic using newParam
```

**Adding Request Body Validation:**
```javascript
import { z } from 'zod';

const schema = z.object({
  query: z.string().min(1),
  limit: z.number().optional()
});

const validated = schema.parse(req.body);
```

**Adding Authentication:**
```javascript
import { requireAuth } from '../lib/security/auth.js';

// Check authentication
const authResult = await requireAuth(req);
if (!authResult.authenticated) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

---

## Updating Environment Variables in Production

### Via Vercel Dashboard (Recommended)

When you need to update API keys, add new collections, or change configuration:

1. **Navigate to Project Settings**
   - Go to [vercel.com](https://vercel.com)
   - Select your project
   - Click **Settings** → **Environment Variables**

2. **Update or Add Variable**
   - Find the variable you want to update (e.g., `WEBFLOW_API_TOKEN`)
   - Click **Edit** or delete and add new
   - Enter the new value
   - Select which environments need the variable:
     - ✅ Production
     - ✅ Preview
     - ✅ Development

3. **Redeploy to Apply Changes**

   **Option A: Via CLI**
   ```bash
   # Trigger a new deployment to pick up environment variable changes
   vercel --prod
   ```

   **Option B: Via Dashboard**
   - Go to **Deployments** tab
   - Click **⋯** menu on the latest deployment
   - Click **Redeploy**

### Common Environment Variable Updates

#### Rotating API Keys (Security Best Practice)

**Scenario: Webflow API Token Compromised**

```bash
# Step 1: Generate new token in Webflow dashboard
# Webflow → Settings → Integrations → API Access → Generate Token

# Step 2: Update in Vercel dashboard
# Variable: WEBFLOW_API_TOKEN
# New Value: <new_token_here>

# Step 3: Redeploy
vercel --prod

# Step 4: Verify
curl https://your-project.vercel.app/api/health
```

**Scenario: Rotating Algolia API Key**

```bash
# Step 1: Generate new Admin API key in Algolia dashboard
# Algolia → API Keys → All API Keys → Generate API Key

# Step 2: Update in Vercel dashboard
# Variable: ALGOLIA_API_KEY
# New Value: <new_admin_key_here>

# Step 3: Redeploy
vercel --prod

# Step 4: Test search functionality
curl "https://your-project.vercel.app/api/search?q=test"
```

#### Adding a New CMS Collection

**Scenario: Adding "EMEA Awards" Collection**

```bash
# Step 1: Get collection ID from Webflow CMS
# Webflow → CMS → [Collection] → Settings → Collection ID

# Step 2: Add environment variable in Vercel dashboard
# Variable Name: CMS_EMEA_AWARDS
# Value: <collection_id_from_webflow>
# Environments: Production, Preview, Development

# Step 3: Update lib/constants/collections.js (in code)
# See "Contributing" section for details

# Step 4: Update .env.example (for documentation)

# Step 5: Commit and push changes
git add lib/constants/collections.js .env.example
git commit -m "feat: add EMEA Awards collection"
git push origin main
# Vercel auto-deploys
```

#### Changing Configuration Values

```bash
# Example: Increase sync batch size for better performance
# Variable: SYNC_BATCH_SIZE
# Old Value: 100
# New Value: 200

# Example: Change log level for debugging
# Variable: LOG_LEVEL
# Values: error, warn, info, debug
```

### Important Notes

- ⚠️ **Environment variable changes REQUIRE redeployment** to take effect
- Always test changes in **Preview** environment first before production
- **Never commit `.env` file to git** (it contains secrets)
- Keep `.env.example` updated when adding new variables
- Use Vercel's environment variable encryption (automatically enabled)
- Consider impact on cron jobs - they use production environment variables

### Local Environment Setup

For local development, create/update your `.env` file:

```bash
# Copy environment variables template
cp .env.example .env

# Edit with your credentials
nano .env

# Validate configuration
npm run validate-env
```

---

## Updating Vercel Configuration

The `vercel.json` file controls critical deployment settings. Any changes require redeployment.

### What vercel.json Controls

- ⚙️ Serverless function settings (timeout, memory, runtime)
- ⏰ Cron job schedules
- 🔒 Security headers and CORS
- 🔀 API rewrites and redirects
- 🌍 Environment-specific configuration

### Modifying Cron Job Schedules

**Example: Change Americas sync from 4:00 AM to 5:00 AM UTC**

1. **Edit `vercel.json`:**
   ```json
   {
     "crons": [
       {
         "path": "/api/sync/full?region=americas",
         "schedule": "0 5 * * *"  // Changed from "0 4 * * *"
       }
     ]
   }
   ```

2. **Commit and Deploy:**
   ```bash
   git add vercel.json
   git commit -m "chore: update Americas sync schedule to 5 AM UTC"
   git push origin main
   ```

3. **Verify in Vercel Dashboard:**
   - Go to your Vercel project
   - Click **Cron Jobs** tab
   - Confirm the new schedule appears

**Cron Schedule Syntax:**
```
 ┌───────────── minute (0 - 59)
 │ ┌───────────── hour (0 - 23)
 │ │ ┌───────────── day of month (1 - 31)
 │ │ │ ┌───────────── month (1 - 12)
 │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
 │ │ │ │ │
 * * * * *

Examples:
"0 4 * * *"   - Every day at 4:00 AM UTC
"0 */6 * * *" - Every 6 hours
"0 2 1 * *"   - 2:00 AM on the 1st of every month
```

Use [crontab.guru](https://crontab.guru) for help with cron syntax.

### Adding or Removing Cron Jobs

**Adding a New Cron Job:**
```json
{
  "crons": [
    // ... existing cron jobs ...
    {
      "path": "/api/new-sync-endpoint",
      "schedule": "0 12 * * *"  // Daily at noon UTC
    }
  ]
}
```

**Removing a Cron Job:**
Simply delete the entire cron job object from the array.

**⚠️ Important:**
- Cron jobs require **Vercel Pro Plan** or higher
- Maximum 20 cron jobs per project on Pro plan
- Each cron job triggers the specified endpoint with `x-vercel-cron` header

### Modifying Function Timeout

**Example: Increase timeout for large sync operations**

```json
{
  "functions": {
    "api/**/*.js": {
      "maxDuration": 600  // 10 minutes (increased from 300s)
    }
  }
}
```

**Timeout Limits by Plan:**
- **Hobby:** 10 seconds (hobby accounts)
- **Pro:** 60 seconds (default), up to 900 seconds (15 min) max
- **Enterprise:** Custom limits available

⚠️ **Note:** Higher timeouts may incur additional costs on Pro plan.

### Updating CORS and Security Headers

**Add New Allowed Origin:**
```json
{
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Access-Control-Allow-Origin",
          "value": "https://newdomain.com"
        }
      ]
    }
  ]
}
```

**Multiple Origins:**
```bash
# Use environment variable instead (recommended)
# In Vercel dashboard, set:
ALLOWED_ORIGINS=https://www.mizuhogroup.com,https://staging.mizuhogroup.com
```

### Important Notes

- ✅ All `vercel.json` changes require **git commit + push**
- ✅ Changes take effect on **next deployment** (automatic via GitHub integration)
- ✅ Test in **Preview** environment first (push to feature branch)
- ✅ Monitor first cron execution after schedule changes
- ❌ Don't store secrets in `vercel.json` (use environment variables)

### Testing Configuration Changes Locally

```bash
# Test locally with Vercel dev server
npm run dev

# Vercel CLI respects vercel.json settings
# Test cron endpoints manually:
curl -X POST "http://localhost:3000/api/sync/full?region=americas" \
  -H "x-api-key: YOUR_API_SECRET_KEY"
```

---

## Rollback & Emergency Procedures

### Rolling Back a Deployment

When a deployment introduces issues, you can quickly rollback to a previous version.

#### Via Vercel Dashboard (Fastest - ~30 seconds)

1. **Navigate to Deployments**
   - Go to [vercel.com](https://vercel.com)
   - Select your project
   - Click **Deployments** tab

2. **Find the Last Known Good Deployment**
   - Look for the deployment before the problematic one
   - Check timestamp and git commit message
   - Verify deployment status shows "Ready"

3. **Promote to Production**
   - Click **⋯** (three dots) menu on the deployment
   - Select **"Promote to Production"**
   - Confirm the promotion

**✅ Rollback complete in ~30 seconds**

#### Via Vercel CLI

```bash
# List recent deployments
vercel ls

# Output example:
# Age  Deployment                        Status
# 2m   my-project-abc123.vercel.app     Ready
# 1h   my-project-def456.vercel.app     Ready  (Production)
# 3h   my-project-ghi789.vercel.app     Ready

# Promote specific deployment to production
vercel promote my-project-abc123.vercel.app
```

### Monitoring for Failed Deployments

#### Real-time Logs

```bash
# Watch all function executions
vercel logs --follow

# Filter for errors
vercel logs --follow | grep ERROR
vercel logs --follow | grep WARN

# Filter for specific endpoint
vercel logs --follow | grep "api/search"

# Filter for cron job executions
vercel logs --follow | grep "x-vercel-cron"

# View specific cron job
vercel logs --follow | grep "sync/full?region=americas"
```

#### Check Deployment Status

```bash
# Via CLI - List recent deployments
vercel ls

# Via API - Get deployment details
curl "https://api.vercel.com/v6/deployments?projectId=YOUR_PROJECT_ID" \
  -H "Authorization: Bearer YOUR_VERCEL_TOKEN"
```

#### Vercel Dashboard Monitoring

1. **Deployment Status:**
   - Deployments tab shows all deployments
   - Green checkmark = successful
   - Red X = failed

2. **Function Logs:**
   - Click on any deployment
   - View **Runtime Logs** tab
   - Filter by severity (Info, Warning, Error)

3. **Cron Job Status:**
   - **Cron Jobs** tab shows execution history
   - See last execution time and status

### Emergency Scenarios & Solutions

#### Emergency: Cron Job Failing

**Scenario:** Daily Americas sync at 4:00 AM UTC failed

**Investigation Steps:**

1. **Check Vercel Logs**
   ```bash
   vercel logs | grep "sync/full?region=americas" | tail -100
   ```

2. **Check Function Health**
   ```bash
   curl https://your-project.vercel.app/api/health
   ```

   **Expected Response:**
   ```json
   {
     "success": true,
     "data": {
       "status": "healthy",
       "connections": {
         "webflow": true,
         "algolia": true
       }
     }
   }
   ```

3. **Check External Service Status**
   - Webflow API: Visit [status.webflow.com](https://status.webflow.com)
   - Algolia: Visit [status.algolia.com](https://status.algolia.com)

4. **Check Environment Variables**
   - Verify `WEBFLOW_API_TOKEN` is valid
   - Verify `ALGOLIA_API_KEY` is valid
   - Check for recent environment variable changes

5. **Manual Trigger (if needed)**
   ```bash
   # Trigger the failed sync manually
   curl -X POST https://your-project.vercel.app/api/sync/full?region=americas \
     -H "x-api-key: YOUR_API_SECRET_KEY"
   ```

#### Emergency: Search API Not Working

**Quick Diagnostics:**

1. **Health Check**
   ```bash
   curl https://your-project.vercel.app/api/health
   ```

2. **Test Search Directly**
   ```bash
   curl "https://your-project.vercel.app/api/search?q=test"
   ```

3. **Check Algolia Index**
   - Log into Algolia dashboard
   - Navigate to "Search" → "mizuho_content" index
   - Verify record count (~4,382+ items)
   - Test search in Algolia's search preview

4. **Check API Key Validity**
   - Verify `ALGOLIA_SEARCH_KEY` environment variable
   - Check key permissions in Algolia dashboard
   - Regenerate if expired

5. **Check CORS Issues (if frontend)**
   - Verify `ALLOWED_ORIGINS` includes your domain
   - Check browser console for CORS errors

#### Emergency: Out of Algolia Operations Quota

**Symptoms:** Sync fails with "quota exceeded" or rate limit errors

**Immediate Actions:**

```bash
# 1. Check current Algolia usage
# Log into Algolia dashboard → Analytics → Operations

# 2. Temporarily disable non-critical cron jobs
# Edit vercel.json and comment out some cron jobs
# Prioritize: Keep Americas, EMEA, Asia Pacific
# Disable: Less critical regions temporarily

# 3. Use incremental sync instead of full sync
curl -X POST https://your-project.vercel.app/api/sync-static-pages-incremental

# 4. Upgrade Algolia plan if consistently hitting limits
```

**Prevention:**
- Monitor Algolia usage regularly
- Use incremental syncs when possible
- Optimize sync frequency based on content update patterns

#### Emergency: Deployment Failed

**Scenario:** Git push triggered deployment, but it failed

**Investigation:**

1. **Check Build Logs**
   - Go to Vercel Dashboard → Deployments
   - Click on failed deployment
   - Review **Build Logs** tab

2. **Common Failure Causes:**
   - **Syntax errors** in code
   - **Missing environment variables**
   - **Invalid `vercel.json` configuration**
   - **Dependency installation failures**

3. **Quick Fix:**
   ```bash
   # Rollback to last working deployment
   vercel ls
   vercel promote <last-working-deployment-url>

   # Fix the issue locally
   npm run lint
   npm run dev  # Test locally

   # Redeploy
   git add .
   git commit -m "fix: resolve deployment issue"
   git push origin main
   ```

### Support Contacts

**For Critical Issues:**
- **Vercel Support:** [vercel.com/support](https://vercel.com/support)
- **Webflow Support:** [webflow.com/support](https://webflow.com/support)
- **Algolia Support:** [algolia.com/support](https://algolia.com/support)

**Internal Team:**
- Check your team's internal documentation for on-call contacts
- Review incident response procedures

### Health Check Monitoring

**Set Up External Monitoring (Recommended):**

Use services like:
- **UptimeRobot** ([uptimerobot.com](https://uptimerobot.com))
- **Pingdom** ([pingdom.com](https://pingdom.com))
- **StatusCake** ([statuscake.com](https://statuscake.com))

**Monitor:**
```
URL: https://your-project.vercel.app/api/health
Check every: 5 minutes
Alert if: Status != 200 OR response.status != "healthy"
```

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

### Webflow Webhooks (Real-time Updates)

**Endpoint:** `POST /api/webhooks/webflow`

**Purpose:** Receive real-time updates from Webflow for the Beyond the Obvious collection. This endpoint handles automatic indexing when items are created, updated, deleted, or unpublished in Webflow.

**Authentication:** Uses HMAC SHA-256 signature validation with the `WEBFLOW_WEBHOOK_SECRET` environment variable.

**Supported Events:**
- `collection_item_created` - Index newly created items
- `collection_item_changed` - Update existing items
- `collection_item_published` - Index published items
- `collection_item_deleted` - Remove items from index
- `collection_item_unpublished` - Remove items from index

**Headers Required:**
- `x-webflow-timestamp` - Unix timestamp (milliseconds) when webhook was sent
- `x-webflow-signature` - HMAC SHA-256 signature for validation

**Example Payload:**
```json
{
  "triggerType": "collection_item_created",
  "payload": {
    "id": "item-id-here",
    "siteId": "site-id-here",
    "collectionId": "collection-id-here",
    "fieldData": {
      "name": "Item Name",
      "slug": "item-slug"
    },
    "isDraft": false,
    "isArchived": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "triggerType": "collection_item_created",
    "itemId": "item-id-here",
    "processed": true,
    "action": "indexed",
    "timestamp": "2025-01-21T00:00:00.000Z"
  }
}
```

**Setup Instructions:**

1. Set the `WEBFLOW_WEBHOOK_SECRET` environment variable (OAuth client secret or webhook-specific secret)
2. Create webhooks in Webflow for the Beyond the Obvious collection:
   - Collection Item Created
   - Collection Item Changed
   - Collection Item Published
   - Collection Item Deleted
   - Collection Item Unpublished
3. Point webhook URL to: `https://your-project.vercel.app/api/webhooks/webflow`
4. Webflow will send real-time notifications when items change

**Notes:**
- The Beyond the Obvious collection is excluded from cron jobs to avoid duplicate syncs
- Webhook requests must be received within 5 minutes of the timestamp (replay attack prevention)
- Only published, non-archived items are indexed
- Draft and archived items are automatically skipped

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

The system uses **10 Vercel cron jobs** to automatically sync content daily:

- **2 jobs** for static pages (daily incremental + monthly full sync)
- **8 jobs** for CMS collections (one per region, consolidated)

**Key Benefits:**
- ✅ No manual syncing needed
- ✅ Content stays fresh (daily updates)
- ✅ Under Vercel's 20 cron job limit
- ✅ Each job completes well within Vercel's 5-minute timeout
- ✅ Regional syncs handle multiple collections efficiently
- ✅ Optimized logging (under 150 lines per sync)

---

### Cron Schedule Design

```
Time (UTC)  | Job                                    | Frequency | Duration
------------|----------------------------------------|-----------|----------
2:00 AM     | Static Pages Incremental Sync          | Daily     | ~5-10 min
3:00 AM     | Static Pages Full Sync                 | Monthly   | ~10-15 min
4:00 AM     | Americas Region CMS Sync               | Daily     | ~2-5 min
5:00 AM     | EMEA Region CMS Sync                   | Daily     | ~2-4 min
6:00 AM     | Asia Pacific Region CMS Sync           | Daily     | ~2-4 min
7:00 AM     | Mizuho Bank Region CMS Sync            | Daily     | ~1-3 min
8:00 AM     | Mizuho Securities Region CMS Sync      | Daily     | ~1-2 min
9:00 AM     | Mizuho Trust Banking Region CMS Sync   | Daily     | ~1-2 min
10:00 AM    | Japan Region CMS Sync                  | Daily     | ~1 min
11:00 AM    | Worldwide Region CMS Sync              | Daily     | ~3-5 min
```

**What Each Regional Sync Does:**
- **Americas**: Syncs 6 collections (people, events, insights, awards, news, brazil-info)
- **EMEA**: Syncs 7 collections (news, people, events, leaders, france, saudi-arabia, russia)
- **Asia Pacific**: Syncs 7 collections (insights, news, malaysia, hong-kong, singapore, taiwan, gift-city)
- **Mizuho Bank**: Syncs bank-news collection
- **Mizuho Securities**: Syncs securities-news collection
- **Mizuho Trust Banking**: Syncs trust-and-banking-news collection
- **Japan**: Syncs japan-intl-cards collection
- **Worldwide**: Syncs 10 collections (beyond-the-obvious, global-news, news-releases, etc.)

**Design Rationale:**
- Runs during low-traffic hours (2:00-11:00 AM UTC)
- Staggered 1 hour apart to avoid API rate limits
- Static pages run first (incremental daily, full monthly on 1st)
- Regional consolidation reduces cron job count from 36 to 10
- All jobs complete well before business hours

---

### Vercel Configuration

The cron jobs are configured in [`vercel.json`](vercel.json):

```json
{
  "version": 2,
  "functions": {
    "api/**/*.js": {
      "maxDuration": 300
    }
  },
  "env": {
    "NODE_ENV": "production",
    "LOG_LEVEL": "info"
  },
  "crons": [
    {
      "path": "/api/sync-static-pages-incremental",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/sync-static-pages-incremental?forceFullSync=true",
      "schedule": "0 3 1 * *"
    },
    {
      "path": "/api/sync/full?region=americas",
      "schedule": "0 4 * * *"
    },
    {
      "path": "/api/sync/full?region=europe-middle-east-africa",
      "schedule": "0 5 * * *"
    },
    {
      "path": "/api/sync/full?region=asia-pacific",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/sync/full?region=mizuho-bank",
      "schedule": "0 7 * * *"
    },
    {
      "path": "/api/sync/full?region=mizuho-securities",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/sync/full?region=mizuho-trust-banking",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/sync/full?region=japan",
      "schedule": "0 10 * * *"
    },
    {
      "path": "/api/sync/full?region=worldwide",
      "schedule": "0 11 * * *"
    }
  ]
}
```

**Schedule format:** [Cron expression](https://crontab.guru/)
- `0 2 * * *` = Every day at 2:00 AM UTC
- `0 3 1 * *` = Every 1st day of month at 3:00 AM UTC
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

### Common Development Scenarios

#### Scenario 1: Adding a New CMS Collection

**Example: Adding "EMEA Awards" Collection**

**Steps:**

1. **Get Collection ID from Webflow**
   - Go to Webflow → CMS → [Collection] → Settings
   - Copy the Collection ID

2. **Add to Local `.env`:**
   ```env
   CMS_EMEA_AWARDS=67cb23eaf0c6c4d4080e059b
   ```

3. **Update `lib/constants/collections.js`:**
   ```javascript
   export const CMS_COLLECTIONS = {
     // ... existing collections ...

     EMEA_AWARDS: {
       id: 'emea-awards',
       name: 'EMEA Awards',
       region: 'europe-middle-east-africa',
       envKey: 'CMS_EMEA_AWARDS',
       fields: {
         name: 'name',
         slug: 'slug',
         summary: 'summary',
         date: 'date',
         // Add other field mappings as needed
       }
     }
   };
   ```

4. **Update `.env.example`:**
   ```env
   # EMEA Region
   CMS_EMEA_AWARDS=your_collection_id_here
   ```

5. **Test Locally:**
   ```bash
   # Validate environment
   npm run validate-env

   # Test sync
   node scripts/sync-single-collection.js emea-awards
   ```

6. **Update Environment Variables in Vercel:**
   - Vercel Dashboard → Settings → Environment Variables
   - Add `CMS_EMEA_AWARDS` with the collection ID
   - Add for Production, Preview, and Development

7. **Commit and Deploy:**
   ```bash
   git add lib/constants/collections.js .env.example
   git commit -m "feat: add EMEA Awards collection support"
   git push origin main
   ```

#### Scenario 2: Modifying Field Mappings

**Example: Add "author" field to Americas News**

**Steps:**

1. **Edit [lib/constants/collections.js](lib/constants/collections.js:112):**
   ```javascript
   AMERICAS_NEWS: {
     id: 'americas-news',
     name: 'Americas News',
     region: 'americas',
     envKey: 'CMS_AMERICAS_NEWS',
     fields: {
       name: 'name',
       slug: 'slug',
       summary: 'summary',
       date: 'date',
       author: 'author',  // ← Add new field mapping
       // ... other fields
     }
   }
   ```

2. **Update Transformer Logic (if needed):**
   - Edit [lib/transformers/cms-transformer.js](lib/transformers/cms-transformer.js) if custom processing is required

3. **Test Transformation:**
   ```bash
   # Sync the collection and verify output
   node scripts/sync-single-collection.js americas-news
   ```

4. **Verify in Algolia Dashboard:**
   - Go to Algolia → Search → mizuho_content
   - Check that new field appears in records
   - Update searchable attributes if needed:
     ```bash
     npm run update-settings
     ```

5. **Deploy Changes:**
   ```bash
   git add lib/constants/collections.js
   git commit -m "feat: add author field to Americas News"
   git push origin main
   ```

#### Scenario 3: Changing Regional Assignment

**For CMS Collections:**

Edit the `region` field in [lib/constants/collections.js](lib/constants/collections.js):

```javascript
EXAMPLE_COLLECTION: {
  id: 'example-collection',
  name: 'Example Collection',
  region: 'asia-pacific',  // ← Change region assignment
  // ...
}
```

**For Static Pages:**

Edit detection logic in [lib/webflow/static-fetcher.js](lib/webflow/static-fetcher.js#L550-L589):

```javascript
// Folder-based detection
const folderRegionMap = {
  [FOLDER_AMERICAS]: 'americas',
  [FOLDER_EMEA]: 'europe-middle-east-africa',
  // ... add new folder mappings
};

// Keyword-based detection
if (slug.includes('new-region-keyword')) {
  return 'new-region';
}
```

#### Scenario 4: Updating Algolia Index Settings

**Example: Add New Searchable Attributes**

**Steps:**

1. **Edit [lib/algolia/client.js](lib/algolia/client.js) or create migration script:**
   ```javascript
   // scripts/update-algolia-settings.js
   const settings = {
     searchableAttributes: [
       'title',
       'summary',
       'content',
       'author',  // ← Add new searchable field
       'categories'
     ],
     attributesForFaceting: [
       'filterOnly(region)',
       'filterOnly(type)',
       'author'  // ← Add as facet
     ]
   };

   await index.setSettings(settings);
   ```

2. **Run Update Script:**
   ```bash
   npm run update-settings
   ```

3. **Verify in Algolia Dashboard:**
   - Algolia → Indices → mizuho_content → Configuration
   - Check that settings were applied

4. **Test Search:**
   ```bash
   # Test faceted search
   curl "https://your-project.vercel.app/api/search?q=test&facetFilters=author:John%20Doe"
   ```

5. **Deploy if Code Changes Made:**
   ```bash
   git add scripts/update-algolia-settings.js
   git commit -m "feat: add author as searchable attribute and facet"
   git push origin main
   ```

#### Scenario 5: Adding a New API Endpoint

**Example: Create `/api/stats` endpoint**

**Steps:**

1. **Create API File:**
   ```bash
   touch api/stats.js
   ```

2. **Write Endpoint Logic:**
   ```javascript
   // api/stats.js
   import { getAlgoliaClient } from '../lib/algolia/client.js';

   export default async function handler(req, res) {
     try {
       const index = getAlgoliaClient().initIndex('mizuho_content');

       // Get index statistics
       const { nbHits } = await index.search('', { hitsPerPage: 0 });

       res.status(200).json({
         success: true,
         data: {
           totalIndexed: nbHits,
           lastUpdated: new Date().toISOString()
         }
       });
     } catch (error) {
       res.status(500).json({
         success: false,
         error: error.message
       });
     }
   }
   ```

3. **Test Locally:**
   ```bash
   npm run dev
   curl "http://localhost:3000/api/stats"
   ```

4. **Add to Documentation:**
   - Update API Reference section in README
   - Add to Table of Contents if needed

5. **Deploy:**
   ```bash
   git add api/stats.js README.md
   git commit -m "feat: add stats API endpoint"
   git push origin main
   ```

#### Scenario 6: Debugging a Sync Issue

**Problem: Collection not syncing properly**

**Debugging Steps:**

1. **Enable Debug Logging:**
   ```bash
   # In .env
   LOG_LEVEL=debug
   ```

2. **Run Sync Locally:**
   ```bash
   node scripts/sync-single-collection.js problematic-collection
   ```

3. **Check Common Issues:**
   - **Environment variable missing:** `npm run validate-env`
   - **Collection ID incorrect:** Verify in Webflow CMS settings
   - **Field mapping errors:** Check console output for transformation errors
   - **API rate limits:** Check for 429 errors in logs

4. **Test Webflow API Directly:**
   ```bash
   curl "https://api.webflow.com/v2/collections/COLLECTION_ID/items" \
     -H "Authorization: Bearer YOUR_WEBFLOW_TOKEN"
   ```

5. **Test Algolia Indexing:**
   ```bash
   # Check if items are being indexed
   # Log into Algolia dashboard → Indices → mizuho_content
   # Search for specific items
   ```

6. **Fix and Re-test:**
   ```bash
   # After fixing the issue
   node scripts/sync-single-collection.js problematic-collection
   ```

---

## Additional Resources

### Documentation

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

## Client Guide - Quick Reference

### For Non-Technical Users

This section provides quick answers to common questions for content managers and non-technical stakeholders.

#### "I published new content in Webflow, when will it appear in search?"

**Automatic Synchronization (Recommended):**

Content syncs automatically every day via scheduled cron jobs. Wait time depends on your region:

| Region | Sync Time (UTC) | Wait Time |
|--------|----------------|-----------|
| **Static Pages** | 2:00 AM daily | Up to 24 hours |
| **Americas** | 4:00 AM daily | Up to 24 hours |
| **EMEA** | 5:00 AM daily | Up to 24 hours |
| **Asia Pacific** | 6:00 AM daily | Up to 24 hours |
| **Mizuho Bank** | 7:00 AM daily | Up to 24 hours |
| **Mizuho Securities** | 8:00 AM daily | Up to 24 hours |
| **Mizuho Trust & Banking** | 9:00 AM daily | Up to 24 hours |
| **Japan** | 10:00 AM daily | Up to 24 hours |
| **Worldwide** | 11:00 AM daily | Up to 24 hours |

**Manual Sync (Immediate):**

If you need content to be searchable immediately, contact your development team to run:
```bash
npm run sync-cms
```

#### "How do I verify my content is searchable?"

**Method 1: Via Search API**

Test the search endpoint directly in your browser:
```
https://your-project.vercel.app/api/search?q=<your-content-title>&region=americas
```

Replace:
- `<your-content-title>` with keywords from your content
- `region=americas` with your specific region

**Method 2: Via Algolia Dashboard**

1. Log into [algolia.com](https://algolia.com)
2. Navigate to **Search** → **mizuho_content** index
3. Use the search preview to test queries
4. Check the total number of records matches expectations

**Expected Result:**
Your content should appear in search results with:
- Title
- Summary
- Region
- Publication date
- Categories/tags

#### "Content isn't showing up in search, what should I check?"

**Troubleshooting Checklist:**

1. **✅ Is content published in Webflow?**
   - Content must be **Published**, not **Draft**
   - Check Webflow CMS → [Collection] → Status

2. **✅ Has the automatic sync run yet?**
   - Check the sync schedule table above
   - Wait up to 24 hours for automatic sync

3. **✅ Are you searching in the correct region?**
   - Try searching with `region=worldwide` to check all regions
   - Verify your content is assigned to the correct region

4. **✅ Is the search query correct?**
   - Check for typos in keywords
   - Try partial matches (e.g., "sustain" instead of "sustainability")

5. **✅ Contact developer for manual sync**
   - If urgent, ask developer to trigger manual sync
   - Provide collection name and item details

#### "How often does content sync to search?"

**Sync Frequency:**
- **CMS Collections:** Once per day (based on region schedule)
- **Static Pages:** Daily incremental sync at 2:00 AM UTC
- **Full Sync:** Monthly on the 1st at 3:00 AM UTC (static pages only)

**What Triggers a Sync:**
- **Automatic:** Scheduled cron jobs run daily
- **Manual:** Developer-triggered sync via command line or API

**What Gets Synced:**
- ✅ New content published in Webflow
- ✅ Updates to existing content
- ✅ Deleted content (removed from index)
- ✅ Metadata changes (title, summary, categories)

#### "Can I trigger a sync myself?"

**No - Requires Developer Access**

Manual syncs require:
- Command line access to the project
- Vercel API credentials
- Understanding of sync scripts

**What You Can Do:**
1. **Wait for automatic sync** (up to 24 hours)
2. **Contact your development team** to request manual sync
3. **Provide details:**
   - Collection name (e.g., "Americas News")
   - Item title or ID
   - Urgency level

#### "Who do I contact for help?"

**For Content/Publishing Issues:**
- **Webflow Support:** [webflow.com/support](https://webflow.com/support)
- Contact for issues with Webflow CMS, publishing, or content management

**For Search Issues:**
- **Your Development Team:** [Contact your internal team]
- Contact for search not working, content not appearing, or technical issues

**For Urgent Production Issues:**
- **Vercel Support:** [vercel.com/support](https://vercel.com/support) (if deployment/hosting issues)
- **Algolia Support:** [algolia.com/support](https://algolia.com/support) (if search service issues)

**When Contacting Support, Provide:**
- Clear description of the issue
- Steps to reproduce the problem
- Expected vs. actual behavior
- Screenshots if applicable
- Time when issue started

#### "What content gets indexed for search?"

**34 CMS Collections:**
- Americas: People, Events, Insights, Awards, News, Brazil Information
- EMEA: News, Events, People, Leaders, France/Saudi Arabia/Russia Information
- Asia Pacific: Insights, News, Country Information (Malaysia, Hong Kong, Singapore, Taiwan, Gift City)
- Business Units: Bank News, Securities News, Trust & Banking News
- Japan: International Cards
- Worldwide: Beyond The Obvious, Global News, Mizuho Global Services, Digital Articles, Financial Data

**~651 Static Pages:**
- All published Webflow pages
- Excludes: 404 pages, admin pages, test pages, utility pages

**Total Searchable Items:** 4,382+ and growing

#### "How can I improve search results for my content?"

**Best Practices:**

1. **Write Clear Titles**
   - Use descriptive, keyword-rich titles
   - Include main topic/subject
   - Avoid generic titles like "Article 1"

2. **Craft Good Summaries**
   - Write 1-2 sentence summaries
   - Include key terms users might search for
   - Avoid leaving summary field empty

3. **Use Categories/Tags**
   - Assign relevant categories
   - Use consistent taxonomy
   - Tag with industry types, areas of interest

4. **Set Correct Publication Date**
   - Ensure date field is set
   - Recent content ranks higher
   - Keep dates accurate

5. **Assign to Correct Region**
   - Content is automatically filtered by region
   - Verify content is in the right collection
   - Contact developer if regional assignment needs changing

#### "What if I see 'undefined' in search results?"

**This has been fixed** in the latest version (v2.0.0).

If you still see "undefined" appearing in summaries:
1. Contact your development team
2. Request a re-sync of the affected collection
3. The fix ensures missing fields show blank instead of "undefined"

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

*Last Updated: November 26, 2025*
*Version: 2.0.0*
*Total Items Indexed: 4,382+*
*Cron Jobs: 10 (Daily Consolidated)*
