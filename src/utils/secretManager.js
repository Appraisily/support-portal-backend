const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const logger = require('./logger');

const client = new SecretManagerServiceClient();

// Lista de secretos requeridos
const REQUIRED_SECRETS = {
  // Credenciales de base de datos para Cloud SQL
  DB_NAME: 'db-name',
  DB_USER: 'db-user',
  DB_PASSWORD: 'db-password',
  CLOUD_SQL_CONNECTION_NAME: 'cloud-sql-connection',

  // Credenciales de administrador para el frontend
  ADMIN_EMAIL: 'admin-email',
  ADMIN_PASSWORD: 'admin-password',

  // Credenciales de Gmail para la integración
  GMAIL_CLIENT_ID: 'gmail-client-id',
  GMAIL_CLIENT_SECRET: 'gmail-client-secret',
  GMAIL_REFRESH_TOKEN: 'gmail-refresh-token',
  
  // Otros secretos
  JWT_SECRET: 'jwt-secret'
};

async function loadSecrets() {
  try {
    for (const [envVar, secretName] of Object.entries(REQUIRED_SECRETS)) {
      logger.info(`Accessing secret: ${secretName}`);
      
      const [version] = await client.accessSecretVersion({
        name: `projects/${process.env.PROJECT_ID}/secrets/${secretName}/versions/latest`,
      });

      const secretValue = version.payload.data.toString();
      process.env[envVar] = secretValue;

      logger.info(`Secret ${secretName} retrieved successfully`);
      logger.info(`Loaded secret: ${secretName}`);
    }

    logger.info('All required secrets loaded successfully');
  } catch (error) {
    logger.error('Error loading secrets:', error);
    throw error;
  }
}

module.exports = {
  loadSecrets
};
