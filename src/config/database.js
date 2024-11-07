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
    
    // Get database configuration
    const dbConfig = {
      user: await secretManager.getSecret('DB_USER'),
      password: await secretManager.getSecret('DB_PASSWORD'),
      database: await secretManager.getSecret('DB_NAME'),
      instanceName: await secretManager.getSecret('CLOUD_SQL_CONNECTION_NAME')
    };

    logger.info('Initializing database connection', {
      database: dbConfig.database,
      instanceName: dbConfig.instanceName,
      environment: process.env.NODE_ENV
    });

    const config = {
      dialect: 'postgres',
      username: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      logging: (msg) => logger.debug('Sequelize:', { query: msg })
    };

    // Configure connection based on environment
    if (process.env.NODE_ENV === 'production') {
      // Production: Use Unix Domain Socket
      config.host = `/cloudsql/${dbConfig.instanceName}`;
      config.dialectOptions = {
        socketPath: `/cloudsql/${dbConfig.instanceName}`
      };
    } else {
      // Development: Use TCP with SSL
      config.host = 'localhost';
      config.port = 5432;
      config.dialectOptions = {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      };
    }

    sequelize = new Sequelize(config);

    // Test connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

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
  if (!sequelize) {
    await initializeDatabase();
  }
  
  if (models) {
    return models;
  }

  try {
    // Import models
    models = {
      Setting: require('../models/setting')(sequelize),
      User: require('../models/user')(sequelize),
      Ticket: require('../models/ticket')(sequelize),
      Message: require('../models/message')(sequelize),
      Customer: require('../models/customer')(sequelize),
      Attachment: require('../models/attachment')(sequelize),
      PredefinedReply: require('../models/predefinedReply')(sequelize),
      Purchase: require('../models/purchase')(sequelize),
      PurchaseItem: require('../models/purchaseItem')(sequelize)
    };

    // Initialize associations
    Object.values(models).forEach(model => {
      if (model.associate) {
        model.associate(models);
      }
    });

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