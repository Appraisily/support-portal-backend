const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

let sequelize;
let models = null;

async function initializeModels() {
  if (models) return models;

  // Credenciales de base de datos (DB_*)
  // Estas son las credenciales para conectarse a Cloud SQL
  // No confundir con ADMIN_EMAIL y ADMIN_PASSWORD que son para el login del frontend
  if (process.env.NODE_ENV === 'production') {
    sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,  // Cambiado de DB_PASS a DB_PASSWORD para mantener consistencia
      {
        dialect: 'postgres',
        host: '/cloudsql/' + process.env.CLOUD_SQL_CONNECTION_NAME,
        logging: (msg) => logger.debug(msg),
        dialectOptions: {
          socketPath: '/cloudsql/' + process.env.CLOUD_SQL_CONNECTION_NAME
        }
      }
    );
    logger.info('Connecting to Cloud SQL with credentials:', {
      dbName: process.env.DB_NAME,
      dbUser: process.env.DB_USER,
      connectionName: process.env.CLOUD_SQL_CONNECTION_NAME
    });
  } else {
    // Configuración para desarrollo local
    sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false
    });
    logger.info('Using SQLite for local development');
  }

  // Definir modelos
  models = {
    User: require('./user')(sequelize, DataTypes),
    Customer: require('./customer')(sequelize, DataTypes),
    Ticket: require('./ticket')(sequelize, DataTypes),
    Message: require('./message')(sequelize, DataTypes),
    Setting: require('./setting')(sequelize, DataTypes)
  };

  // Verificar que todos los modelos se cargaron correctamente
  const missingModels = Object.entries(models)
    .filter(([name, model]) => !model)
    .map(([name]) => name);

  if (missingModels.length > 0) {
    throw new Error(`Failed to load models: ${missingModels.join(', ')}`);
  }

  // Configurar asociaciones
  Object.keys(models).forEach(modelName => {
    if (models[modelName].associate) {
      try {
        models[modelName].associate(models);
        logger.info(`Associations configured for ${modelName}`);
      } catch (error) {
        logger.error(`Failed to configure associations for ${modelName}:`, error);
        throw error;
      }
    }
  });

  // Sincronizar modelos con la base de datos
  try {
    await sequelize.sync();
    logger.info('Database models synchronized successfully');
  } catch (error) {
    logger.error('Failed to sync database models:', error);
    throw error;
  }

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