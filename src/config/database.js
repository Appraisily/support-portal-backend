const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');
const fs = require('fs');

const createSequelizeInstance = () => {
  if (process.env.NODE_ENV === 'production') {
    const connectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
    const dbName = process.env.DB_NAME;
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;

    if (!connectionName || !dbName || !dbUser || !dbPassword) {
      logger.error('Missing database configuration:', {
        connectionName: !!connectionName,
        dbName: !!dbName,
        dbUser: !!dbUser,
        dbPassword: !!dbPassword
      });
      throw new Error('Missing required database configuration environment variables');
    }

    const socketPath = `/cloudsql/${connectionName}`;
    
    logger.info('Production database configuration:', {
      connectionName,
      dbName,
      dbUser,
      socketPath
    });

    // Verify socket directory and permissions
    try {
      if (!fs.existsSync('/cloudsql')) {
        logger.info('Creating /cloudsql directory');
        fs.mkdirSync('/cloudsql', { recursive: true, mode: 0o777 });
      }

      const stats = fs.statSync('/cloudsql');
      logger.info('Socket directory stats:', {
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid
      });

      const contents = fs.readdirSync('/cloudsql');
      logger.info('Socket directory contents:', contents);
    } catch (error) {
      logger.error('Socket directory error:', error);
    }

    const config = {
      dialect: 'postgres',
      host: socketPath,
      database: dbName,
      username: dbUser,
      password: dbPassword,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      dialectOptions: {
        socketPath: socketPath,
        ssl: false,
        native: true,
        keepAlive: true
      },
      logging: msg => logger.debug(msg)
    };

    logger.info('Creating Sequelize instance with config:', {
      dialect: config.dialect,
      host: config.host,
      database: config.database,
      username: config.username,
      poolConfig: config.pool,
      socketPath: config.dialectOptions.socketPath
    });

    return new Sequelize(config);
  } else {
    logger.info('Development mode - using SQLite');
    return new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: msg => logger.debug(msg)
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
        await sequelize.sync({ alter: true });
        logger.info('Database models synchronized');
      }
      return;
    } catch (error) {
      retries--;
      logger.error('Database connection error:', {
        message: error.message,
        code: error.original?.code,
        errno: error.original?.errno,
        syscall: error.original?.syscall,
        address: error.original?.address
      });

      if (retries === 0) {
        logger.error('Database connection failed after all retries');
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
