const { Sequelize, DataTypes } = require('sequelize');
const logger = require('../utils/logger');
const fs = require('fs');

const createSequelizeInstance = () => {
  if (process.env.NODE_ENV === 'production') {
    const connectionName = process.env.CLOUD_SQL_CONNECTION_NAME;
    const dbName = process.env.DB_NAME;
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;

    logger.info('Environment Variables:', {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      STORAGE_BUCKET: process.env.STORAGE_BUCKET,
      CLOUD_SQL_CONNECTION_NAME: connectionName,
      DB_NAME: dbName,
      DB_USER: dbUser,
      // No logs para DB_PASSWORD por seguridad
    });

    if (!connectionName || !dbName || !dbUser || !dbPassword) {
      logger.error('Missing database configuration:', {
        connectionName: !!connectionName,
        dbName: !!dbName,
        dbUser: !!dbUser,
        dbPassword: !!dbPassword
      });
      throw new Error('Missing required database configuration environment variables');
    }

    const socketPath = `/cloudsql/${connectionName}`;
    
    logger.info('Production database configuration:', {
      connectionName,
      dbName,
      dbUser,
      socketPath
    });

    // Verificación de directorio y permisos del socket
    try {
      if (!fs.existsSync('/cloudsql')) {
        logger.info('Creating /cloudsql directory');
        fs.mkdirSync('/cloudsql', { recursive: true, mode: 0o777 });
      }

      const stats = fs.statSync('/cloudsql');
      logger.info('Socket directory stats:', {
        mode: stats.mode,
        uid: stats.uid,
        gid: stats.gid
      });

      const contents = fs.readdirSync('/cloudsql');
      logger.info('Socket directory contents:', contents);
    } catch (error) {
      logger.error('Socket directory error:', error);
    }

    const config = {
      dialect: 'postgres',
      host: socketPath,
      database: dbName,
      username: dbUser,
      password: dbPassword,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      dialectOptions: {
        socketPath: socketPath,
        ssl: false,
        native: true,
        keepAlive: true
      },
      logging: msg => logger.debug(msg)
    };

    logger.info('Creating Sequelize instance with config:', {
      dialect: config.dialect,
      host: config.host,
      database: config.database,
      username: config.username,
      poolConfig: config.pool,
      socketPath: config.dialectOptions.socketPath
    });

    return new Sequelize(config);
  } else {
    logger.info('Development mode - using SQLite');
    return new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: msg => logger.debug(msg)
    });
  }
};
