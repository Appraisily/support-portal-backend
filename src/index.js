require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
const secretManager = require('./utils/secretManager');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

// Error handler
app.use(errorHandler);

// Root endpoint for basic verification
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Support Portal API is running' });
});

// Health check endpoint - CRITICAL for Cloud Run
app.get('/_health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

const startServer = async () => {
  try {
    // 1. First initialize secrets
    await secretManager.ensureInitialized();
    logger.info('Secrets loaded successfully');

    // 2. Then initialize database with loaded secrets
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // 3. Finally start the server
    const port = process.env.PORT || 8080;
    const server = app.listen(port, '0.0.0.0', () => {
      logger.info(`Server running on port ${port}`, {
        environment: process.env.NODE_ENV,
        nodeVersion: process.versions.node,
        port: port
      });
    });

    // Handle shutdown gracefully
    const shutdown = async () => {
      logger.info('Shutting down server...');
      server.close(() => {
        logger.info('Server shut down complete');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;