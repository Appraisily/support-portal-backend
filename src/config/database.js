const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');
const path = require('path');
const fs = require('fs');

let sequelize = null;
let models = null;

const initializeDatabase = async () => {
  if (sequelize) {
    return { sequelize, models };
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
      instanceName: dbConfig.instanceName
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

    if (process.env.NODE_ENV === 'production') {
      // In production, use Unix Domain Socket
      config.host = `/cloudsql/${dbConfig.instanceName}`;
    } else {
      // In development, use TCP
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

    // Initialize models
    models = {};
    const modelsPath = path.join(__dirname, '..', 'models');
    
    // Read model files and initialize them
    const modelFiles = fs.readdirSync(modelsPath)
      .filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of modelFiles) {
      const model = require(path.join(modelsPath, file))(sequelize, DataTypes);
      models[model.name] = model;
    }

    // Set up associations
    Object.values(models).forEach(model => {
      if (model.associate) {
        model.associate(models);
      }
    });

    // Test connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    return { sequelize, models };
  } catch (error) {
    logger.error('Database initialization failed', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    throw error;
  }
};

const getModels = async () => {
  if (!models) {
    const result = await initializeDatabase();
    models = result.models;
  }
  return models;
};

module.exports = {
  initializeDatabase,
  getModels
};