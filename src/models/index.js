const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

let sequelize;

if (process.env.NODE_ENV === 'production') {
  sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: (msg) => logger.debug(msg)
  });
} else {
  // Configuración para desarrollo/testing
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
}

const models = {
  Customer: require('./customer')(sequelize),
  Ticket: require('./ticket')(sequelize),
  Message: require('./message')(sequelize),
  Setting: require('./setting')(sequelize)
};

// Configurar relaciones
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Función para obtener los modelos (asegura que la conexión está lista)
async function getModels() {
  if (!sequelize) {
    throw new Error('Database not initialized');
  }
  return models;
}

module.exports = {
  sequelize,
  getModels
};