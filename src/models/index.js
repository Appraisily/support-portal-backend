const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

let sequelize;

if (process.env.NODE_ENV === 'production') {
  sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: (msg) => logger.debug(msg)
  });
} else {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  });
}

// Definir modelos
const models = {
  Customer: require('./customer')(sequelize, DataTypes),
  Ticket: require('./ticket')(sequelize, DataTypes),
  Message: require('./message')(sequelize, DataTypes),
  Setting: require('./setting')(sequelize, DataTypes)
};

// Configurar asociaciones
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Función para obtener los modelos
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