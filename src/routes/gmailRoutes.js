const express = require('express');
const router = express.Router();
const gmailController = require('../controllers/gmailController');
const logger = require('../utils/logger');

// Middleware para verificar que Gmail está configurado
const checkGmailConfig = async (req, res, next) => {
  try {
    const requiredVars = [
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN'
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      logger.error('Missing Gmail configuration', { missingVars });
      return res.status(503).json({
        error: 'Gmail service not configured',
        details: `Missing: ${missingVars.join(', ')}`
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

// Rutas de Gmail con middleware de verificación
router.post('/webhook', checkGmailConfig, gmailController.handleWebhook);
router.get('/health', checkGmailConfig, gmailController.healthCheck);

module.exports = router;