const { Client } = require('pg');
const logger = require('./logger');
const secretManager = require('./secretManager');

async function testDatabaseConnection() {
  try {
    logger.info('Starting database connectivity test...');

    // Get database configuration from Secret Manager
    await secretManager.ensureInitialized();
    
    const dbConfig = {
      user: await secretManager.getSecret('DB_USER'),
      password: await secretManager.getSecret('DB_PASSWORD'),
      database: await secretManager.getSecret('DB_NAME'),
      instanceName: await secretManager.getSecret('CLOUD_SQL_CONNECTION_NAME')
    };

    // Configure client based on environment
    const clientConfig = {
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database
    };

    if (process.env.NODE_ENV === 'production') {
      // Production: Use Unix Domain Socket
      clientConfig.host = '/cloudsql';
      clientConfig.dialectOptions = {
        socketPath: `/cloudsql/${dbConfig.instanceName}`
      };
    } else {
      // Development: Use TCP
      clientConfig.host = 'localhost';
      clientConfig.port = 5432;
    }

    logger.info('Testing database connection...', {
      database: dbConfig.database,
      instanceName: dbConfig.instanceName
    });

    const client = new Client(clientConfig);
    await client.connect();

    const result = await client.query('SELECT version()');
    logger.info('Database connection successful', {
      version: result.rows[0].version
    });

    await client.end();
    return true;

  } catch (error) {
    logger.error('Database connection test failed', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail
    });
    return false;
  }
}