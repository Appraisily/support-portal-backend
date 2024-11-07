const logger = require('../utils/logger');
const GmailService = require('../services/GmailService');

exports.handleWebhook = async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.body?.message?.data) {
      logger.warn('Invalid webhook data', { body: req.body });
      return res.status(200).send('OK - Invalid data');
    }

    const result = await GmailService.handleWebhook(req.body);
    
    logger.info('Webhook processed successfully', {
      processed: result.processed,
      tickets: result.tickets,
      processingTime: Date.now() - startTime
    });

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Gmail webhook error', {
      error: error.message,
      stack: error.stack,
      processingTime: Date.now() - startTime
    });
    res.status(200).send('Error processed');
  }
};

exports.healthCheck = async (req, res) => {
  try {
    await GmailService.ensureInitialized();
    
    const profile = await GmailService.gmail.users.getProfile({
      userId: 'me'
    });
    
    res.json({
      status: 'healthy',
      email: profile.data.emailAddress,
      historyId: profile.data.historyId
    });
  } catch (error) {
    logger.error('Gmail health check failed', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      status: 'unhealthy',
      error: 'Gmail service health check failed' 
    });
  }
};