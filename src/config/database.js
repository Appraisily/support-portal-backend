const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');
const fs = require('fs');

const createSequelizeInstance = () => {
  logger.info('Environment check:', {
    nodeEnv: process.env.NODE_ENV,
    connectionName: process.env.CLOUD_SQL_CONNECTION_NAME,
    socketPath: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
  });

  if (process.env.NODE_ENV === 'production') {
    const connectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
    const dbName = process.env.DB_NAME;
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;

    if (!connectionName || !dbName || !dbUser || !dbPassword) {
      const config = {
        connectionName: !!connectionName,
        dbName: !!dbName,
        dbUser: !!dbUser,
        dbPassword: !!dbPassword
      };
      logger.error('Missing database configuration:', config);
      throw new Error('Missing required database configuration environment variables');
    }

    const socketPath = `/cloudsql/${connectionName}`;

    // Check if socket path exists and has correct permissions
    try {
      const exists = fs.existsSync(socketPath);
      logger.info(`Socket path check: ${socketPath} exists: ${exists}`);
      
      if (exists) {
        const stats = fs.statSync(socketPath);
        logger.info('Socket file stats:', {
          uid: stats.uid,
          gid: stats.gid,
          mode: stats.mode
        });
      }
    } catch (error) {
      logger.error('Socket file check failed:', {
        error: error.message,
        code: error.code,
        path: error.path
      });
    }

    const config = {
      dialect: 'postgres',
      dialectOptions: {
        socketPath,
        ssl: true,
      },
      host: socketPath,
      database: dbName,
      username: dbUser,
      password: dbPassword,
      pool: {
        max: 5,
        min: 0,
        acquire: 60000,
        idle: 10000,
        handleDisconnects: true
      },
      retry: {
        match: [/Deadlock/i, /Connection terminated/i],
        max: 3
      },
      logging: msg => logger.debug(msg)
    };

    logger.info('Sequelize configuration:', {
      dialect: config.dialect,
      socketPath,
      ssl: config.dialectOptions.ssl,
      poolConfig: config.pool,
      retryEnabled: true
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
