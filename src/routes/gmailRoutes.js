const express = require('express');
const router = express.Router();
const gmailController = require('../controllers/gmailController');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

// Asegurarnos de que todos los métodos del controlador existen
const {
  testConnection,
  syncThread,
  setupWatch,
  handleWebhook
} = gmailController;

// Verificar que los métodos existen antes de usarlos
if (!testConnection || !syncThread || !setupWatch || !handleWebhook) {
  throw new Error('Required Gmail controller methods not defined');
}

// Rutas autenticadas
router.get('/test', authenticate, testConnection);
router.post('/tickets/:id/sync', authenticate, syncThread);
router.post('/setup-watch', authenticate, setupWatch);

// Webhook público para Google
router.post('/webhook', handleWebhook);

module.exports = router;