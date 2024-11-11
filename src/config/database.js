const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');
const models = require('../models');
const path = require('path');

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

    // 2. Configure database connection
    config = {
      dialect: 'postgres',
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

    // 3. Configure connection based on environment
    if (process.env.NODE_ENV === 'production') {
      const connectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
      if (!connectionName) {
        throw new Error('Missing CLOUD_SQL_CONNECTION_NAME in production');
      }

      config.host = `/cloudsql/${connectionName}`;
      config.dialectOptions = {
        socketPath: `/cloudsql/${connectionName}`,
        ssl: false
      };
    } else {
      // Development configuration
      config.host = process.env.DB_HOST;
      config.port = process.env.DB_PORT;
    }

    logger.info('Initializing database connection...', {
      host: config.host,
      database: config.database,
      user: config.username,
      environment: process.env.NODE_ENV
    });

    // 4. Create Sequelize instance
    sequelize = new Sequelize(config);

    // 5. Test connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // 6. Initialize models
    await models.initialize(sequelize);
    logger.info('Models initialized successfully');

    // 7. Run migrations if in production
    if (process.env.NODE_ENV === 'production') {
      logger.info('Running database migrations...');
      const { Umzug, SequelizeStorage } = require('umzug');
      
      // Configure Umzug with error handling
      const umzug = new Umzug({
        migrations: { 
          glob: path.join(__dirname, '../migrations/*.js'),
          resolve: ({ name, path: migrationPath }) => {
            const migration = require(migrationPath);
            return {
              name,
              up: async (params) => {
                try {
                  return await migration.up(params.context, params.context.sequelize);
                } catch (error) {
                  // Log migration error but don't fail if it's because things already exist
                  if (error.message.includes('already exists')) {
                    logger.warn(`Migration ${name} skipped - objects already exist`);
                    return Promise.resolve();
                  }
                  throw error;
                }
              },
              down: async (params) => migration.down(params.context, params.context.sequelize)
            };
          }
        },
        context: sequelize.getQueryInterface(),
        storage: new SequelizeStorage({ sequelize }),
        logger: console
      });

      try {
        await umzug.up();
        logger.info('Database migrations completed successfully');
      } catch (error) {
        // Log migration error but continue if it's not critical
        logger.error('Migration error:', {
          error: error.message,
          stack: error.stack
        });
        
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
    }

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