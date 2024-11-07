const express = require('express');
const router = express.Router();
const ticketRoutes = require('./ticketRoutes');
const gmailRoutes = require('./gmailRoutes');
const authRoutes = require('./authRoutes');
const logger = require('../utils/logger');
const { errorHandler } = require('../middleware/errorHandler');

// Log incoming requests
router.use((req, res, next) => {
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
  });
  next();
});

// Public routes
router.use('/auth', authRoutes);
router.use('/gmail/webhook', gmailRoutes);

// Protected routes
router.use('/tickets', ticketRoutes);
router.use('/gmail', gmailRoutes);

// Error handling
router.use(errorHandler);

module.exports = router;