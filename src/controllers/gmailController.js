const logger = require('../utils/logger');
const GmailService = require('../services/GmailService');
const ApiError = require('../utils/apiError');

exports.handleWebhook = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Ensure Gmail service is initialized
    await GmailService.ensureInitialized();

    // Validate webhook data
    if (!req.body?.message?.data) {
      logger.warn('Invalid webhook data', { 
        body: JSON.stringify(req.body),
        hasMessage: !!req.body?.message 
      });
      throw new ApiError(400, 'Invalid webhook data');
    }

    // Log raw webhook data
    logger.info('Received Gmail webhook', {
      messageId: req.body.message.message_id,
      publishTime: req.body.message.publish_time,
      subscription: req.body.subscription
    });

    // Send immediate response to avoid timeout
    res.status(200).json({ 
      success: true, 
      message: 'Webhook received' 
    });

    // Process webhook asynchronously
    try {
      const result = await GmailService.processWebhook(req.body);
      
      logger.info('Webhook processing completed', {
        processed: result.processed,
        messages: result.messages?.length || 0,
        tickets: result.tickets?.length || 0,
        processingTime: Date.now() - startTime
      });
    } catch (processingError) {
      logger.error('Error processing webhook data:', {
        error: processingError.message,
        stack: processingError.stack,
        processingTime: Date.now() - startTime
      });
    }

  } catch (error) {
    logger.error('Gmail webhook error', {
      error: error.message,
      stack: error.stack,
      body: JSON.stringify(req.body),
      processingTime: Date.now() - startTime
    });
    
    if (!res.headersSent) {
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Error processing webhook'
      });
    }
  }
};

exports.healthCheck = async (req, res) => {
  try {
    await GmailService.ensureInitialized();
    const status = await GmailService.getWatchStatus();
    
    res.status(200).json({
      success: true,
      status: 'healthy',
      gmail: status
    });
  } catch (error) {
    logger.error('Gmail health check failed', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(503).json({ 
      success: false,
      status: 'unhealthy',
      message: error.message || 'Gmail service health check failed'
    });
  }
};