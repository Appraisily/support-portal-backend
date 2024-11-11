const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const logger = require('./logger');

class SecretManager {
  constructor() {
    this.client = new SecretManagerServiceClient();
    this.secrets = new Map();
    this.initialized = false;
    this.initPromise = null;
    this.requiredSecrets = [
      'DB_PASSWORD',
      'JWT_SECRET',
      'OPENAI_API_KEY',
      'SALES_SPREADSHEET_ID',
      'PENDING_APPRAISALS_SPREADSHEET_ID',
      'COMPLETED_APPRAISALS_SPREADSHEET_ID'
    ];
  }

  async ensureInitialized() {
    if (this.initialized) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.loadSecrets();
    const result = await this.initPromise;
    this.initialized = result;
    return result;
  }

  async getSecret(name) {
    if (!this.initialized) {
      await this.ensureInitialized();
    }
    return this.secrets.get(name) || process.env[name];
  }

  async loadSecrets() {
    if (this.initialized) return true;
    
    try {
      logger.info('Starting secrets loading process');

      const results = await Promise.allSettled(
        this.requiredSecrets.map(async (secretName) => {
          try {
            // First check if it's already in environment variables
            if (process.env[secretName]) {
              logger.info(`Secret ${secretName} found in environment variables`);
              this.secrets.set(secretName, process.env[secretName]);
              return { secretName, success: true, source: 'env' };
            }

            // If not in env, try to fetch from Secret Manager
            const [version] = await this.client.accessSecretVersion({
              name: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/secrets/${secretName}/versions/latest`,
            });

            const value = version.payload.data.toString();
            this.secrets.set(secretName, value);
            process.env[secretName] = value;
            
            return { secretName, success: true, source: 'secret-manager' };
          } catch (error) {
            logger.error(`Failed to load secret ${secretName}:`, {
              error: error.message,
              code: error.code
            });
            return { secretName, success: false, error };
          }
        })
      );

      const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success);
      const failed = results.filter(r => r.status === 'rejected' || !r.value.success);

      logger.info('Secrets loading completed', {
        total: results.length,
        succeeded: succeeded.length,
        failed: failed.length
      });

      // Check if we have all required database secrets
      const hasRequiredSecrets = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'].every(
        secret => process.env[secret]
      );

      if (!hasRequiredSecrets) {
        logger.error('Missing required database secrets');
        return false;
      }

      logger.info('All required secrets loaded successfully');
      return true;

    } catch (error) {
      logger.error('Failed to load secrets:', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }
}

module.exports = new SecretManager();