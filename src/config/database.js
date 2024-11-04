const { Sequelize } = require('sequelize');
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
const models = {
  Ticket: defineTicket(sequelize),
  Message: defineMessage(sequelize),
  Attachment: defineAttachment(sequelize),
  Customer: defineCustomer(sequelize),
  User: defineUser(sequelize)
};

// Configurar asociaciones
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Exportar la conexión y los modelos
module.exports = {
  sequelize,
  models
};
