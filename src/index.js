require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const secretManager = require('./utils/secretManager');
const GmailService = require('./services/GmailService');

// Importar rutas
const gmailRoutes = require('./routes/gmail.routes');

async function startServer() {
  try {
    // 1. Cargar secretos primero
    if (process.env.NODE_ENV === 'production') {
      logger.info('1. Loading secrets from Secret Manager...');
      await secretManager.loadSecrets();
      logger.info('Secrets loaded successfully');

      // Verificar que los secretos de Gmail están cargados
      logger.info('Checking Gmail credentials:', {
        hasClientId: !!process.env.GMAIL_CLIENT_ID,
        hasClientSecret: !!process.env.GMAIL_CLIENT_SECRET,
        hasRefreshToken: !!process.env.GMAIL_REFRESH_TOKEN,
        userEmail: process.env.GMAIL_USER_EMAIL
      });
    }

    // 2. Configurar Express y middleware
    const app = express();
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

    // 3. Inicializar Gmail solo después de cargar los secretos
    if (process.env.NODE_ENV === 'production') {
      try {
        logger.info('Initializing Gmail service...');
        await GmailService.setupGmail();
        
        logger.info('Setting up Gmail watch...');
        await GmailService.setupGmailWatch();
        logger.info('Gmail watch configured successfully');
      } catch (error) {
        logger.error('Failed to setup Gmail:', error);
        // No detenemos el servidor por este error
      }
    }

    // Configurar rutas
    app.use('/api/gmail', gmailRoutes);

    // 4. Iniciar servidor HTTP
    const PORT = process.env.PORT || 8080;
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
    });

    return server;

  } catch (error) {
    logger.error('Server startup failed:', error);
    process.exit(1);
  }
}

// Iniciar el servidor
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
