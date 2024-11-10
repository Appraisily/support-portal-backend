const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const path = require('path');

let sequelize = null;

const initializeDatabase = async () => {
  if (sequelize) {
    return sequelize;
  }

  const config = {
    dialect: 'postgres',
    logging: (msg) => logger.debug('Sequelize:', { query: msg }),
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };

  // Configure database connection based on environment
  if (process.env.NODE_ENV === 'production') {
    // Cloud SQL configuration
    config.host = process.env.CLOUD_SQL_CONNECTION_NAME ?
      `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}` :
      process.env.DB_HOST;
    config.dialectOptions = {
      socketPath: process.env.CLOUD_SQL_CONNECTION_NAME ?
        `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}` :
        undefined,
      ssl: false
    };
  } else {
    // Local development configuration
    config.host = process.env.DB_HOST;
    config.port = process.env.DB_PORT;
    config.dialectOptions = {
      ssl: false
    };
  }

  // Common configuration
  config.database = process.env.DB_NAME;
  config.username = process.env.DB_USER;
  config.password = process.env.DB_PASSWORD;

  try {
    logger.info('Initializing database connection...', {
      host: config.host,
      database: config.database,
      user: config.username,
      environment: process.env.NODE_ENV
    });

    sequelize = new Sequelize(config);
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Run migrations
    logger.info('Running database migrations...');
    const { Umzug, SequelizeStorage } = require('umzug');
    const umzug = new Umzug({
      migrations: { 
        glob: path.join(__dirname, '../migrations/*.js'),
        resolve: ({ name, path, context }) => {
          const migration = require(path);
          return {
            name,
            up: async () => migration.up(context, Sequelize),
            down: async () => migration.down(context, Sequelize)
          };
        }
      },
      context: sequelize.getQueryInterface(),
      storage: new SequelizeStorage({ sequelize }),
      logger: console
    });

    await umzug.up();
    logger.info('Database migrations completed successfully');

    // Initialize models
    require('../models');

    return sequelize;
  } catch (error) {
    logger.error('Database initialization failed:', {
      error: error.message,
      stack: error.stack,
      host: config.host,
      database: config.database,
      environment: process.env.NODE_ENV
    });
    throw error;
  }
};

module.exports = {
  initializeDatabase,
  getSequelize: () => sequelize
};