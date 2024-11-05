const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

// Modelos
const defineTicket = require('../models/ticket');
const defineMessage = require('../models/message');
const defineAttachment = require('../models/attachment');
const defineCustomer = require('../models/customer');
const defineUser = require('../models/user');

let sequelize;
let models = {};

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

const initializeDatabase = async () => {
  try {
    // Probar conexión
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Definir modelos
    models = {
      User: defineUser(sequelize, DataTypes),
      Customer: defineCustomer(sequelize, DataTypes),
      Ticket: defineTicket(sequelize, DataTypes),
      Message: defineMessage(sequelize, DataTypes),
      Attachment: defineAttachment(sequelize, DataTypes)
    };

    // Configurar asociaciones después de que todos los modelos estén definidos
    Object.keys(models).forEach(modelName => {
      if (models[modelName].associate) {
        models[modelName].associate(models);
        logger.info(`Associations configured for ${modelName}`);
      }
    });

    logger.info('All associations configured successfully');

    // Sincronizar con la base de datos
    await sequelize.sync({ alter: true });
    logger.info('Database synchronized successfully');

    return models;
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

let initialized = false;

const getModels = async () => {
  if (!initialized) {
    await initializeDatabase();
    initialized = true;
  }
  return models;
};

module.exports = {
  sequelize,
  getModels
};
