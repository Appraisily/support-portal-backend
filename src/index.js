require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const secretManager = require('./utils/secretManager');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

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
    const requiredVars = ['DB_NAME', 'DB_USER', 'DB_PASSWORD', 'CLOUD_SQL_CONNECTION_NAME'];
    const envVars = {};
    requiredVars.forEach(varName => {
      envVars[varName] = !!process.env[varName];
    });
    logger.info('Environment variables status:', envVars);

    if (Object.values(envVars).includes(false)) {
      throw new Error(`Missing required environment variables: ${Object.entries(envVars).filter(([,v]) => !v).map(([k]) => k).join(', ')}`);
    }

    // 3. Inicializar base de datos
    logger.info('3. Initializing database...');
    const { connectDB } = require('./config/database');
    const dbConnected = await connectDB();
    
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }

    // 4. Iniciar servidor HTTP
    logger.info('4. Starting HTTP server...');
    const PORT = process.env.PORT || 8080;
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // 5. Manejar señales de terminación
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
    
    // Esperar un momento antes de salir para asegurar que los logs se envíen
    await new Promise(resolve => setTimeout(resolve, 1000));
    process.exit(1);
  }
}

// Iniciar el servidor y manejar errores no capturados
startServer().catch(error => {
  logger.error('Unhandled error during server startup:', error);
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
