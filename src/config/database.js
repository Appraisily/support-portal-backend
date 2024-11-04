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

const initializeDatabase = async () => {
  try {
    // Probar conexión
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Definir modelos
    const models = {
      User: defineUser(sequelize, DataTypes),
      Customer: defineCustomer(sequelize, DataTypes),
      Ticket: defineTicket(sequelize, DataTypes),
      Message: defineMessage(sequelize, DataTypes),
      Attachment: defineAttachment(sequelize, DataTypes)
    };

    // Esperar a que todos los modelos estén definidos
    await Promise.all(Object.values(models));
    logger.info('All models defined successfully');

    // Configurar asociaciones
    for (const modelName of Object.keys(models)) {
      if (typeof models[modelName].associate === 'function') {
        try {
          await models[modelName].associate(models);
          logger.info(`Associations configured for ${modelName}`);
        } catch (error) {
          logger.error(`Error configuring associations for ${modelName}:`, error);
          throw error;
        }
      }
    }

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

// Inicializar modelos y asociaciones
const models = {};
let initialized = false;

const getModels = async () => {
  if (!initialized) {
    Object.assign(models, await initializeDatabase());
    initialized = true;
  }
  return models;
};

module.exports = {
  sequelize,
  models,
  getModels
};
