const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

const createSequelizeInstance = () => {
  if (process.env.NODE_ENV === 'production') {
    const connectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
    const dbName = process.env.DB_NAME || 'support_portal';
    const dbUser = process.env.DB_USER || 'support_portal_user';
    const dbPassword = process.env.DB_PASSWORD;

    logger.info(`Initializing Cloud SQL connection for ${connectionName}`);

    const config = {
      dialect: 'postgres',
      dialectModule: require('pg'),
      database: dbName,
      username: dbUser,
      password: dbPassword,
      dialectOptions: {
        // Unix Domain Socket
        host: `/cloudsql/${connectionName}`,
        // Required for Cloud SQL
        ssl: false,
        // Additional connection parameters
        keepAlive: true,
        connectTimeout: 30000,
        // Retry settings
        retry: {
          max: 5,
          backoffBase: 1000,
          backoffExponent: 1.5
        }
      },
      define: {
        timestamps: true
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
        handleDisconnects: true
      },
      logging: (msg) => logger.debug(msg)
    };

    return new Sequelize(config);
  } else {
    logger.info('Running in development mode - using SQLite');
    return new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: (msg) => logger.debug(msg),
      define: {
        timestamps: true
      }
    });
  }
};

const sequelize = createSequelizeInstance();

const defineModels = () => {
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

  Object.values(models).forEach(model => {
    if (model.associate) {
      model.associate(models);
    }
  });

  return models;
};

const connectDB = async () => {
  let retries = 5;
  const retryDelay = 5000;

  while (retries > 0) {
    try {
      await sequelize.authenticate();
      logger.info(`Database connected successfully (${process.env.NODE_ENV} mode)`);

      if (process.env.NODE_ENV === 'development') {
        await sequelize.sync({ alter: true });
        logger.info('Database models synchronized');
      }
      return;
    } catch (error) {
      retries--;
      logger.error('Database connection error:', {
        error: error.message,
        code: error.original?.code,
        errno: error.original?.errno,
        syscall: error.original?.syscall,
        address: error.original?.address
      });

      if (retries === 0) {
        logger.error('Database connection failed after all retries:', error);
        process.exit(1);
      }
      
      logger.warn(`Database connection attempt failed. Retrying in ${retryDelay}ms... (${retries} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

module.exports = {
  sequelize,
  connectDB,
  models: defineModels()
};
