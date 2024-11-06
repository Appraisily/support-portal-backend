require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const routes = require('./routes');
const GmailService = require('./services/GmailService');
const secretManager = require('./utils/secretManager');
const appState = require('./utils/singleton');

async function startServer() {
  const startTime = Date.now();
  try {
    logger.info('Starting server initialization', {
      environment: process.env.NODE_ENV,
      nodeVersion: process.version
    });

    // 1. Cargar secretos primero
    if (process.env.NODE_ENV === 'production') {
      logger.info('Loading secrets from Secret Manager');
      await secretManager.loadSecrets();
      logger.info('Secrets loaded successfully');
    }

    // 2. Inicializar la aplicación
    logger.info('Initializing application state');
    await appState.initialize();
    logger.info('Application state initialized');

    // 3. Configurar Express
    const app = express();
    
    // Configurar middleware de seguridad
    app.use(helmet());
    app.use(cors());
    
    // Configurar rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutos
      max: 100 // límite por IP
    });
    app.use(limiter);
    
    app.use(express.json({ limit: '10mb' }));
    
    logger.info('Express middleware configured');

    // 4. Configurar Gmail
    if (process.env.NODE_ENV === 'production') {
      try {
        logger.info('Initializing Gmail service');
        await GmailService.setupGmail();
        await GmailService.setupGmailWatch();
        logger.info('Gmail service initialized successfully');
      } catch (error) {
        logger.error('Gmail service initialization failed', {
          error: error.message,
          stack: error.stack
        });
        // No detenemos el servidor por este error
      }
    }

    // 5. Configurar rutas
    app.use('/api', routes);
    logger.info('API routes configured');

    // 6. Iniciar servidor
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, '0.0.0.0', () => {
      const startupTime = Date.now() - startTime;
      logger.info('Server started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV,
        startupTimeMs: startupTime
      });
    });

  } catch (error) {
    logger.error('Server initialization failed', {
      error: error.message,
      stack: error.stack,
      startupTimeMs: Date.now() - startTime
    });
    process.exit(1);
  }
}

// Manejar errores no capturados
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Promise Rejection', {
    error: error.message,
    stack: error.stack
  });
  // Dar tiempo para que los logs se escriban
  setTimeout(() => process.exit(1), 1000);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  // Dar tiempo para que los logs se escriban
  setTimeout(() => process.exit(1), 1000);
});

// Iniciar servidor
startServer().catch(error => {
  logger.error('Fatal error during server startup', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
