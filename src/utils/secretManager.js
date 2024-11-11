const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const logger = require('./logger');

class SecretManager {
  constructor() {
    this.client = new SecretManagerServiceClient();
    this.secrets = new Map();
    this.initialized = false;
    this.initPromise = null;
    this.requiredSecrets = [
      'DB_USER',
      'DB_PASSWORD',
      'DB_NAME',
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
    await this.ensureInitialized();
    return this.secrets.get(name) || process.env[name];
  }

  async loadSecrets() {
    if (this.initialized) return true;
    
    try {
      logger.info('Starting secrets loading process');

      // Load secrets in parallel
      const results = await Promise.all(
        this.requiredSecrets.map(async (secretName) => {
          try {
            // First check environment variables
            if (process.env[secretName]) {
              logger.info(`Using ${secretName} from environment variables`);
              this.secrets.set(secretName, process.env[secretName]);
              return { secretName, success: true, source: 'env' };
            }

            // Then try Secret Manager
            const [version] = await this.client.accessSecretVersion({
              name: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/secrets/${secretName}/versions/latest`,
            });

            const value = version.payload.data.toString();
            this.secrets.set(secretName, value);
            process.env[secretName] = value; // Set environment variable
            
            logger.info(`Loaded ${secretName} from Secret Manager`);
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

      const succeeded = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      logger.info('Secrets loading completed', {
        total: results.length,
        succeeded: succeeded.length,
        failed: failed.length
      });

      // Verify all required secrets are loaded
      const missingSecrets = this.requiredSecrets.filter(
        secret => !this.secrets.has(secret) && !process.env[secret]
      );

      if (missingSecrets.length > 0) {
        logger.error('Missing required secrets:', { missingSecrets });
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