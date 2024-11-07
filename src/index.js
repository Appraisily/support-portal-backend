require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const logger = require('./utils/logger');
const secretManager = require('./utils/secretManager');
const { initializeDatabase } = require('./config/database');
const GmailService = require('./services/GmailService');
const { errorHandler } = require('./middleware/errorHandler');

async function startServer() {
  const startTime = Date.now();
  
  try {
    logger.info('Starting server initialization', {
      environment: process.env.NODE_ENV,
      nodeVersion: process.versions.node
    });

    // 1. Initialize Secret Manager first
    await secretManager.ensureInitialized();
    logger.info('Secrets loaded successfully');

    // 2. Initialize Database
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // 3. Express setup
    const app = express();
    app.set('trust proxy', true);
    app.use(cors());
    app.use(express.json());
    
    // 4. Routes
    app.use('/api', routes);

    // Error handler
    app.use(errorHandler);

    // 5. Start server first
    const port = process.env.PORT || 8080;
    const server = app.listen(port, () => {
      logger.info('Server started successfully', {
        port,
        environment: process.env.NODE_ENV,
        startupTimeMs: Date.now() - startTime
      });
    });

    // 6. Initialize Gmail Service after server is running
    // This way if Gmail setup fails, the server is still running
    if (process.env.NODE_ENV === 'production') {
      try {
        await GmailService.ensureInitialized();
        logger.info('Gmail service initialized successfully');
      } catch (error) {
        logger.error('Gmail service initialization failed, but server continues running', {
          error: error.message
        });
      }
    }

  } catch (error) {
    logger.error('Server initialization failed', {
      error: error.message,
      stack: error.stack,
      startupTimeMs: Date.now() - startTime
    });
    process.exit(1);
  }
}

// Error handlers
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

startServer();