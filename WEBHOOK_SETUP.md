# Webflow Webhook Setup Guide

## Overview

This guide explains how to set up Webflow webhooks for real-time synchronization of the **Beyond the Obvious** CMS collection to Algolia. With webhooks, content changes in Webflow are immediately reflected in your Algolia search index without waiting for scheduled cron jobs.

## Benefits of Webhook-Based Sync

- ⚡ **Real-time updates**: Changes appear in search results within seconds
- 🔄 **Automatic sync**: No manual intervention required
- 🎯 **Targeted updates**: Only modified items are synced, not entire collections
- 💰 **Cost efficient**: Reduces unnecessary full-collection syncs
- 🛡️ **Secure**: HMAC SHA-256 signature validation prevents unauthorized requests

## Architecture

```
┌─────────────────┐
│  Webflow CMS    │
│  (BTO Collection│
│   changes)      │
└────────┬────────┘
         │ Webhook Event
         ▼
┌─────────────────────────────────────┐
│  /api/webhooks/webflow              │
│  ├── Validate signature (HMAC)     │
│  ├── Check timestamp (<5 min)       │
│  └── Verify collection ID           │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Webhook Processor                  │
│  ├── created/changed → Index item   │
│  ├── deleted/unpublished → Remove   │
│  └── Skip drafts & archived items   │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Algolia Index                      │
│  (Real-time search results)         │
└─────────────────────────────────────┘
```

## Prerequisites

1. **Webflow Account** with Data API access
2. **OAuth Application** (for webhook signature) OR site token (April 2025+)
3. **Deployed Vercel application** with public URL
4. **Environment variables** configured

## Setup Steps

### Step 1: Configure Environment Variables

Add the following to your `.env` file and Vercel environment variables:

```bash
# Webflow Webhook Secrets (one per trigger type)
# Each webhook created in Webflow dashboard gets its own unique secret
# Copy these secrets from Webflow when creating each webhook
WEBFLOW_WEBHOOK_SECRET_CREATE=your_create_webhook_secret_here
WEBFLOW_WEBHOOK_SECRET_CHANGE=your_change_webhook_secret_here
WEBFLOW_WEBHOOK_SECRET_PUBLISH=your_publish_webhook_secret_here
WEBFLOW_WEBHOOK_SECRET_DELETE=your_delete_webhook_secret_here
WEBFLOW_WEBHOOK_SECRET_UNPUBLISH=your_unpublish_webhook_secret_here

# Existing variables (required)
CMS_BEYOND_THE_OBVIOUS=your_collection_id_here
WEBFLOW_API_TOKEN=your_api_token_here
WEBFLOW_SITE_ID=your_site_id_here
ALGOLIA_APP_ID=your_algolia_app_id
ALGOLIA_API_KEY=your_algolia_admin_key
ALGOLIA_INDEX_NAME=mizuho_content
```

**Note**: If using OAuth app to create webhooks programmatically, you can use the legacy single secret:
```bash
WEBFLOW_WEBHOOK_SECRET=your_oauth_client_secret
```

### Step 2: Deploy to Vercel

Ensure your application is deployed and the webhook endpoint is accessible:

```bash
# Deploy to Vercel
vercel --prod

# Note your production URL
# e.g., https://mizuho-algolia-search.vercel.app
```

### Step 3: Create Webhooks in Webflow

You have three options for creating webhooks:

#### Option A: Automated Setup Script (Recommended ⭐)

Use our automated setup script to create all 5 webhooks with proper collection filtering:

```bash
# Setup webhooks for production
node scripts/setup-webhooks.js https://your-project.vercel.app

# Setup webhooks for local testing
node scripts/setup-webhooks.js http://localhost:3000
```

This script will:
- ✅ Create all 5 webhook events (created, changed, published, deleted, unpublished)
- ✅ Automatically filter to ONLY the Beyond the Obvious collection
- ✅ Show you existing webhooks before creating new ones
- ✅ Provide a summary of successful/failed webhook creation

**Important**: This requires your `WEBFLOW_API_TOKEN` to have `webhook:write` scope.

#### Option B: Using Webflow Dashboard (Recommended)

1. Go to **Site Settings** → **Integrations** → **Webhooks**
2. Click **Create New Webhook**

**For each webhook type, follow these steps:**

