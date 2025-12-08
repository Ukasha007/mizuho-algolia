import { createApiResponse } from '../../lib/core/helpers.js';
import logger from '../../lib/core/logger.js';
import { validateWebhookSignature, validateWebhookPayload } from '../../lib/webhooks/validator.js';
import webhookProcessor from '../../lib/webhooks/processor.js';

export default async function handler(req, res) {
  const requestLogger = logger.setContext('WebflowWebhook');

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json(createApiResponse(
      false,
      {},
      'Method not allowed',
      405
    ).body);
  }

  try {
    // Extract headers
    const timestamp = req.headers['x-webflow-timestamp'];
    const signature = req.headers['x-webflow-signature'];

    // Get raw body as string for signature validation
    const rawBody = JSON.stringify(req.body);

    // Determine which secret to use based on trigger type
    // First, try to get trigger type from payload
    const triggerType = req.body?.triggerType;

    // Map trigger types to environment variable names
    const secretMap = {
      'collection_item_created': process.env.WEBFLOW_WEBHOOK_SECRET_CREATE,
      'collection_item_changed': process.env.WEBFLOW_WEBHOOK_SECRET_CHANGE,
      'collection_item_published': process.env.WEBFLOW_WEBHOOK_SECRET_PUBLISH,
      'collection_item_deleted': process.env.WEBFLOW_WEBHOOK_SECRET_DELETE,
      'collection_item_unpublished': process.env.WEBFLOW_WEBHOOK_SECRET_UNPUBLISH
    };

    // Get the appropriate secret, fall back to legacy single secret
    const webhookSecret = secretMap[triggerType] || process.env.WEBFLOW_WEBHOOK_SECRET;

    if (!webhookSecret) {
      requestLogger.error('Webhook secret not configured', {
        triggerType,
        availableSecrets: Object.keys(secretMap).filter(key => secretMap[key])
      });
      return res.status(500).json(createApiResponse(
        false,
        {},
        'Webhook secret not configured for this trigger type',
        500
      ).body);
    }

    // Validate webhook signature
    if (!validateWebhookSignature(timestamp, rawBody, signature, webhookSecret)) {
      requestLogger.warn('Webhook signature validation failed', {
        timestamp,
        triggerType,
        hasSignature: !!signature
      });
      return res.status(401).json(createApiResponse(
        false,
        {},
        'Invalid webhook signature',
        401
      ).body);
    }

    requestLogger.info('Webhook signature validated successfully', {
      triggerType
    });

    // Validate payload structure
    const validation = validateWebhookPayload(req.body);

    if (!validation.valid) {
      requestLogger.warn('Invalid webhook payload', {
        error: validation.error
      });
      return res.status(400).json(createApiResponse(
        false,
        {},
        validation.error,
        400
      ).body);
    }

    requestLogger.info('Received valid webhook event', {
      triggerType: validation.triggerType,
      itemId: validation.itemId,
      collectionId: validation.collectionId,
      isDraft: validation.isDraft,
      isArchived: validation.isArchived
    });

    // Process the webhook event
    const result = await webhookProcessor.processWebhookEvent(
      validation.triggerType,
      validation
    );

    requestLogger.success('Webhook processed successfully', {
      triggerType: validation.triggerType,
      itemId: validation.itemId,
      processed: result.processed,
      action: result.action
    });

    // Return success response
    const response = createApiResponse(true, {
      triggerType: validation.triggerType,
      itemId: validation.itemId,
      collectionId: validation.collectionId,
      processed: result.processed,
      action: result.action,
      reason: result.reason,
      timestamp: new Date().toISOString()
    });

    return res.status(200).json(response.body);

  } catch (error) {
    requestLogger.error('Webhook processing failed', {
      error: error.message,
      stack: error.stack
    });

    // Return error response
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'An error occurred processing the webhook'
      : error.message;

    const response = createApiResponse(
      false,
      {},
      errorMessage,
      500
    );

    return res.status(500).json(response.body);
  }
}
