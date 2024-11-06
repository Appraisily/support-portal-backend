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

async function startServer() {
  try {
    // 1. Cargar TODOS los secretos primero
    if (process.env.NODE_ENV === 'production') {
      logger.info('Loading secrets from Secret Manager...');
      await secretManager.loadSecrets();
      logger.info('All secrets loaded successfully');

      // Ahora verificamos las variables de entorno DESPUÉS de cargar los secretos
      const requiredEnvVars = [
        // DB vars
        'DB_USER',
        'DB_PASSWORD',
        'DB_NAME',
        'DB_HOST',
        'DB_PORT',
        'CLOUD_SQL_CONNECTION_NAME',
        // Gmail vars (ahora deberían estar disponibles)
        'GMAIL_CLIENT_ID',
        'GMAIL_CLIENT_SECRET',
        'GMAIL_REFRESH_TOKEN',
        // JWT
        'JWT_SECRET'
      ];

      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables after loading secrets: ${missingVars.join(', ')}`);
      }
    }

    // 2. Inicializar base de datos
    logger.info('Initializing database...');
    await initializeDatabase();

    // 3. Inicializar Gmail (ahora que tenemos todos los secretos)
    if (process.env.NODE_ENV === 'production') {
      try {
        logger.info('Initializing Gmail service...');
        await GmailService.setupGmail();
        
        logger.info('Setting up Gmail watch...');
        await GmailService.setupGmailWatch();
      } catch (error) {
        logger.error('Failed to setup Gmail:', error);
        // No detenemos el servidor por este error
      }
    }

    // 4. Configurar Express y resto del servidor
    const app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Rate limiting solo para rutas de autenticación
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      message: { error: 'Too many requests' },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/_health'
    });
    
    // Health check para Cloud Run
    app.get('/_health', (req, res) => {
      res.status(200).send('OK');
    });

    // 5. Configurar rutas
    app.use('/api', routes);

    // 6. Iniciar servidor HTTP
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
