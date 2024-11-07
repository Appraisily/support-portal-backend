const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
require('dotenv').config();

const app = express();

// Basic security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/_health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// API routes
app.use('/api', routes);

// Error handling
app.use(errorHandler);

// Initialize server
async function startServer() {
  const startTime = Date.now();
  
  try {
    // Initialize database
    await initializeDatabase();
    
    // Start server
    const port = process.env.PORT || 8080;
    app.listen(port, () => {
      logger.info('Server started successfully', {
        port,
        environment: process.env.NODE_ENV,
        startupTime: `${Date.now() - startTime}ms`
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', {
      error: error.message,
      stack: error.stack,
      startupTime: `${Date.now() - startTime}ms`
    });
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Start the application
if (require.main === module) {
  startServer();
}

module.exports = app;