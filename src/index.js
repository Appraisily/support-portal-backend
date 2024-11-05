require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const secretManager = require('./utils/secretManager');
const GmailService = require('./services/GmailService');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ajustar el Rate limiting para ser más permisivo
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000,                // aumentar de 100 a 1000 requests
  message: {
    error: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,    // Incluir headers estándar de rate limit
  legacyHeaders: false,     // Deshabilitar headers legacy
  // Excluir health checks del rate limiting
  skip: (req) => req.path === '/_health'
});

// Aplicar rate limiting solo a las rutas de autenticación
app.use('/api/auth', limiter);  // En lugar de app.use(limiter)

// Health check endpoint for Cloud Run
app.get('/_health', (req, res) => {
  res.status(200).send('OK');
});

// Load secrets and start server
async function startServer() {
  try {
    // 1. Cargar secretos
    if (process.env.NODE_ENV === 'production') {
      logger.info('1. Loading secrets from Secret Manager...');
      await secretManager.loadSecrets();
      logger.info('Secrets loaded successfully');
    }

    // 2. Verificar variables de entorno
    logger.info('2. Verifying environment variables...');
    const requiredVars = [
      'DB_NAME', 
      'DB_USER', 
      'DB_PASSWORD', 
      'CLOUD_SQL_CONNECTION_NAME',
      'JWT_SECRET',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD'
    ];
    const envVars = {};
    requiredVars.forEach(varName => {
      envVars[varName] = !!process.env[varName];
    });
    logger.info('Environment variables status:', envVars);

    if (Object.values(envVars).includes(false)) {
      throw new Error(`Missing required environment variables: ${Object.entries(envVars).filter(([,v]) => !v).map(([k]) => k).join(', ')}`);
    }

    // 3. Inicializar y sincronizar base de datos
    logger.info('3. Initializing database...');
    const { sequelize, models } = require('./config/database');
    
    logger.info('3.1 Synchronizing database models...');
    await sequelize.sync();
    logger.info('Database models synchronized successfully');

    // 4. Cargar rutas
    logger.info('4. Loading routes...');
    const routes = require('./routes');
    app.use('/api', routes);

    // Configurar Gmail watch automáticamente al iniciar en producción
    if (process.env.NODE_ENV === 'production') {
      try {
        logger.info('Initializing Gmail service...');
        await GmailService.setupGmail();
        
        logger.info('Setting up Gmail watch during startup...');
        await GmailService.setupGmailWatch();
        logger.info('Gmail watch configured successfully');
      } catch (error) {
        logger.error('Failed to setup Gmail watch during startup:', error);
        // No detenemos el servidor por este error
      }
    }

    // 5. Iniciar servidor HTTP
    logger.info('5. Starting HTTP server...');
    const PORT = process.env.PORT || 8080;
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // 6. Manejar señales de terminación
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });

    return server;

  } catch (error) {
    logger.error('Server startup failed:', {
      error: error.message,
      stack: error.stack,
      phase: error.phase || 'unknown'
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    process.exit(1);
  }
}

// Iniciar el servidor y manejar errores no capturados
startServer().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

// Manejar errores no capturados globalmente
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});
