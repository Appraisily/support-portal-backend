const express = require('express');
const router = express.Router();
const gmailController = require('../controllers/gmailController');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Rutas autenticadas
router.get('/test', authenticate, gmailController.testConnection);
router.post('/tickets/:id/sync', authenticate, gmailController.syncThread);
router.post('/setup-watch', authenticate, gmailController.setupWatch);

// Webhook público para Google
router.post('/webhook', gmailController.handleWebhook);

module.exports = router;