const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

const createSequelizeInstance = () => {
  const config = {
    dialect: 'postgres',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'support_portal',
    username: process.env.DB_USER || 'support_portal_user',
    password: process.env.DB_PASSWORD,
    dialectOptions: {
      // For Cloud SQL
      socketPath: process.env.NODE_ENV === 'production'
        ? `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
        : undefined,
      ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
      } : false
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: (msg) => logger.debug(msg)
  };

  // Only set host if not using socket
  if (!config.dialectOptions.socketPath) {
    config.host = process.env.DB_HOST || 'localhost';
  }

  return new Sequelize(config);
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
    logger.info('Connected to PostgreSQL database');

    // Sync models in development
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync();
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
