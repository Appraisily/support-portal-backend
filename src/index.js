require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

// Error handler
app.use(errorHandler);

// Health check
app.get('/_health', (req, res) => {
  res.json({ status: 'healthy' });
});

const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();

    const port = process.env.PORT || 8080;
    app.listen(port, () => {
      logger.info(`Server running on port ${port}`, {
        environment: process.env.NODE_ENV,
        nodeVersion: process.versions.node
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;