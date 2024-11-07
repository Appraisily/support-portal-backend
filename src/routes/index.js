const express = require('express');
const router = express.Router();
const ticketRoutes = require('./ticketRoutes');
const gmailRoutes = require('./gmailRoutes');
const authRoutes = require('./authRoutes');
const logger = require('../utils/logger');

// Verificar que todas las rutas estén disponibles
const routes = {
  tickets: ticketRoutes,
  gmail: gmailRoutes,
  auth: authRoutes
};

const missingRoutes = Object.entries(routes)
  .filter(([, route]) => !route)
  .map(([routeName]) => routeName);

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
    tickets: '/api/tickets',
    gmail: '/api/gmail',
    auth: '/api/auth'
  }
});

// Middleware de autenticación global
router.use((req, res, next) => {
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
  });
  next();
});

// Rutas públicas
router.use('/auth', authRoutes);
router.use('/gmail/webhook', gmailRoutes);

// Rutas autenticadas
router.use('/tickets', ticketRoutes);
router.use('/gmail', gmailRoutes);

// Middleware de error global
router.use((err, req, res, next) => {
  logger.error('Route error handler', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

module.exports = router;