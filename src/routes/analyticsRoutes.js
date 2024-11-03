const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');

router.get('/tickets', authenticate, analyticsController.getTicketAnalytics);

module.exports = router;