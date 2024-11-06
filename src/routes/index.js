const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const ticketRoutes = require('./ticketRoutes');
const gmailRoutes = require('./gmailRoutes');
const logger = require('../utils/logger');

// Verificar que todas las rutas estén disponibles
const routes = {
  auth: authRoutes,
  tickets: ticketRoutes,
  gmail: gmailRoutes
};

const missingRoutes = Object.entries(routes)
  .filter(([_, route]) => !route)
  .map(([name]) => name);

if (missingRoutes.length > 0) {
  logger.error('Missing route modules', {
    missingRoutes,
    availableRoutes: Object.keys(routes).filter(key => routes[key])
  });
  throw new Error(`Missing route modules: ${missingRoutes.join(', ')}`);
}

// Log cuando las rutas se inicializan
logger.info('Initializing routes', {
  availableRoutes: Object.keys(routes),
  endpoints: {
    auth: '/api/auth',
    tickets: '/api/tickets',
    gmail: '/api/gmail'
  }
});

// Rutas públicas (no requieren autenticación)
router.use('/gmail/webhook', gmailRoutes); // El webhook debe ser público

// Rutas que requieren autenticación
router.use('/auth', authRoutes);
router.use('/tickets', ticketRoutes);
router.use('/gmail', gmailRoutes); // Otras rutas de Gmail (como health check)

// Log cuando las rutas están configuradas
logger.info('Routes initialized successfully', {
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV
});

module.exports = router;
