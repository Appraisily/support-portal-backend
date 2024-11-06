const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const ticketRoutes = require('./ticketRoutes');
const gmailRoutes = require('./gmailRoutes');
const logger = require('../utils/logger');

// Log cuando las rutas se inicializan
logger.info('Initializing routes', {
  availableRoutes: ['auth', 'tickets', 'gmail']
});

router.use('/auth', authRoutes);
router.use('/tickets', ticketRoutes);
router.use('/gmail', gmailRoutes);

module.exports = router;
