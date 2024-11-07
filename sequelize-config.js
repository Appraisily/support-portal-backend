const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  development: {
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'support_portal',
    logging: false
  },
  test: {
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  },
  production: {
    dialect: 'postgres',
    host: process.env.CLOUD_SQL_CONNECTION_NAME 
      ? `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
      : process.env.DB_HOST,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dialectOptions: {
      socketPath: process.env.CLOUD_SQL_CONNECTION_NAME 
        ? `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
        : undefined,
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  }
};