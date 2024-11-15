const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const logger = require('./utils/logger');
const { initializeDatabase } = require('./config/database');
const { errorHandler } = require('./middleware/errorHandler');
const secretManager = require('./utils/secretManager');

const app = express();

// CORS configuration
const corsOptions = {
  origin: '*', // Allow all origins for now
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 204
};

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.info('Incoming request:', {
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      origin: req.headers.origin,
      authorization: req.headers.authorization ? 'present' : 'missing'
    },
    ip: req.ip
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed:', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
});

// Routes
app.use('/api', routes);

// Error handler
app.use(errorHandler);

// Root endpoint for basic verification
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Support Portal API is running' });
});

// Health check endpoint
app.get('/_health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

const startServer = async () => {
  try {
    await secretManager.ensureInitialized();
    logger.info('Secrets loaded successfully');

    await initializeDatabase();
    logger.info('Database initialized successfully');

    const port = process.env.PORT || 8080;
    const server = app.listen(port, '0.0.0.0', () => {
      logger.info(`Server running on port ${port}`, {
        environment: process.env.NODE_ENV,
        nodeVersion: process.versions.node,
        port: port
      });
    });

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