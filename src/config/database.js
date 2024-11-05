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
let initialized = false;
let initializationPromise = null;

const initializeDatabase = async () => {
  if (initialized) return models;
  
  try {
    logger.info('Iniciando conexión a base de datos...');
    
    // Log detallado de la configuración
    logger.info('Configuración de base de datos:', {
      environment: process.env.NODE_ENV,
      dbName: process.env.DB_NAME,
      dbUser: process.env.DB_USER,
      dbHost: process.env.DB_HOST,
      dbPort: process.env.DB_PORT,
      connectionName: process.env.CLOUD_SQL_CONNECTION_NAME,
      hasPassword: !!process.env.DB_PASSWORD
    });

    // Verificar que tenemos las credenciales necesarias
    if (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
      logger.error('Faltan credenciales de base de datos:', {
        hasUser: !!process.env.DB_USER,
        hasPassword: !!process.env.DB_PASSWORD,
        hasDBName: !!process.env.DB_NAME,
        hasConnectionName: !!process.env.CLOUD_SQL_CONNECTION_NAME
      });
      throw new Error('Credenciales de base de datos incompletas');
    }

    // Crear instancia de Sequelize DESPUÉS de verificar las credenciales
    if (process.env.NODE_ENV === 'production') {
      logger.info('Configurando conexión para Cloud SQL:', {
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        socketPath: '/cloudsql/' + process.env.CLOUD_SQL_CONNECTION_NAME
      });

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

    // Probar la conexión
    await sequelize.authenticate();
    logger.info('Conexión a base de datos establecida correctamente');

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

    initialized = true;
    return models;
  } catch (error) {
    initializationPromise = null; // Permitir reintentar en caso de error
    logger.error('Error inicializando base de datos:', error);
    throw error;
  }
};

module.exports = {
  getModels: async () => {
    if (!initializationPromise) {
      initializationPromise = initializeDatabase();
    }
    await initializationPromise;
    return models;
  },
  initializeDatabase
};
