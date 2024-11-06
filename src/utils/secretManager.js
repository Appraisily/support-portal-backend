const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const logger = require('./logger');

class SecretManager {
  constructor() {
    this.client = new SecretManagerServiceClient();
    this.secrets = new Map();
    this.initialized = false;
    this.initPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.loadSecrets();
    await this.initPromise;
    this.initialized = true;
  }

  async getSecret(name) {
    await this.ensureInitialized();
    return this.secrets.get(name);
  }

  async loadSecrets() {
    if (this.initialized) return;
    
    try {
      const requiredSecrets = [
        'DB_USER',
        'DB_PASSWORD',
        'DB_NAME',
        'DB_HOST',
        'DB_PORT',
        'CLOUD_SQL_CONNECTION_NAME',
        'GMAIL_CLIENT_ID',
        'GMAIL_CLIENT_SECRET',
        'GMAIL_REFRESH_TOKEN',
        {
          secretName: 'jwt-secret',
          envVar: 'JWT_SECRET'
        }
      ];

      for (const secret of requiredSecrets) {
        if (typeof secret === 'string') {
          const value = await this._fetchSecret(secret);
          this.secrets.set(secret, value);
          process.env[secret] = value;
        } else {
          const value = await this._fetchSecret(secret.secretName);
          this.secrets.set(secret.secretName, value);
          process.env[secret.envVar] = value;
        }
      }

      this.initialized = true;
      logger.info('All secrets loaded successfully');
    } catch (error) {
      logger.error('Failed to load secrets:', error);
      throw error;
    }
  }

  async _fetchSecret(secretName) {
    try {
      const [version] = await this.client.accessSecretVersion({
        name: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/secrets/${secretName}/versions/latest`,
      });

      const secretValue = version.payload.data.toString();
      return secretValue;
    } catch (error) {
      if (error.code === 5) { // NOT_FOUND
        logger.warn(`Secret ${secretName} not found, skipping...`);
        throw error;
      }
      throw error;
    }
  }
}

module.exports = new SecretManager();
