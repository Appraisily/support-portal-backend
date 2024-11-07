require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const logger = require('./utils/logger');
const secretManager = require('./utils/secretManager');
const { initializeDatabase } = require('./config/database');
const GmailService = require('./services/GmailService');

async function startServer() {
  const startTime = Date.now();
  
  try {
    logger.info('Starting server initialization', {
      environment: process.env.NODE_ENV,
      nodeVersion: process.versions.node
    });

    // 1. Initialize Secret Manager
    await secretManager.ensureInitialized();
    logger.info('Secrets loaded successfully');

    // 2. Initialize Database
    await initializeDatabase();

    // 3. Express setup
    const app = express();
    app.set('trust proxy', true);
    app.use(cors());
    app.use(express.json());
    logger.info('Express middleware configured');

    // 4. Initialize Gmail Service
    try {
      logger.info('Initializing Gmail service');
      await GmailService.ensureInitialized();
    } catch (error) {
      logger.error('Gmail service initialization failed', {
        error: error.message,
        stack: error.stack
      });
      // Continue even if Gmail fails - it's not critical for the whole app
    }

    // 5. Routes
    app.use('/api', routes);
    logger.info('API routes configured');

    // Error handler
    app.use((err, req, res, next) => {
      logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path
      });
      
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    });

    // Start server
    const port = process.env.PORT || 8080;
    app.listen(port, () => {
      logger.info('Server started successfully', {
        port,
        environment: process.env.NODE_ENV,
        startupTimeMs: Date.now() - startTime
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