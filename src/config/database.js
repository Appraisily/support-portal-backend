const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');

let sequelize = null;
let models = null;

const initializeDatabase = async () => {
  if (sequelize) {
    return sequelize;
  }

  try {
    await secretManager.ensureInitialized();
    logger.info('Initializing database connection...');

    // Get database configuration
    const dbConfig = {
      user: await secretManager.getSecret('DB_USER'),
      password: await secretManager.getSecret('DB_PASSWORD'),
      database: await secretManager.getSecret('DB_NAME'),
      instanceName: await secretManager.getSecret('CLOUD_SQL_CONNECTION_NAME')
    };

    // Validate configuration
    Object.entries(dbConfig).forEach(([key, value]) => {
      if (!value) {
        throw new Error(`Missing database config: ${key}`);
      }
    });

    // Configure Sequelize
    const config = {
      dialect: 'postgres',
      database: dbConfig.database,
      username: dbConfig.user,
      password: dbConfig.password,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      logging: (msg) => logger.debug('Sequelize:', { query: msg })
    };

    // In production, use Unix Domain Socket without SSL
    if (process.env.NODE_ENV === 'production') {
      config.host = `/cloudsql/${dbConfig.instanceName}`;
      config.dialectOptions = {
        socketPath: `/cloudsql/${dbConfig.instanceName}`,
        ssl: false // Explicitly disable SSL for Unix socket
      };
    } else {
      // In development, use TCP with SSL disabled (since it's disabled in the DB)
      config.host = await secretManager.getSecret('DB_HOST');
      config.port = await secretManager.getSecret('DB_PORT');
      config.dialectOptions = {
        ssl: false // Disable SSL since it's not enabled in the database
      };
    }

    sequelize = new Sequelize(config);

    // Test connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully', {
      database: dbConfig.database,
      user: dbConfig.user,
      instanceName: dbConfig.instanceName
    });

    return sequelize;
  } catch (error) {
    logger.error('Database initialization failed', {
      error: error.message,
      stack: error.stack,
      errorCode: error.original?.code,
      errorDetail: error.original?.detail
    });
    throw error;
  }
};

const getModels = async () => {
  if (models) {
    return models;
  }

  try {
    const sequelize = await initializeDatabase();
    
    // Import models
    const Setting = require('../models/setting')(sequelize);
    const User = require('../models/user')(sequelize);
    const Ticket = require('../models/ticket')(sequelize);
    const Message = require('../models/message')(sequelize);
    const Customer = require('../models/customer')(sequelize);
    const Attachment = require('../models/attachment')(sequelize);
    const PredefinedReply = require('../models/predefinedReply')(sequelize);
    const Purchase = require('../models/purchase')(sequelize);
    const PurchaseItem = require('../models/purchaseItem')(sequelize);

    models = {
      Setting,
      User,
      Ticket,
      Message,
      Customer,
      Attachment,
      PredefinedReply,
      Purchase,
      PurchaseItem
    };

    // Initialize associations
    Object.values(models).forEach(model => {
      if (model.associate) {
        model.associate(models);
      }
    });

    logger.info('Models initialized successfully');
    return models;
  } catch (error) {
    logger.error('Failed to initialize models', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

module.exports = {
  initializeDatabase,
  getModels
};