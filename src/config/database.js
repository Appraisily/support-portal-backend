const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

const createSequelizeInstance = () => {
  if (process.env.NODE_ENV === 'production') {
    const socketPath = process.env.CLOUD_SQL_CONNECTION_NAME;
    const database = process.env.DB_NAME || 'support_portal';
    const username = process.env.DB_USER || 'support_portal_user';
    const password = process.env.DB_PASSWORD;

    const config = {
      dialect: 'postgres', // Ensure dialect is 'postgres'
      host: `/cloudsql/${socketPath}`,
      database: database,
      username: username,
      password: password,
      port: 5432, // Default PostgreSQL port
      pool: {
        max: 5,
        min: 0,
        acquire: 60000,
        idle: 10000,
      },
      logging: (msg) => logger.debug(`Sequelize: ${msg}`),
      retry: {
        max: 5,
      },
    };

    logger.info('Initializing production PostgreSQL connection with config:', {
      database: config.database,
      username: config.username,
      host: config.host,
      port: config.port,
    });

    return new Sequelize(config);
  } else {
    logger.info('Initializing development SQLite connection');
    return new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: (msg) => logger.debug(msg),
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
    PredefinedReply: require('../models/predefinedReply')(sequelize, DataTypes),
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
  const retryDelay = 5000; // 5 seconds

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
      if (retries === 0) {
        logger.error('Database connection failed after all retries:', error);
        process.exit(1);
      }
      logger.warn(`Database connection attempt failed. Retrying... (${retries} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

module.exports = {
  sequelize,
  connectDB,
  models: defineModels(),
};
