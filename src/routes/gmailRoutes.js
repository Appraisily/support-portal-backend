const express = require('express');
const router = express.Router();
const gmailController = require('../controllers/gmailController');
const { authenticate } = require('../middleware/auth');

router.get('/test', authenticate, gmailController.testConnection);
router.post('/webhook', gmailController.handleWebhook);
router.post('/tickets/:id/sync', gmailController.syncThread);

module.exports = router;