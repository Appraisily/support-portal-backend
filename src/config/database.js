const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

let sequelize = null;
let models = null;

const initializeDatabase = async () => {
  if (sequelize) {
    return sequelize;
  }

  try {
    sequelize = new Sequelize(process.env.DATABASE_URL, {
      logging: (msg) => logger.debug('Sequelize:', { query: msg }),
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    });

    await sequelize.authenticate();
    logger.info('Database connection established');

    return sequelize;
  } catch (error) {
    logger.error('Database connection failed', {
      error: error.message,
      stack: error.stack
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
    
    // Importar modelos
    const Setting = require('../models/Setting')(sequelize);
    // ... otros modelos

    models = {
      Setting,
      // ... otros modelos
    };

    // Asociaciones de modelos si es necesario
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
