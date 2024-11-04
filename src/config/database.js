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

// Definir modelos uno por uno para mejor control de errores
try {
  models.Ticket = defineTicket(sequelize, DataTypes);
  logger.info('Ticket model initialized');
  
  models.Message = defineMessage(sequelize, DataTypes);
  logger.info('Message model initialized');
  
  models.Attachment = defineAttachment(sequelize, DataTypes);
  logger.info('Attachment model initialized');
  
  models.Customer = defineCustomer(sequelize, DataTypes);
  logger.info('Customer model initialized');
  
  models.User = defineUser(sequelize, DataTypes);
  logger.info('User model initialized');

  // Configurar asociaciones
  Object.keys(models).forEach(modelName => {
    if (models[modelName].associate) {
      models[modelName].associate(models);
    }
  });
  logger.info('Model associations configured');

} catch (error) {
  logger.error('Error initializing models:', error);
  throw error;
}

// Exportar la conexión y los modelos
module.exports = {
  sequelize,
  models
};
