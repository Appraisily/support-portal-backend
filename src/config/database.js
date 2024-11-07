const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

let sequelize = null;

const initializeDatabase = async () => {
  if (sequelize) {
    return sequelize;
  }

  const config = {
    dialect: 'postgres',
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    logging: (msg) => logger.debug('Sequelize:', { query: msg }),
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  };

  // In development, don't verify SSL cert
  if (process.env.NODE_ENV === 'development') {
    config.dialectOptions = {
      ssl: false
    };
  }

  try {
    sequelize = new Sequelize(config);
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    return sequelize;
  } catch (error) {
    logger.error('Unable to connect to database:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

module.exports = {
  initializeDatabase,
  getSequelize: () => sequelize
};