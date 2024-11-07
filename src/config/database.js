const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');

let sequelize = null;
let models = null;

/*
IMPORTANTE: Configuración de conexión a base de datos

Errores comunes:
1. EAI_AGAIN: Problema de resolución DNS
   - Verificar que el host es correcto
   - Asegurarse que Cloud SQL Proxy está funcionando
   - Comprobar conectividad de red

2. connection refused: 
   - Puerto incorrecto
   - Firewall bloqueando conexión
   - Instancia no está corriendo

3. auth failed:
   - Credenciales incorrectas
   - Usuario no tiene permisos
*/

const initializeDatabase = async () => {
  if (sequelize) {
    return sequelize;
  }

  try {
    await secretManager.ensureInitialized();

    // Obtener y validar todos los secretos necesarios
    const dbConfig = {
      user: await secretManager.getSecret('DB_USER'),
      password: await secretManager.getSecret('DB_PASSWORD'),
      database: await secretManager.getSecret('DB_NAME'),
      host: await secretManager.getSecret('DB_HOST'),
      port: await secretManager.getSecret('DB_PORT'),
      instanceName: await secretManager.getSecret('CLOUD_SQL_CONNECTION_NAME')
    };

    // Validar que tenemos todos los datos necesarios
    Object.entries(dbConfig).forEach(([key, value]) => {
      if (!value) {
        throw new Error(`Missing database config: ${key}`);
      }
    });

    logger.info('Initializing database connection', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      instanceName: dbConfig.instanceName
    });

    // Usar socket para Cloud SQL si está disponible
    const dialectOptions = {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    };

    if (process.env.NODE_ENV === 'production') {
      dialectOptions.socketPath = `/cloudsql/${dbConfig.instanceName}`;
    }

    sequelize = new Sequelize({
      dialect: 'postgres',
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      username: dbConfig.user,
      password: dbConfig.password,
      dialectOptions,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      logging: (msg) => logger.debug('Sequelize:', { query: msg })
    });

    // Probar la conexión
    await sequelize.authenticate();
    
    logger.info('Database connection established successfully', {
      host: dbConfig.host,
      database: dbConfig.database
    });

    return sequelize;
  } catch (error) {
    logger.error('Database initialization failed', {
      error: error.message,
      stack: error.stack,
      errorCode: error.original?.code,
      errorDetail: error.original?.detail
    });
    
    // Reintentar en desarrollo
    if (process.env.NODE_ENV !== 'production') {
      logger.info('Retrying database connection in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return initializeDatabase();
    }
    
    throw error;
  }
};

const getModels = async () => {
  if (models) {
    return models;
  }

  try {
    const sequelize = await initializeDatabase();
    
    // Importar modelos
    const Setting = require('../models/Setting')(sequelize);
    // ... otros modelos

    models = {
      Setting,
      // ... otros modelos
    };

    // Asociaciones de modelos si es necesario
    Object.values(models).forEach(model => {
      if (model.associate) {
        model.associate(models);
      }
    });

    logger.info('Models initialized successfully');
    return models;
  } catch (error) {
    logger.error('Failed to initialize models', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

module.exports = {
  initializeDatabase,
  getModels
};
