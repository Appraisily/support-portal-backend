const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const logger = require('./logger');

class SecretManager {
  constructor() {
    this.client = new SecretManagerServiceClient();
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    this.secrets = new Map();
  }

  async getSecret(secretName) {
    try {
      const name = `projects/${this.projectId}/secrets/${secretName}/versions/latest`;
      logger.info(`Accessing secret: ${secretName}`);
      
      const [version] = await this.client.accessSecretVersion({ name });
      const secret = version.payload.data.toString().trim();
      
      logger.info(`Secret ${secretName} retrieved successfully`);
      return secret;
    } catch (error) {
      logger.error(`Error accessing secret ${secretName}:`, error);
      throw error;
    }
  }

  async loadSecrets() {
    if (!this.projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID environment variable is not set');
    }

    logger.info('Loading secrets for project:', this.projectId);

    const requiredSecrets = [
      // Secretos para la base de datos
      'CLOUD_SQL_CONNECTION_NAME',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      
      // Secretos para Gmail (si los necesitas)
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN',
      
      // Secretos para JWT y autenticación
      'jwt-secret',
      
      // Credenciales de admin para el frontend
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD'
    ];

    try {
      for (const secretName of requiredSecrets) {
        const value = await this.getSecret(secretName);
        // Para jwt-secret, convertir a JWT_SECRET en env
        const envName = secretName === 'jwt-secret' ? 'JWT_SECRET' : secretName;
        process.env[envName] = value;
        logger.info(`Loaded secret: ${secretName}`);
      }

      logger.info('All required secrets loaded successfully');
    } catch (error) {
      logger.error('Failed to load secrets:', error);
      throw error;
    }
  }
}

module.exports = new SecretManager();
