const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

const createSequelizeInstance = () => {
  if (process.env.NODE_ENV === 'production') {
    const config = {
      dialect: 'postgres',
      host: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
      database: process.env.DB_NAME || 'support_portal',
      username: process.env.DB_USER || 'support_portal_user',
      password: process.env.DB_PASSWORD,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      logging: (msg) => logger.debug(msg),
    };

    logger.info('Initializing production PostgreSQL connection');
    return new Sequelize(config);
  } else {
    logger.info('Initializing development SQLite connection');
    return new Sequelize({
      dialect: 'sqlite',
      storage: './dev.sqlite',
      logging: (msg) => logger.debug(msg),
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
    PredefinedReply: require('../models/predefinedReply')(sequelize, DataTypes),
  };

  // Define associations
  Object.values(models).forEach((model) => {
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
  models: defineModels(),
};
