#!/usr/bin/env node

/**
 * Setup Webflow Webhooks for Beyond the Obvious Collection
 *
 * This script creates 5 webhooks in Webflow that are filtered to ONLY trigger
 * for the Beyond the Obvious CMS collection.
 *
 * Prerequisites:
 * - WEBFLOW_API_TOKEN with webhook:write scope
 * - WEBFLOW_SITE_ID
 * - CMS_BEYOND_THE_OBVIOUS collection ID
 * - Deployed webhook endpoint URL
 *
 * Usage:
 *   node scripts/setup-webhooks.js https://your-project.vercel.app
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID;
const BTO_COLLECTION_ID = process.env.CMS_BEYOND_THE_OBVIOUS;

// Get webhook URL from command line or use default
const webhookBaseUrl = process.argv[2] || 'http://localhost:3000';
const webhookUrl = `${webhookBaseUrl}/api/webhooks/webflow`;

console.log('\n🔧 Webflow Webhook Setup Script');
console.log('=================================\n');

// Validate environment variables
if (!WEBFLOW_API_TOKEN) {
  console.error('❌ Error: WEBFLOW_API_TOKEN not set in environment');
  process.exit(1);
}

if (!WEBFLOW_SITE_ID) {
  console.error('❌ Error: WEBFLOW_SITE_ID not set in environment');
  process.exit(1);
}

if (!BTO_COLLECTION_ID) {
  console.error('❌ Error: CMS_BEYOND_THE_OBVIOUS not set in environment');
  process.exit(1);
}

console.log('Configuration:');
console.log(`  Site ID: ${WEBFLOW_SITE_ID}`);
console.log(`  BTO Collection ID: ${BTO_COLLECTION_ID}`);
console.log(`  Webhook URL: ${webhookUrl}`);
console.log('\n---\n');

// Define webhooks to create
const webhooksToCreate = [
  {
    triggerType: 'collection_item_created',
    description: 'Beyond the Obvious - Item Created'
  },
  {
    triggerType: 'collection_item_changed',
    description: 'Beyond the Obvious - Item Changed'
  },
  {
    triggerType: 'collection_item_published',
    description: 'Beyond the Obvious - Item Published'
  },
  {
    triggerType: 'collection_item_deleted',
    description: 'Beyond the Obvious - Item Deleted'
  },
  {
    triggerType: 'collection_item_unpublished',
    description: 'Beyond the Obvious - Item Unpublished'
  }
];

/**
 * Create a webhook in Webflow with collection filtering
 */
async function createWebhook(triggerType, description) {
  try {
    console.log(`📌 Creating webhook: ${description}`);
    console.log(`   Trigger: ${triggerType}`);

    const response = await axios.post(
      `https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/webhooks`,
      {
        triggerType: triggerType,
        url: webhookUrl,
        // IMPORTANT: Filter to only trigger for Beyond the Obvious collection
        filter: {
          collectionIds: [BTO_COLLECTION_ID]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
          'Content-Type': 'application/json',
          'accept': 'application/json'
        }
      }
    );

    console.log(`   ✅ Created successfully!`);
    console.log(`   Webhook ID: ${response.data.id || response.data._id || 'N/A'}`);
    console.log('');

    return {
      success: true,
      webhookId: response.data.id || response.data._id,
      triggerType,
      description
    };

  } catch (error) {
    console.error(`   ❌ Failed to create webhook`);

    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
    console.log('');

    return {
      success: false,
      error: error.message,
      triggerType,
      description
    };
  }
}

/**
 * List existing webhooks
 */
async function listExistingWebhooks() {
  try {
    console.log('📋 Checking existing webhooks...\n');

    const response = await axios.get(
      `https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/webhooks`,
      {
        headers: {
          'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
          'accept': 'application/json'
        }
      }
    );

    const webhooks = response.data.webhooks || response.data;

    if (!webhooks || webhooks.length === 0) {
      console.log('   No existing webhooks found.\n');
      return [];
    }

    console.log(`   Found ${webhooks.length} existing webhook(s):\n`);
    webhooks.forEach((webhook, index) => {
      console.log(`   ${index + 1}. ${webhook.triggerType}`);
      console.log(`      ID: ${webhook.id || webhook._id}`);
      console.log(`      URL: ${webhook.url}`);
      if (webhook.filter?.collectionIds) {
        console.log(`      Collections: ${webhook.filter.collectionIds.join(', ')}`);
      }
      console.log('');
    });

    return webhooks;

  } catch (error) {
    console.error('   ❌ Failed to list webhooks');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   Error: ${error.message}`);
    }
    console.log('');
    return [];
  }
}

/**
 * Delete a webhook
 */
async function deleteWebhook(webhookId) {
  try {
    await axios.delete(
      `https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/webhooks/${webhookId}`,
      {
        headers: {
          'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
          'accept': 'application/json'
        }
      }
    );
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to delete webhook ${webhookId}: ${error.message}`);
    return false;
  }
}

/**
 * Main setup function
 */
async function setupWebhooks() {
  console.log('🚀 Starting webhook setup...\n');

  // Step 1: List existing webhooks
  const existingWebhooks = await listExistingWebhooks();

  // Step 2: Ask if user wants to delete existing webhooks for BTO collection
  if (existingWebhooks.length > 0) {
    const btoWebhooks = existingWebhooks.filter(wh =>
      wh.filter?.collectionIds?.includes(BTO_COLLECTION_ID)
    );

    if (btoWebhooks.length > 0) {
      console.log(`⚠️  Found ${btoWebhooks.length} existing webhook(s) for Beyond the Obvious collection.`);
      console.log('   You may want to delete these manually from the Webflow dashboard to avoid duplicates.\n');
    }
  }

  console.log('---\n');
  console.log('📦 Creating new webhooks...\n');

  // Step 3: Create all webhooks
  const results = [];
  for (const webhook of webhooksToCreate) {
    const result = await createWebhook(webhook.triggerType, webhook.description);
    results.push(result);

    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Step 4: Summary
  console.log('---\n');
  console.log('📊 Setup Summary\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successfully created: ${successful.length} webhook(s)`);
  if (successful.length > 0) {
    successful.forEach(r => {
      console.log(`   - ${r.description} (${r.triggerType})`);
    });
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed to create: ${failed.length} webhook(s)`);
    failed.forEach(r => {
      console.log(`   - ${r.description} (${r.triggerType})`);
    });
  }

  console.log('\n---\n');

  if (successful.length === webhooksToCreate.length) {
    console.log('✨ All webhooks created successfully!\n');
    console.log('Next steps:');
    console.log('1. Test the webhooks using: node scripts/test-webhook.js');
    console.log('2. Make a change in the Beyond the Obvious collection in Webflow');
    console.log('3. Check Vercel logs to verify webhook is received');
    console.log('');
  } else {
    console.log('⚠️  Some webhooks failed to create. Please check the errors above.\n');
    console.log('Common issues:');
    console.log('- API token may not have webhook:write scope');
    console.log('- Site ID or Collection ID may be incorrect');
    console.log('- Webhook URL may not be accessible');
    console.log('');
  }
}

// Run the setup
setupWebhooks().catch(error => {
  console.error('\n❌ Setup failed:', error.message);
  process.exit(1);
});
