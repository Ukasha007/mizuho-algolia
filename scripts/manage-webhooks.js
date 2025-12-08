#!/usr/bin/env node

/**
 * Manage Webflow Webhooks
 *
 * This script helps you list, inspect, and delete Webflow webhooks.
 *
 * Usage:
 *   node scripts/manage-webhooks.js list                    # List all webhooks
 *   node scripts/manage-webhooks.js delete <webhook-id>     # Delete a specific webhook
 *   node scripts/manage-webhooks.js clean-bto               # Delete all BTO webhooks
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID;
const BTO_COLLECTION_ID = process.env.CMS_BEYOND_THE_OBVIOUS;

const command = process.argv[2];
const webhookId = process.argv[3];

console.log('\n🔧 Webflow Webhook Management');
console.log('==============================\n');

// Validate environment variables
if (!WEBFLOW_API_TOKEN) {
  console.error('❌ Error: WEBFLOW_API_TOKEN not set in environment');
  process.exit(1);
}

if (!WEBFLOW_SITE_ID) {
  console.error('❌ Error: WEBFLOW_SITE_ID not set in environment');
  process.exit(1);
}

/**
 * List all webhooks
 */
async function listWebhooks() {
  try {
    console.log('📋 Fetching webhooks...\n');

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
      console.log('No webhooks found for this site.\n');
      return [];
    }

    console.log(`Found ${webhooks.length} webhook(s):\n`);
    console.log('='.repeat(80));

    webhooks.forEach((webhook, index) => {
      const webhookId = webhook.id || webhook._id;
      console.log(`\n${index + 1}. Webhook ID: ${webhookId}`);
      console.log(`   Trigger Type: ${webhook.triggerType}`);
      console.log(`   URL: ${webhook.url}`);
      console.log(`   Created: ${webhook.createdOn || 'N/A'}`);

      if (webhook.filter) {
        if (webhook.filter.collectionIds && webhook.filter.collectionIds.length > 0) {
          console.log(`   Collection Filter: ${webhook.filter.collectionIds.join(', ')}`);

          // Highlight if it's for BTO collection
          if (BTO_COLLECTION_ID && webhook.filter.collectionIds.includes(BTO_COLLECTION_ID)) {
            console.log(`   🎯 This is for Beyond the Obvious collection`);
          }
        } else {
          console.log(`   Collection Filter: All collections`);
        }
      } else {
        console.log(`   Collection Filter: All collections (no filter)`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('');

    return webhooks;

  } catch (error) {
    console.error('❌ Failed to list webhooks');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    console.log('');
    return [];
  }
}

/**
 * Delete a webhook by ID
 */
async function deleteWebhook(webhookId) {
  try {
    console.log(`🗑️  Deleting webhook: ${webhookId}...\n`);

    await axios.delete(
      `https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/webhooks/${webhookId}`,
      {
        headers: {
          'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
          'accept': 'application/json'
        }
      }
    );

    console.log('✅ Webhook deleted successfully!\n');
    return true;

  } catch (error) {
    console.error('❌ Failed to delete webhook');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    console.log('');
    return false;
  }
}

/**
 * Delete all webhooks for Beyond the Obvious collection
 */
async function cleanBTOWebhooks() {
  if (!BTO_COLLECTION_ID) {
    console.error('❌ Error: CMS_BEYOND_THE_OBVIOUS not set in environment');
    process.exit(1);
  }

  console.log('🧹 Cleaning up Beyond the Obvious webhooks...\n');

  const webhooks = await listWebhooks();

  if (webhooks.length === 0) {
    console.log('No webhooks to clean up.\n');
    return;
  }

  const btoWebhooks = webhooks.filter(wh =>
    wh.filter?.collectionIds?.includes(BTO_COLLECTION_ID)
  );

  if (btoWebhooks.length === 0) {
    console.log('No Beyond the Obvious webhooks found.\n');
    return;
  }

  console.log(`Found ${btoWebhooks.length} Beyond the Obvious webhook(s) to delete.\n`);

  let deletedCount = 0;
  for (const webhook of btoWebhooks) {
    const webhookId = webhook.id || webhook._id;
    console.log(`Deleting: ${webhook.triggerType} (${webhookId})`);

    const success = await deleteWebhook(webhookId);
    if (success) {
      deletedCount++;
    }

    // Add delay between deletes
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n---\n');
  console.log(`✅ Deleted ${deletedCount} out of ${btoWebhooks.length} webhook(s)\n`);
}

/**
 * Show usage instructions
 */
function showUsage() {
  console.log('Usage:\n');
  console.log('  node scripts/manage-webhooks.js list');
  console.log('    → List all webhooks for this site\n');
  console.log('  node scripts/manage-webhooks.js delete <webhook-id>');
  console.log('    → Delete a specific webhook by ID\n');
  console.log('  node scripts/manage-webhooks.js clean-bto');
  console.log('    → Delete all webhooks for Beyond the Obvious collection\n');
  console.log('Examples:\n');
  console.log('  node scripts/manage-webhooks.js list');
  console.log('  node scripts/manage-webhooks.js delete 6789abc123def456');
  console.log('  node scripts/manage-webhooks.js clean-bto\n');
}

// Main command handler
async function main() {
  switch (command) {
    case 'list':
      await listWebhooks();
      break;

    case 'delete':
      if (!webhookId) {
        console.error('❌ Error: Please provide a webhook ID to delete\n');
        showUsage();
        process.exit(1);
      }
      await deleteWebhook(webhookId);
      break;

    case 'clean-bto':
      await cleanBTOWebhooks();
      break;

    case 'help':
    case '--help':
    case '-h':
      showUsage();
      break;

    default:
      console.error('❌ Error: Unknown command\n');
      showUsage();
      process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('\n❌ Command failed:', error.message);
  process.exit(1);
});
