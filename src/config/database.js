const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

const createSequelizeInstance = () => {
  if (process.env.NODE_ENV === 'production') {
    const connectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
    const dbName = process.env.DB_NAME;
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;

    logger.info('Production environment detected, initializing Cloud SQL connection with params:', {
      connectionName,
      dbName,
      dbUser
    });

    const config = {
      dialect: 'postgres',
      dialectModule: require('pg'),
      database: dbName,
      username: dbUser,
      password: dbPassword,
      host: '/cloudsql/' + connectionName,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
        handleDisconnects: true
      },
      dialectOptions: {
        socketPath: '/cloudsql/' + connectionName
      },
      logging: (msg) => logger.debug(`[Sequelize] ${msg}`)
    };

    logger.info('Sequelize configuration:', {
      database: config.database,
      dialect: config.dialect,
      host: config.host,
      poolConfig: config.pool,
      ssl: false,
      username: config.username
    });

    try {
      logger.info('Creating Sequelize instance...');
      const sequelize = new Sequelize(config);
      logger.info('Sequelize instance created successfully');
      return sequelize;
    } catch (error) {
      logger.error('Error creating Sequelize instance:', {
        error: error.message,
        stack: error.stack,
        code: error.original?.code,
        errno: error.original?.errno
      });
      throw error;
    }
  } else {
    logger.info('Running in development mode - using SQLite');
    return new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: (msg) => logger.debug(`[Sequelize] ${msg}`),
      define: {
        timestamps: true
      }
    });
  }
};

const defineModels = () => {
  logger.info('Initializing database models...');
  const models = {
    User: require('../models/user')(sequelize, DataTypes),
    Ticket: require('../models/ticket')(sequelize, DataTypes),
    Message: require('../models/message')(sequelize, DataTypes),
    Customer: require('../models/customer')(sequelize, DataTypes),
    Purchase: require('../models/purchase')(sequelize, DataTypes),
    PurchaseItem: require('../models/purchaseItem')(sequelize, DataTypes),
    Attachment: require('../models/attachment')(sequelize, DataTypes),
    PredefinedReply: require('../models/predefinedReply')(sequelize, DataTypes)
  };

  logger.info('Setting up model associations...');
  Object.values(models).forEach(model => {
    if (model.associate) {
      model.associate(models);
    }
  });

  logger.info('Models initialized successfully');
  return models;
};

const connectDB = async () => {
  let retries = 5;
  const retryDelay = 5000;

  while (retries > 0) {
    try {
      logger.info('Attempting database connection...');
      await sequelize.authenticate();
      logger.info(`Database connected successfully (${process.env.NODE_ENV} mode)`);

      if (process.env.NODE_ENV === 'development') {
        logger.info('Synchronizing database models in development mode...');
        await sequelize.sync({ alter: true });
        logger.info('Database models synchronized successfully');
      }
      return;
    } catch (error) {
      retries--;
      logger.error('Database connection error:', {
        error: error.message,
        code: error.original?.code,
        errno: error.original?.errno,
        syscall: error.original?.syscall,
        address: error.original?.address,
        port: error.original?.port,
        stack: error.stack
      });

      if (retries === 0) {
        logger.error('Database connection failed after all retries. Exiting process.');
        process.exit(1);
      }
      
      logger.warn(`Database connection attempt failed. Retrying in ${retryDelay}ms... (${retries} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

let sequelize;
try {
  logger.info('Initializing database connection...');
  sequelize = createSequelizeInstance();
} catch (error) {
  logger.error('Failed to initialize database:', error);
  process.exit(1);
}

module.exports = {
  sequelize,
  connectDB,
  models: defineModels()
};
