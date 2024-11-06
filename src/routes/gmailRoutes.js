const express = require('express');
const router = express.Router();
const gmailController = require('../controllers/gmailController');
const logger = require('../utils/logger');

// Verificar que los métodos necesarios estén definidos
const requiredMethods = ['handleWebhook', 'healthCheck'];
const missingMethods = requiredMethods.filter(method => !gmailController[method]);

if (missingMethods.length > 0) {
  logger.error('Missing Gmail controller methods', {
    missingMethods,
    availableMethods: Object.keys(gmailController)
  });
  throw new Error(`Missing Gmail controller methods: ${missingMethods.join(', ')}`);
}

// Rutas de Gmail
router.post('/webhook', gmailController.handleWebhook);
router.get('/health', gmailController.healthCheck);

module.exports = router;