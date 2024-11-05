const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

let sequelize;
let models = null;

async function initializeModels() {
  if (models) return models;

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
  models = {
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

  // Sincronizar modelos con la base de datos
  await sequelize.sync();
  
  return models;
}

async function getModels() {
  if (!models) {
    await initializeModels();
  }
  return models;
}

module.exports = {
  sequelize,
  getModels,
  initializeModels
};