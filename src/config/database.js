const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

// Modelos
const defineTicket = require('../models/ticket');
const defineMessage = require('../models/message');
const defineAttachment = require('../models/attachment');
const defineCustomer = require('../models/customer');
const defineUser = require('../models/user');

let sequelize;

// Configuración para Cloud SQL en producción
if (process.env.NODE_ENV === 'production') {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      dialect: 'postgres',
      host: '/cloudsql/' + process.env.CLOUD_SQL_CONNECTION_NAME,
      logging: (msg) => logger.debug(msg),
      dialectOptions: {
        socketPath: '/cloudsql/' + process.env.CLOUD_SQL_CONNECTION_NAME
      }
    }
  );
} else {
  // Configuración para desarrollo local
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      dialect: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      logging: (msg) => logger.debug(msg)
    }
  );
}

// Inicializar modelos
logger.info('Initializing models...');
const models = {};

try {
  // 1. Primero definimos TODOS los modelos
  models.Customer = defineCustomer(sequelize, DataTypes);
  logger.info('Customer model defined');
  
  models.User = defineUser(sequelize, DataTypes);
  logger.info('User model defined');
  
  models.Ticket = defineTicket(sequelize, DataTypes);
  logger.info('Ticket model defined');
  
  models.Message = defineMessage(sequelize, DataTypes);
  logger.info('Message model defined');
  
  models.Attachment = defineAttachment(sequelize, DataTypes);
  logger.info('Attachment model defined');

  // 2. DESPUÉS de que todos los modelos estén definidos, configuramos las asociaciones
  logger.info('Setting up model associations...');
  
  Object.keys(models).forEach(modelName => {
    if (models[modelName].associate) {
      try {
        models[modelName].associate(models);
        logger.info(`Associations configured for ${modelName}`);
      } catch (error) {
        logger.error(`Error configuring associations for ${modelName}:`, error);
        throw error;
      }
    }
  });

  logger.info('All models and associations initialized successfully');

} catch (error) {
  logger.error('Error during model initialization:', error);
  throw error;
}

// Sincronizar modelos con la base de datos
sequelize.sync({ alter: true })
  .then(() => {
    logger.info('Database synchronized successfully');
  })
  .catch(error => {
    logger.error('Error synchronizing database:', error);
    throw error;
  });

module.exports = {
  sequelize,
  models
};
