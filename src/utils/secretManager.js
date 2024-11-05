const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const logger = require('./logger');

const client = new SecretManagerServiceClient();

// Lista de secretos requeridos
const REQUIRED_SECRETS = {
  // Credenciales de base de datos para Cloud SQL
  DB_NAME: 'DB_NAME',
  DB_USER: 'DB_USER',
  DB_PASSWORD: 'DB_PASSWORD',
  DB_HOST: 'DB_HOST',
  DB_PORT: 'DB_PORT',

  // Credenciales de administrador para el panel de control web
  ADMIN_EMAIL: 'ADMIN_EMAIL',
  ADMIN_PASSWORD: 'ADMIN_PASSWORD',

  // Credenciales de Gmail para la integración
  GMAIL_CLIENT_ID: 'GMAIL_CLIENT_ID',
  GMAIL_CLIENT_SECRET: 'GMAIL_CLIENT_SECRET',
  GMAIL_REFRESH_TOKEN: 'GMAIL_REFRESH_TOKEN',
  GMAIL_USER_EMAIL: 'GMAIL_USER_EMAIL',
  
  // Otros secretos
  JWT_SECRET: 'jwt-secret'
};

async function loadSecrets() {
  try {
    // Verificar que tenemos el ID del proyecto
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID environment variable is not set');
    }

    logger.info(`Loading secrets for project: ${projectId}`);
    const loadedSecrets = new Set();

    for (const [envVar, secretName] of Object.entries(REQUIRED_SECRETS)) {
      logger.info(`Accessing secret: ${secretName}`);
      
      try {
        const [version] = await client.accessSecretVersion({
          name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
        });

        const secretValue = version.payload.data.toString();
        process.env[envVar] = secretValue;
        loadedSecrets.add(envVar);

        logger.info(`Secret ${secretName} retrieved successfully`);
        logger.info(`Loaded secret: ${secretName}`);
      } catch (error) {
        if (error.code === 5) { // NOT_FOUND
          logger.warn(`Secret ${secretName} not found, skipping...`);
          continue;
        }
        throw error;
      }
    }

    // Verificar que todas las credenciales de Gmail se cargaron
    const requiredGmailVars = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_USER_EMAIL'];
    const missingGmailVars = requiredGmailVars.filter(varName => !loadedSecrets.has(varName));
    
    if (missingGmailVars.length > 0) {
      logger.error(`Missing required Gmail secrets: ${missingGmailVars.join(', ')}`);
    } else {
      logger.info('All Gmail secrets loaded successfully');
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
