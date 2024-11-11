const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const path = require('path');
const secretManager = require('../utils/secretManager');
const models = require('../models');

let sequelize = null;
let config = null;

const waitForSecrets = async (retries = 30, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    if (process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME) {
      return true;
    }
    logger.info('Waiting for database secrets...');
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error('Timeout waiting for database secrets');
};

const initializeDatabase = async () => {
  if (sequelize) {
    return sequelize;
  }

  try {
    // 1. First ensure secrets are loaded and wait if necessary
    logger.info('Loading database secrets...');
    await secretManager.ensureInitialized();
    await waitForSecrets();
    
    // 2. Configure database connection
    config = {
      dialect: 'postgres',
      logging: (msg) => logger.debug('Sequelize:', { query: msg }),
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      retry: {
        max: 5,
        match: [
          /SequelizeConnectionError/,
          /SequelizeConnectionRefusedError/,
          /SequelizeHostNotFoundError/,
          /SequelizeHostNotReachableError/,
          /SequelizeInvalidConnectionError/,
          /SequelizeConnectionTimedOutError/
        ],
        backoffBase: 1000,
        backoffExponent: 1.5
      }
    };

    // 3. Configure connection based on environment
    if (process.env.NODE_ENV === 'production') {
      const connectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
      config.host = connectionName ?
        `/cloudsql/${connectionName}` :
        process.env.DB_HOST;
      config.dialectOptions = {
        socketPath: connectionName ?
          `/cloudsql/${connectionName}` :
          undefined,
        ssl: false
      };
    } else {
      config.host = process.env.DB_HOST;
      config.port = process.env.DB_PORT;
      config.dialectOptions = {
        ssl: false
      };
    }

    // 4. Set credentials from environment (loaded from secrets)
    config.database = process.env.DB_NAME;
    config.username = process.env.DB_USER;
    config.password = process.env.DB_PASSWORD;

    logger.info('Initializing database connection...', {
      host: config.host,
      database: config.database,
      user: config.username,
      environment: process.env.NODE_ENV
    });

    // 5. Create Sequelize instance and test connection
    sequelize = new Sequelize(config);
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // 6. Initialize models
    await models.initialize(sequelize);
    logger.info('Models initialized successfully');

    return sequelize;
  } catch (error) {
    logger.error('Database initialization failed:', {
      error: error.message,
      stack: error.stack,
      host: config?.host,
      database: config?.database,
      environment: process.env.NODE_ENV
    });
    throw error;
  }
};

module.exports = {
  initializeDatabase,
  getSequelize: () => sequelize
};