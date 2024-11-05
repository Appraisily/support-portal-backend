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
    // 1. Cargar secretos en producción
    if (process.env.NODE_ENV === 'production') {
      logger.info('Loading secrets from Secret Manager...');
      await secretManager.loadSecrets();
      
      // Añadir log para verificar los secretos de BD después de cargarlos
      logger.info('Database credentials after loading secrets:', {
        hasDBUser: !!process.env.DB_USER,
        hasDBPassword: !!process.env.DB_PASSWORD,
        hasDBName: !!process.env.DB_NAME,
        hasDBHost: !!process.env.DB_HOST,
        hasDBPort: !!process.env.DB_PORT,
        hasConnectionName: !!process.env.CLOUD_SQL_CONNECTION_NAME,
        // Añadir los valores (sin mostrar contraseñas)
        dbName: process.env.DB_NAME,
        dbUser: process.env.DB_USER,
        dbHost: process.env.DB_HOST,
        dbPort: process.env.DB_PORT,
        connectionName: process.env.CLOUD_SQL_CONNECTION_NAME
      });
    }

    // 2. Inicializar base de datos
    logger.info('Initializing database...');
    await initializeDatabase();

    // 3. Configurar Express y middleware
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

    // 4. Configurar rutas
    app.use('/api', routes);

    // 5. Inicializar Gmail en producción
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
