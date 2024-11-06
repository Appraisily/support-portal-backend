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
  try {
    // 1. Cargar secretos primero
    if (process.env.NODE_ENV === 'production') {
      logger.info('Loading secrets...');
      await secretManager.loadSecrets();
    }

    // 2. Inicializar la aplicación (que incluye la base de datos)
    logger.info('Initializing application...');
    await appState.initialize();

    // 3. Configurar Express
    const app = express();
    app.use(cors());
    app.use(express.json());
    
    // 4. Configurar Gmail (después de tener secretos y DB)
    if (process.env.NODE_ENV === 'production') {
      try {
        logger.info('Setting up Gmail service...');
        await GmailService.setupGmail();
        await GmailService.setupGmailWatch();
      } catch (error) {
        logger.error('Failed to setup Gmail:', error);
        // No detenemos el servidor por este error
      }
    }

    // 5. Configurar rutas
    app.use('/api', routes);

    // 6. Iniciar servidor
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Iniciar servidor
startServer().catch(error => {
  logger.error('Unhandled error during server startup:', error);
  process.exit(1);
});
