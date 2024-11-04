require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const secretManager = require('./utils/secretManager');
const { testDatabaseConnection } = require('./utils/dbTest');
const { seedAdminUser } = require('./utils/seedAdmin');

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
    // Load secrets from Secret Manager in production
    if (process.env.NODE_ENV === 'production') {
      logger.info('Loading secrets from Secret Manager...');
      await secretManager.loadSecrets();
      logger.info('Secrets loaded successfully');

      // Test database connectivity before proceeding
      logger.info('Testing database connectivity...');
      const connectionSuccess = await testDatabaseConnection();
      if (!connectionSuccess) {
        throw new Error('Database connectivity test failed');
      }
    }

    // Initialize database after secrets are loaded
    const { connectDB } = require('./config/database');
    await connectDB();

    // Seed admin user
    logger.info('Attempting to seed admin user...');
    await seedAdminUser();
    logger.info('Admin user seeding completed');

    // Load routes after database is connected
    const routes = require('./routes');
    app.use('/api', routes);

    // Error handling middleware
    const { errorHandler } = require('./middleware/errorHandler');
    app.use(errorHandler);

    // Start server
    const PORT = process.env.PORT || 8080;
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
