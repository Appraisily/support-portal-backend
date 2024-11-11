const express = require('express');
const router = express.Router();
const gmailController = require('../controllers/gmailController');

router.post('/webhook', gmailController.handleWebhook);
router.post('/tickets/:id/sync', gmailController.syncThread);

module.exports = router;