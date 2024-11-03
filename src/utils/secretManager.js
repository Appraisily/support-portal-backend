const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const logger = require('./logger');

class SecretManager {
  constructor() {
    this.client = new SecretManagerServiceClient();
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    this.secrets = new Map();
  }

  async getSecret(secretName) {
    // Convert secret names to match Secret Manager format
    const formattedName = secretName.toLowerCase().replace(/_/g, '-');
    
    if (this.secrets.has(formattedName)) {
      return this.secrets.get(formattedName);
    }

    try {
      const name = `projects/${this.projectId}/secrets/${formattedName}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name });
      const secret = version.payload.data.toString();
      this.secrets.set(formattedName, secret);
      return secret;
    } catch (error) {
      logger.error(`Error accessing secret ${formattedName}:`, error);
      throw error;
    }
  }

  async loadSecrets() {
    const requiredSecrets = [
      'jwt-secret',
      'db-host',
      'db-port',
      'db-name',
      'db-user',
      'db-password',
      'cloud-sql-connection-name',
      'gmail-client-id',
      'gmail-client-secret',
      'gmail-refresh-token',
      'storage-bucket',
      'sendgrid-api-key',
      'sendgrid-email',
      'stripe-secret-key-live',
      'stripe-webhook-secret-live'
    ];

    try {
      for (const secretName of requiredSecrets) {
        const value = await this.getSecret(secretName);
        // Convert back to environment variable format
        const envName = secretName.toUpperCase().replace(/-/g, '_');
        process.env[envName] = value;
        logger.info(`Loaded secret: ${secretName}`);
      }
    } catch (error) {
      logger.error('Failed to load secrets:', error);
      throw error;
    }
  }
}

module.exports = new SecretManager();
