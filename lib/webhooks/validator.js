import crypto from 'crypto';
import logger from '../core/logger.js';

const webhookLogger = logger.setContext('WebhookValidator');

export function validateWebhookSignature(timestamp, body, signature, secret) {
  if (!timestamp || !body || !signature || !secret) {
    webhookLogger.warn('Missing required parameters for webhook signature validation');
    return false;
  }

  try {
    // Check timestamp is recent (within 5 minutes)
    const now = Date.now();
    const requestTimestamp = parseInt(timestamp, 10);
    const timeDiff = now - requestTimestamp;

    if (timeDiff >= 300000) { // 5 minutes in milliseconds
      webhookLogger.warn('Webhook timestamp is too old', {
        timeDiff: `${Math.floor(timeDiff / 1000)}s`,
        threshold: '300s'
      });
      return false;
    }

    // Compute signature
    const message = `${timestamp}:${body}`;
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );

    if (!isValid) {
      webhookLogger.warn('Webhook signature validation failed');
    }

    return isValid;
  } catch (error) {
    webhookLogger.error('Error validating webhook signature', {
      error: error.message
    });
    return false;
  }
}

export function validateWebhookPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      error: 'Invalid payload: must be an object'
    };
  }

  const { triggerType, payload: webhookPayload } = payload;

  if (!triggerType) {
    return {
      valid: false,
      error: 'Missing triggerType in payload'
    };
  }

  if (!webhookPayload || typeof webhookPayload !== 'object') {
    return {
      valid: false,
      error: 'Missing or invalid payload object'
    };
  }

  // Validate required fields in payload
  const requiredFields = ['id', 'siteId', 'collectionId'];
  for (const field of requiredFields) {
    if (!webhookPayload[field]) {
      return {
        valid: false,
        error: `Missing required field: ${field}`
      };
    }
  }

  // Validate trigger type
  const validTriggerTypes = [
    'collection_item_created',
    'collection_item_changed',
    'collection_item_deleted',
    'collection_item_unpublished',
    'collection_item_published'
  ];

  if (!validTriggerTypes.includes(triggerType)) {
    return {
      valid: false,
      error: `Invalid trigger type: ${triggerType}`
    };
  }

  return {
    valid: true,
    triggerType,
    itemId: webhookPayload.id,
    siteId: webhookPayload.siteId,
    collectionId: webhookPayload.collectionId,
    isDraft: webhookPayload.isDraft,
    isArchived: webhookPayload.isArchived,
    fieldData: webhookPayload.fieldData
  };
}
