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
        // Database secrets
        'DB_USER',
        'DB_PASSWORD',
        'DB_NAME',
        'DB_HOST',
        'DB_PORT',
        'CLOUD_SQL_CONNECTION_NAME',
        
        // Gmail API secrets
        'GMAIL_CLIENT_ID',
        'GMAIL_CLIENT_SECRET',
        'GMAIL_REFRESH_TOKEN',
        
        // Admin authentication secrets
        'ADMIN_EMAIL',
        'ADMIN_PASSWORD',
        
        // JWT secret
        {
          secretName: 'jwt-secret',
          envVar: 'JWT_SECRET'
        },

        // OpenAI API key
        'OPENAI_API_KEY',

        // Google Sheets IDs
        'SALES_SPREADSHEET_ID',
        'PENDING_APPRAISALS_SPREADSHEET_ID',
        'COMPLETED_APPRAISALS_SPREADSHEET_ID'
      ];

      const results = await Promise.allSettled(
        requiredSecrets.map(async (secret) => {
          try {
            if (typeof secret === 'string') {
              const value = await this._fetchSecret(secret);
              this.secrets.set(secret, value);
              process.env[secret] = value;
              return { secret, success: true };
            } else {
              const value = await this._fetchSecret(secret.secretName);
              this.secrets.set(secret.secretName, value);
              process.env[secret.envVar] = value;
              return { secret: secret.secretName, success: true };
            }
          } catch (error) {
            return { secret: typeof secret === 'string' ? secret : secret.secretName, success: false, error };
          }
        })
      );

      // Log results
      const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected' || !r.value.success);

      logger.info('Secrets loading completed', {
        total: results.length,
        succeeded: succeeded.length,
        failed: failed.length
      });

      if (failed.length > 0) {
        logger.warn('Some secrets failed to load', {
          failedSecrets: failed.map(f => f.value?.secret || f.reason?.secret)
        });
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

      return version.payload.data.toString();
    } catch (error) {
      logger.error(`Error fetching secret ${secretName}:`, {
        error: error.message,
        code: error.code
      });
      throw error;
    }
  }
}

module.exports = new SecretManager();