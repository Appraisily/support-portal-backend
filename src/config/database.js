const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');

let sequelize;
let models = {};
let initialized = false;
let initializationPromise = null;

const initializeDatabase = async () => {
  if (initialized) return models;
  
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      logger.info('Iniciando conexión a base de datos...');
      
      // Configuración según ambiente
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
        sequelize = new Sequelize({
          dialect: 'sqlite',
          storage: './dev.sqlite',
          logging: false
        });
      }

      await sequelize.authenticate();
      logger.info('Conexión a base de datos establecida correctamente');

      // Cargar modelos
      models = {
        User: require('../models/user')(sequelize, DataTypes),
        Customer: require('../models/customer')(sequelize, DataTypes),
        Ticket: require('../models/ticket')(sequelize, DataTypes),
        Message: require('../models/message')(sequelize, DataTypes),
        Attachment: require('../models/attachment')(sequelize, DataTypes),
        Setting: require('../models/setting')(sequelize, DataTypes)
      };

      // Verificar modelos
      const missingModels = Object.entries(models)
        .filter(([name, model]) => !model)
        .map(([name]) => name);

      if (missingModels.length > 0) {
        throw new Error(`Failed to load models: ${missingModels.join(', ')}`);
      }

      // Configurar asociaciones
      Object.keys(models).forEach(modelName => {
        if (models[modelName].associate) {
          models[modelName].associate(models);
        }
      });

      // En desarrollo, sincronizar esquema
      if (process.env.NODE_ENV !== 'production') {
        await sequelize.sync();
        logger.info('Database schema synchronized (DEVELOPMENT ONLY)');
      }

      initialized = true;
      return models;

    } catch (error) {
      initializationPromise = null;
      logger.error('Error inicializando base de datos:', error);
      throw error;
    }
  })();

  return initializationPromise;
};

module.exports = {
  getModels: async () => {
    if (!initialized) {
      await initializeDatabase();
    }
    return models;
  },
  getSequelize: () => sequelize,
  initializeDatabase
};
