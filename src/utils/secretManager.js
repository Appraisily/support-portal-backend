const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const logger = require('./logger');

class SecretManager {
  constructor() {
    this.client = new SecretManagerServiceClient();
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    this.secrets = new Map();
  }

  async getSecret(secretName) {
    if (this.secrets.has(secretName)) {
      return this.secrets.get(secretName);
    }

    try {
      const name = `projects/${this.projectId}/secrets/${secretName}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name });
      const secret = version.payload.data.toString();
      this.secrets.set(secretName, secret);
      return secret;
    } catch (error) {
      logger.error(`Error accessing secret ${secretName}:`, error);
      throw error;
    }
  }

  async loadSecrets() {
    const requiredSecrets = [
      'JWT_SECRET',
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      'CLOUD_SQL_CONNECTION_NAME',
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REDIRECT_URI',
      'STORAGE_BUCKET',
      'SENDGRID_API_KEY',
      'SENDGRID_EMAIL',
      'STRIPE_SECRET_KEY_LIVE',
      'STRIPE_WEBHOOK_SECRET_LIVE'
    ];

    try {
      for (const secretName of requiredSecrets) {
        const value = await this.getSecret(secretName);
        process.env[secretName] = value;
        logger.info(`Loaded secret: ${secretName}`);
      }
    } catch (error) {
      logger.error('Failed to load secrets:', error);
      throw error;
    }
  }
}

module.exports = new SecretManager();