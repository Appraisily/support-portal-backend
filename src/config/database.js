const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

const createSequelizeInstance = () => {
  if (process.env.NODE_ENV === 'production') {
    const socketPath = `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`;
    logger.info(`Attempting to connect to Cloud SQL using socket path: ${socketPath}`);

    const config = {
      dialect: 'postgres',
      database: process.env.DB_NAME || 'support_portal',
      username: process.env.DB_USER || 'support_portal_user',
      password: process.env.DB_PASSWORD,
      dialectOptions: {
        socketPath,
        connectTimeout: 60000, // 60 seconds
        statement_timeout: 60000,
        idle_in_transaction_session_timeout: 60000,
        keepAlive: true
      },
      pool: {
        max: 5,
        min: 0,
        acquire: 60000,
        idle: 10000,
        evict: 60000,
        retry: {
          match: [
            /SequelizeConnectionError/,
            /SequelizeConnectionRefusedError/,
            /SequelizeHostNotFoundError/,
            /SequelizeHostNotReachableError/,
            /SequelizeInvalidConnectionError/,
            /SequelizeConnectionTimedOutError/,
            /TimeoutError/,
            /Operation timeout/,
            /ECONNREFUSED/,
          ],
          max: 5
        }
      },
      logging: (msg) => logger.debug(msg)
    };

    logger.info('Initializing production PostgreSQL connection with config:', {
      database: config.database,
      socketPath,
      username: config.username
    });

    return new Sequelize(config);
  } else {
    logger.info('Initializing development SQLite connection');
    return new Sequelize({
      dialect: 'sqlite',
      storage: './dev.sqlite',
      logging: (msg) => logger.debug(msg)
    });
  }
};

const sequelize = createSequelizeInstance();

// Initialize models
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

  // Define associations
  Object.values(models).forEach(model => {
    if (model.associate) {
      model.associate(models);
    }
  });

  return models;
};

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    logger.info(`Database connected successfully (${process.env.NODE_ENV} mode)`);

    // Sync models in development
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized');
    }
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
};

module.exports = {
  sequelize,
  connectDB,
  models: defineModels()
};
