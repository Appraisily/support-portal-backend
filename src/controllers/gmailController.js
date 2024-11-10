const logger = require('../utils/logger');
const GmailService = require('../services/GmailService');
const ApiError = require('../utils/apiError');

exports.handleWebhook = async (req, res) => {
  const startTime = Date.now();
  
  try {
    await GmailService.ensureInitialized();

    if (!req.body?.message?.data) {
      logger.warn('Invalid webhook data', { 
        body: JSON.stringify(req.body),
        hasMessage: !!req.body?.message 
      });
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook data'
      });
    }

    // Log raw webhook data
    logger.info('Received Gmail webhook', {
      messageId: req.body.message.message_id,
      publishTime: req.body.message.publish_time,
      subscription: req.body.subscription
    });

    // Decode and log notification data
    const decodedData = Buffer.from(req.body.message.data, 'base64').toString();
    const notification = JSON.parse(decodedData);
    
    logger.info('Decoded webhook data', {
      emailAddress: notification.emailAddress,
      historyId: notification.historyId
    });

    // Process webhook asynchronously
    res.status(200).json({ success: true, message: 'Webhook received' });

    const result = await GmailService.processWebhook(req.body);
    
    logger.info('Webhook processing completed', {
      processed: result.processed,
      tickets: result.tickets,
      processingTime: Date.now() - startTime
    });

  } catch (error) {
    logger.error('Gmail webhook error', {
      error: error.message,
      stack: error.stack,
      body: JSON.stringify(req.body),
      processingTime: Date.now() - startTime
    });
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error processing webhook'
      });
    }
  }
};

exports.healthCheck = async (req, res) => {
  try {
    await GmailService.ensureInitialized();
    
    const profile = await GmailService.gmail.users.getProfile({
      userId: 'me'
    });
    
    const watchStatus = await GmailService.getWatchStatus();
    
    res.status(200).json({
      success: true,
      status: 'healthy',
      email: profile.data.emailAddress,
      historyId: profile.data.historyId,
      watchStatus
    });
  } catch (error) {
    logger.error('Gmail health check failed', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(503).json({ 
      success: false,
      status: 'unhealthy',
      message: 'Gmail service health check failed'
    });
  }
};