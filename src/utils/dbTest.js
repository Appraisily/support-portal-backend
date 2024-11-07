const { Client } = require('pg');
const logger = require('./logger');

async function checkDatabaseConnection() {
  const {
    DB_NAME,
    DB_USER,
    DB_PASSWORD,
    CLOUD_SQL_CONNECTION_NAME
  } = process.env;

  logger.info('Starting database connectivity test...');

  // 1. Check environment variables
  logger.info('1. Checking environment variables...');
  const envCheck = {
    DB_NAME: !!DB_NAME,
    DB_USER: !!DB_USER,
    DB_PASSWORD: !!DB_PASSWORD,
    CLOUD_SQL_CONNECTION_NAME: !!CLOUD_SQL_CONNECTION_NAME
  };
  logger.info('Environment variables present:', envCheck);

  // 2. Test PostgreSQL connection
  logger.info('2. Testing PostgreSQL connection...');
  const client = new Client({
    host: `/cloudsql/${CLOUD_SQL_CONNECTION_NAME}`,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: false,
    dialectOptions: {
      socketPath: `/cloudsql/${CLOUD_SQL_CONNECTION_NAME}`
    }
  });

  try {
    logger.info('Attempting to connect to database with connection name:', CLOUD_SQL_CONNECTION_NAME);
    await client.connect();
    logger.info('Successfully connected to database');

    // Test query
    const result = await client.query('SELECT version()');
    logger.info('Database version:', result.rows[0]);

    await client.end();
    logger.info('Database connection test completed successfully');
    return true;
  } catch (error) {
    logger.error('Database connection test failed:', {
      code: error.code,
      message: error.message,
      detail: error.detail,
      hint: error.hint,
      connectionName: CLOUD_SQL_CONNECTION_NAME
    });
    return false;
  }
}

module.exports = { checkDatabaseConnection };