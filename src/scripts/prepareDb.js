const { Client } = require('pg');
const logger = require('../utils/logger');

async function createDatabase() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: 'postgres' // Connect to default database first
  });

  try {
    await client.connect();
    
    // Check if database exists
    const dbName = process.env.DB_NAME || 'support_portal';
    const result = await client.query(
      `SELECT 1 FROM pg_database WHERE datname='${dbName}'`
    );

    if (result.rows.length === 0) {
      // Create database if it doesn't exist
      await client.query(`CREATE DATABASE ${dbName}`);
      logger.info(`Database ${dbName} created successfully`);
    } else {
      logger.info(`Database ${dbName} already exists`);
    }

  } catch (error) {
    logger.error('Database preparation failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run if called directly
if (require.main === module) {
  createDatabase()
    .then(() => {
      logger.info('Database preparation completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Database preparation failed:', error);
      process.exit(1);
    });
}

module.exports = { createDatabase };