const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');
const fs = require('fs');

const createSequelizeInstance = () => {
  if (process.env.NODE_ENV === 'production') {
    const connectionName = process.env.CLOUD_SQL_CONNECTION_NAME?.trim();
    const dbName = process.env.DB_NAME?.trim();
    const dbUser = process.env.DB_USER?.trim();
    const dbPassword = process.env.DB_PASSWORD?.trim();
    const socketPath = `/cloudsql/${connectionName}`;

    // Validate required environment variables
    if (!connectionName || !dbName || !dbUser || !dbPassword) {
      throw new Error('Missing required database configuration environment variables');
    }

    logger.info('Database configuration:', {
      connectionName,
      dbName,
      dbUser,
      socketPath,
      nodeEnv: process.env.NODE_ENV
    });

    // Check socket directory
    try {
      if (!fs.existsSync('/cloudsql')) {
        logger.error('Cloud SQL socket directory does not exist');
        fs.mkdirSync('/cloudsql', { recursive: true });
        logger.info('Created /cloudsql directory');
      }

      const socketDirContents = fs.readdirSync('/cloudsql');
      logger.info('Cloud SQL socket directory contents:', socketDirContents);
    } catch (error) {
      logger.error('Error accessing Cloud SQL socket directory:', {
        error: error.message,
        code: error.code
      });
    }

    const config = {
      dialect: 'postgres',
      dialectModule: require('pg'),
      database: dbName,
      username: dbUser,
      password: dbPassword,
      dialectOptions: {
        socketPath,
        keepAlive: true,
        // Increase timeouts
        connectTimeout: 60000,
        // Use SSL in production
        ssl: {
          rejectUnauthorized: false
        }
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 60000,
        idle: 10000,
        handleDisconnects: true
      },
      retry: {
        max: 5,
        timeout: 60000
      },
      logging: (msg) => logger.debug(`[Sequelize] ${msg}`)
    };

    try {
      logger.info('Creating Sequelize instance...');
      const sequelize = new Sequelize(config);
      logger.info('Sequelize instance created successfully');
      return sequelize;
    } catch (error) {
      logger.error('Failed to create Sequelize instance:', {
        error: error.message,
        code: error.original?.code,
        detail: error.original?.detail
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
        detail: error.original?.detail
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
