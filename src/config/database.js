const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

let sequelize = null;

const initializeDatabase = async () => {
  if (sequelize) {
    return sequelize;
  }

  const config = {
    dialect: 'postgres',
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };

  // Cloud Run with Cloud SQL configuration
  if (process.env.NODE_ENV === 'production') {
    Object.assign(config, {
      host: process.env.CLOUD_SQL_CONNECTION_NAME 
        ? `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
        : process.env.DB_HOST,
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      dialectOptions: {
        socketPath: process.env.CLOUD_SQL_CONNECTION_NAME 
          ? `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
          : undefined
      }
    });
  } else {
    // Local development configuration
    Object.assign(config, {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'support_portal',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    });
  }

  try {
    logger.info('Initializing database connection', {
      environment: process.env.NODE_ENV,
      host: config.host,
      database: config.database,
      socketPath: config.dialectOptions?.socketPath
    });

    sequelize = new Sequelize(config);
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    return sequelize;
  } catch (error) {
    logger.error('Unable to connect to the database:', {
      error: error.message,
      stack: error.stack,
      config: {
        ...config,
        password: '[REDACTED]'
      }
    });
    throw error;
  }
};

module.exports = { initializeDatabase };