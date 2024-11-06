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
        'GMAIL_REFRESH_TOKEN',
        'jwt-secret',
        'DB_USER',
        'DB_PASSWORD',
        'DB_NAME',
        'DB_HOST',
        'DB_PORT',
        'CLOUD_SQL_CONNECTION_NAME'
      ];

      for (const secretName of requiredSecrets) {
        if (!this.secrets.has(secretName)) {
          const secret = await this._fetchSecret(secretName);
          this.secrets.set(secretName, secret);
          process.env[secretName] = secret;
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
