const secretManager = require('./src/utils/secretManager');

module.exports = {
  development: {
    dialect: 'postgres',
    host: 'localhost',
    port: 5432,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  },
  production: {
    dialect: 'postgres',
    host: '/cloudsql',
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dialectOptions: {
      socketPath: process.env.CLOUD_SQL_CONNECTION_NAME ? 
        `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}` : undefined
    }
  }
};