const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

const createSequelizeInstance = () => {
  const {
    NODE_ENV,
    DB_NAME,
    DB_USER,
    DB_PASSWORD
  } = process.env;

  logger.info('Environment check:', {
    nodeEnv: NODE_ENV,
    dbName: DB_NAME,
    dbUser: DB_USER,
    hasPassword: !!DB_PASSWORD
  });

  if (NODE_ENV === 'production') {
    if (!DB_NAME || !DB_USER || !DB_PASSWORD) {
      const config = {
        dbName: !!DB_NAME,
        dbUser: !!DB_USER,
        dbPassword: !!DB_PASSWORD
      };
      logger.error('Missing database configuration:', config);
      throw new Error('Missing required database configuration environment variables');
    }

    const config = {
      dialect: 'postgres',
      host: '34.57.184.164',
      port: 5432,
      database: DB_NAME,
      username: DB_USER,
      password: DB_PASSWORD,
      dialectOptions: {
        ssl: false,
        keepAlive: true,
        connectTimeout: 60000
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 60000,
        idle: 10000,
        handleDisconnects: true
      },
      logging: msg => logger.debug(msg)
    };

    logger.info('Sequelize configuration:', {
      dialect: config.dialect,
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      poolConfig: config.pool,
      ssl: config.dialectOptions.ssl
    });

    logger.info('Creating Sequelize instance...');
    const instance = new Sequelize(config);
    logger.info('Sequelize instance created successfully');
    return instance;

  } else {
    logger.info('Development mode - using SQLite');
    return new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: msg => logger.debug(msg)
    });
  }
};

const defineModels = (sequelize) => {
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

const connectDB = async (sequelize) => {
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
        message: error.message,
        code: error.original?.code,
        errno: error.original?.errno,
        syscall: error.original?.syscall,
        address: error.original?.address,
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
  const models = defineModels(sequelize);

  module.exports = {
    sequelize,
    connectDB: () => connectDB(sequelize),
    models
  };
} catch (error) {
  logger.error('Failed to initialize database:', error);
  process.exit(1);
}