const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');
const models = require('../models');

let sequelize = null;
let config = null;

const initializeDatabase = async () => {
  if (sequelize) {
    return sequelize;
  }

  try {
    // 1. Ensure secrets are loaded
    logger.info('Loading database secrets...');
    const secretsLoaded = await secretManager.ensureInitialized();
    
    if (!secretsLoaded) {
      throw new Error('Failed to load required secrets');
    }

    // 2. Verify required environment variables
    const requiredEnvVars = ['DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_HOST'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    // 3. Configure database connection
    config = {
      dialect: 'postgres',
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      logging: (msg) => logger.debug('Sequelize:', { query: msg }),
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    };

    // 4. Add production-specific configuration
    if (process.env.NODE_ENV === 'production') {
      const connectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
      if (!connectionName) {
        throw new Error('Missing CLOUD_SQL_CONNECTION_NAME in production');
      }

      config.dialectOptions = {
        socketPath: `/cloudsql/${connectionName}`,
        ssl: false
      };
    }

    logger.info('Initializing database connection...', {
      host: config.host,
      database: config.database,
      user: config.username,
      environment: process.env.NODE_ENV
    });

    // 5. Create Sequelize instance
    sequelize = new Sequelize(config);

    // 6. Test connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // 7. Initialize models
    await models.initialize(sequelize);
    logger.info('Models initialized successfully');

    return sequelize;
  } catch (error) {
    logger.error('Database initialization failed:', {
      error: error.message,
      stack: error.stack,
      config: {
        host: config?.host,
        database: config?.database,
        environment: process.env.NODE_ENV
      }
    });
    throw error;
  }
};

module.exports = {
  initializeDatabase,
  getSequelize: () => sequelize
};