const express = require('express');
const router = express.Router();
const gmailController = require('../controllers/gmailController');
const { authenticate } = require('../middleware/auth');

router.get('/test', authenticate, gmailController.testConnection);
router.post('/webhook', gmailController.handleWebhook);
router.post('/tickets/:id/sync', gmailController.syncThread);
router.post('/setup-watch', authenticate, gmailController.setupWatch);

module.exports = router;