const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const secretManager = require('../utils/secretManager');

let sequelize = null;
let models = null;

/*
IMPORTANTE: La base de datos debe inicializarse después de Secret Manager

Dependencias:
1. Requiere secretos DB_* de Secret Manager
2. Debe estar lista antes de que las rutas se activen
3. Servicios como Gmail necesitan la DB para:
   - Almacenar historyId
   - Guardar estado de webhooks
   - Mantener configuración

Errores comunes:
- "url must be string": Secret Manager no inicializado
- "connection refused": Credenciales incorrectas
- "relation does not exist": Migrations no ejecutadas
*/

const initializeDatabase = async () => {
  if (sequelize) {
    return sequelize;
  }

  try {
    // Esperar a que los secretos estén disponibles
    await secretManager.ensureInitialized();

    // Construir DATABASE_URL usando los secretos
    const dbUser = await secretManager.getSecret('DB_USER');
    const dbPassword = await secretManager.getSecret('DB_PASSWORD');
    const dbName = await secretManager.getSecret('DB_NAME');
    const dbHost = await secretManager.getSecret('DB_HOST');
    const dbPort = await secretManager.getSecret('DB_PORT');

    const databaseUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

    logger.info('Initializing database connection', {
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: dbUser
    });

    sequelize = new Sequelize(databaseUrl, {
      logging: (msg) => logger.debug('Sequelize:', { query: msg }),
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      }
    });

    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    return sequelize;
  } catch (error) {
    logger.error('Database initialization failed', {
      error: error.message,
      stack: error.stack
    });
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
