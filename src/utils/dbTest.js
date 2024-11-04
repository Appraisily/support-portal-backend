const { Client } = require('pg');
const fs = require('fs');
const logger = require('./logger');

async function testDatabaseConnection() {
  const {
    CLOUD_SQL_CONNECTION_NAME,
    DB_NAME,
    DB_USER,
    DB_PASSWORD
  } = process.env;

  logger.info('Starting database connectivity test...');

  // 1. Check environment variables
  logger.info('1. Checking environment variables...');
  const envCheck = {
    CLOUD_SQL_CONNECTION_NAME: !!CLOUD_SQL_CONNECTION_NAME,
    DB_NAME: !!DB_NAME,
    DB_USER: !!DB_USER,
    DB_PASSWORD: !!DB_PASSWORD
  };
  logger.info('Environment variables present:', envCheck);

  // 2. Check Unix socket directory
  const socketPath = `/cloudsql/${CLOUD_SQL_CONNECTION_NAME}`;
  logger.info('2. Checking Unix socket path:', socketPath);
  
  try {
    const socketExists = fs.existsSync(socketPath);
    logger.info('Socket path exists:', socketExists);
    
    if (socketExists) {
      const stats = fs.statSync(socketPath);
      logger.info('Socket file permissions:', {
        mode: stats.mode.toString(8),
        uid: stats.uid,
        gid: stats.gid
      });

      const contents = fs.readdirSync('/cloudsql');
      logger.info('Contents of /cloudsql directory:', contents);
    }
  } catch (error) {
    logger.error('Error checking socket:', {
      error: error.message,
      code: error.code,
      path: error.path
    });
  }

  // 3. Test PostgreSQL connection
  logger.info('3. Testing PostgreSQL connection...');
  const client = new Client({
    host: socketPath,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD
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
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position
    });
    return false;
  }
}

module.exports = { testDatabaseConnection };
