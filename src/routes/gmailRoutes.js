const express = require('express');
const router = express.Router();
const gmailController = require('../controllers/gmailController');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');

// Middleware to verify Gmail configuration
const checkGmailConfig = async (req, res, next) => {
  try {
    const requiredSecrets = [
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN'
    ];
    
    for (const secretName of requiredSecrets) {
      const secret = await secretManager.getSecret(secretName);
      if (!secret) {
        logger.error('Missing Gmail configuration', { missingSecret: secretName });
        return res.status(503).json({
          error: 'Gmail service not configured',
          details: `Missing required secret: ${secretName}`
        });
      }
    }

    // Email is now an environment variable
    if (!process.env.GMAIL_USER_EMAIL) {
      logger.error('Missing Gmail user email configuration');
      return res.status(503).json({
        error: 'Gmail service not configured',
        details: 'Missing GMAIL_USER_EMAIL environment variable'
      });
    }
    
    next();
  } catch (error) {
    logger.error('Gmail config check failed', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

// Gmail routes
router.post('/webhook', checkGmailConfig, gmailController.handleWebhook);
router.get('/health', checkGmailConfig, gmailController.healthCheck);

module.exports = router;