##### Webhook 1: Collection Item Created
- **Name**: Beyond the Obvious - Collection Item Created
- **Trigger Type**: Collection Item Created
- **URL**: `https://mizuho-algolia.vercel.app/api/webhooks/webflow`
- Click **Create Webhook**
- **⚠️ IMPORTANT**: Copy the generated secret immediately (you won't see it again!)
- Save this as `WEBFLOW_WEBHOOK_SECRET_CREATE` in your `.env`

##### Webhook 2: Collection Item Changed
- **Name**: Beyond the Obvious - Collection Item Changed
- **Trigger Type**: Collection Item Changed
- **URL**: `https://mizuho-algolia.vercel.app/api/webhooks/webflow`
- Click **Create Webhook**
- **⚠️ IMPORTANT**: Copy the generated secret
- Save this as `WEBFLOW_WEBHOOK_SECRET_CHANGE` in your `.env`

##### Webhook 3: Collection Item Published
- **Name**: Beyond the Obvious - Collection Item Published
- **Trigger Type**: Collection Item Published
- **URL**: `https://mizuho-algolia.vercel.app/api/webhooks/webflow`
- Click **Create Webhook**
- **⚠️ IMPORTANT**: Copy the generated secret
- Save this as `WEBFLOW_WEBHOOK_SECRET_PUBLISH` in your `.env`

##### Webhook 4: Collection Item Deleted
- **Name**: Beyond the Obvious - Collection Item Deleted
- **Trigger Type**: Collection Item Deleted
- **URL**: `https://mizuho-algolia.vercel.app/api/webhooks/webflow`
- Click **Create Webhook**
- **⚠️ IMPORTANT**: Copy the generated secret
- Save this as `WEBFLOW_WEBHOOK_SECRET_DELETE` in your `.env`

##### Webhook 5: Collection Item Unpublished
- **Name**: Beyond the Obvious - Collection Item Unpublished
- **Trigger Type**: Collection Item Unpublished
- **URL**: `https://mizuho-algolia.vercel.app/api/webhooks/webflow`
- Click **Create Webhook**
- **⚠️ IMPORTANT**: Copy the generated secret
- Save this as `WEBFLOW_WEBHOOK_SECRET_UNPUBLISH` in your `.env`

**Important Notes**:
- Each webhook gets its own unique secret
- Secrets are only shown once - copy them immediately!
- Webflow does NOT support collection-level filtering at creation, so these webhooks will trigger for ALL CMS collections (our handler filters to only process Beyond the Obvious)

#### Option C: Using Webflow API (Manual)

If you prefer manual control, create webhooks via API:

```bash
# Create webhook for collection_item_created
curl -X POST https://api.webflow.com/v2/sites/{siteId}/webhooks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "triggerType": "collection_item_created",
    "url": "https://mizuho-algolia.vercel.app/api/webhooks/webflow",
    "filter": {
      "collectionIds": ["YOUR_BTO_COLLECTION_ID"]
    }
  }'
```

**The `filter.collectionIds` array is critical** - it ensures the webhook only triggers for the Beyond the Obvious collection.

Repeat for each trigger type: `collection_item_changed`, `collection_item_published`, `collection_item_deleted`, `collection_item_unpublished`.

**Note**: For OAuth webhooks, the `WEBFLOW_WEBHOOK_SECRET` should be your OAuth client secret.

### Managing Existing Webhooks

Use the webhook management script to view and clean up webhooks:

```bash
# List all webhooks
node scripts/manage-webhooks.js list

# Delete a specific webhook
node scripts/manage-webhooks.js delete <webhook-id>

# Delete all Beyond the Obvious webhooks (useful before recreating)
node scripts/manage-webhooks.js clean-bto
```

### Step 4: Test the Webhook

Use the included test script to verify your webhook setup:

```bash
# Test creation event
node scripts/test-webhook.js created https://your-project.vercel.app/api/webhooks/webflow

# Test changed event
node scripts/test-webhook.js changed https://your-project.vercel.app/api/webhooks/webflow

# Test deletion event
node scripts/test-webhook.js deleted https://your-project.vercel.app/api/webhooks/webflow

# Run all tests (including security tests)
node scripts/test-webhook.js created https://your-project.vercel.app/api/webhooks/webflow --all-tests
```

Expected output for successful test:
```
✅ Webhook request successful!

Response Status: 200
Response Data:
{
  "success": true,
  "data": {
    "triggerType": "collection_item_created",
    "itemId": "...",
    "processed": true,
    "action": "indexed",
    "timestamp": "2025-01-21T00:00:00.000Z"
  }
}
```

### Step 5: Verify in Production

1. **Make a change** in the Beyond the Obvious collection in Webflow
2. **Check Vercel logs** to see webhook received and processed
3. **Search in Algolia** to verify the change is reflected

## Webhook Events

### 1. Collection Item Created

**Trigger**: New item published in Beyond the Obvious collection

**Action**: Fetches full item data from Webflow, transforms it, and indexes to Algolia

**Payload Example**:
```json
{
  "triggerType": "collection_item_created",
  "payload": {
    "id": "abc123",
    "siteId": "site123",
    "collectionId": "coll123",
    "isDraft": false,
    "isArchived": false,
    "fieldData": {
      "name": "New Insight Article",
      "slug": "new-insight-article"
    }
  }
}
```

### 2. Collection Item Changed

**Trigger**: Existing item updated in Webflow

**Action**: Re-fetches item data and updates in Algolia

### 3. Collection Item Published

**Trigger**: Draft item published

**Action**: Indexes the newly published item to Algolia

### 4. Collection Item Deleted

**Trigger**: Item permanently deleted from Webflow

**Action**: Removes item from Algolia index using objectID `cms_{itemId}`

### 5. Collection Item Unpublished

**Trigger**: Item unpublished (but not deleted)

**Action**: Removes item from Algolia index (unpublished = not searchable)

## Security

### Signature Validation

All webhook requests are validated using HMAC SHA-256:

1. **Timestamp Check**: Requests older than 5 minutes are rejected (replay attack prevention)
2. **Signature Verification**: HMAC signature is computed and compared using timing-safe comparison
3. **Collection Verification**: Only Beyond the Obvious collection webhooks are processed

### Headers

Every webhook request includes:
- `x-webflow-timestamp`: Unix timestamp in milliseconds
- `x-webflow-signature`: HMAC SHA-256 hash of `{timestamp}:{body}` using webhook secret

### Validation Algorithm

```javascript
const message = `${timestamp}:${requestBody}`;
const computed = crypto.createHmac('sha256', secret).update(message).digest('hex');
const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
```

## Exclusion from Cron Jobs

To prevent duplicate syncs, the Beyond the Obvious collection is automatically excluded from scheduled cron jobs:

**Modified Files**:
- `lib/webflow/cms-fetcher.js` - Added `excludeCollections` parameter
- `lib/algolia/indexer.js` - Excludes 'beyond-the-obvious' by default

**Result**: Cron jobs sync all collections **except** Beyond the Obvious, which is managed exclusively via webhooks.

## Troubleshooting

### Webhook Not Receiving Events

**Check**:
1. Webhook URL is correct and publicly accessible
2. Webflow webhook is active (check webhook status in dashboard)
3. Collection ID matches `CMS_BEYOND_THE_OBVIOUS` environment variable

**Debug**:
```bash
# Check Vercel function logs
vercel logs --prod

# Look for "WebflowWebhook" context logs
```

### Signature Validation Failing

**Check**:
1. `WEBFLOW_WEBHOOK_SECRET` matches the secret used by Webflow
2. For OAuth webhooks: Use OAuth client secret
3. For site token webhooks: Use webhook-specific secret from dashboard

**Test locally**:
```bash
# Test with known good signature
node scripts/test-webhook.js created http://localhost:3000/api/webhooks/webflow
```

### Item Not Appearing in Search

**Check**:
1. Item is published (not draft)
2. Item is not archived
3. Webhook response shows `"processed": true, "action": "indexed"`
4. Check Algolia dashboard to verify object exists

**Manual re-index**:
```bash
# Force re-index of Beyond the Obvious collection
curl -X POST https://your-project.vercel.app/api/sync-collections \
  -H "Authorization: Bearer YOUR_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"collectionId": "beyond-the-obvious"}'
```

### Old Timestamp Error

**Cause**: Webhook request took longer than 5 minutes to reach your endpoint (network issues, clock skew)

**Solution**:
- Check server time synchronization
- Verify network connectivity
- Contact Webflow support if persistent

## Monitoring

### Webhook Logs

View webhook activity in Vercel logs:

```bash
vercel logs --prod --filter="WebflowWebhook"
```

Look for:
- ✅ `Webhook signature validated successfully`
- ✅ `Webhook processed successfully`
- ❌ `Webhook signature validation failed`
- ❌ `Invalid webhook payload`

### Algolia Dashboard

Monitor indexing in Algolia:
1. Go to **Algolia Dashboard** → **Indices** → `mizuho_content`
2. Check **Events** tab for recent indexing operations
3. Verify object count increases/decreases with changes

### Webflow Webhook Dashboard

Check webhook delivery status:
1. Go to **Site Settings** → **Webhooks**
2. Click on each webhook to see delivery history
3. Check for failed deliveries and retry

## Best Practices

1. **Set up all 5 webhook events** to handle all content lifecycle stages
2. **Monitor webhook logs regularly** to catch issues early
3. **Test webhooks after deployment** to ensure configuration is correct
4. **Keep webhook secret secure** - treat it like a password
5. **Use environment variables** for all secrets (never hardcode)
6. **Set up alerting** for webhook failures using Vercel integrations

## Reference Links

- [Webflow Webhook Documentation](https://developers.webflow.com/data/docs/working-with-webhooks)
- [Webflow Webhook Signatures](https://developers.webflow.com/data/changelog/webhook-signatures)
- [Algolia Indexing API](https://www.algolia.com/doc/api-reference/api-methods/save-objects/)

## Support

If you encounter issues:
1. Check Vercel function logs
2. Review webhook delivery status in Webflow dashboard
3. Test with `scripts/test-webhook.js`
4. Verify all environment variables are set correctly
