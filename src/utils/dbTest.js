const { Client } = require('pg');
const logger = require('./logger');

async function testDatabaseConnection() {
  const {
    DB_NAME,
    DB_USER,
    DB_PASSWORD
  } = process.env;

  logger.info('Starting database connectivity test...');

  // 1. Check environment variables
  logger.info('1. Checking environment variables...');
  const envCheck = {
    DB_NAME: !!DB_NAME,
    DB_USER: !!DB_USER,
    DB_PASSWORD: !!DB_PASSWORD
  };
  logger.info('Environment variables present:', envCheck);

  // 2. Test PostgreSQL connection
  logger.info('2. Testing PostgreSQL connection...');
  const client = new Client({
    host: '34.57.184.164',
    port: 5432,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ssl: false
  });

  try {
    logger.info('Attempting to connect to database...');
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
      hint: error.hint
    });
    return false;
  }
}

module.exports = { testDatabaseConnection };
