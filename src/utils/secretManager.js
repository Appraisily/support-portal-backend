const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const logger = require('./logger');

class SecretManager {
  constructor() {
    this.client = null;
    this.secrets = new Map();
    this.initialized = false;
    this.initPromise = null;
    this.requiredSecrets = [
      'DB_USER',
      'DB_PASSWORD',
      'DB_NAME',
      'jwt-secret',
      'OPENAI_API_KEY',
      'SALES_SPREADSHEET_ID',
      'PENDING_APPRAISALS_SPREADSHEET_ID',
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD'
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
    
    // Special case for JWT_SECRET since it's stored as jwt-secret
    if (name === 'JWT_SECRET') {
      return this.secrets.get('jwt-secret') || process.env['jwt-secret'];
    }
    
    return this.secrets.get(name) || process.env[name];
  }

  async loadSecrets() {
    if (this.initialized) return true;
    
    try {
      logger.info('Starting secrets loading process');

      // In development, use environment variables
      if (process.env.NODE_ENV !== 'production') {
        this.requiredSecrets.forEach(secretName => {
          if (process.env[secretName]) {
            this.secrets.set(secretName, process.env[secretName]);
          }
        });

        // For development, set some default values
        if (!this.secrets.has('ADMIN_EMAIL')) {
          this.secrets.set('ADMIN_EMAIL', 'admin@appraisily.com');
        }
        if (!this.secrets.has('ADMIN_PASSWORD')) {
          this.secrets.set('ADMIN_PASSWORD', 'admin123');
        }
        if (!this.secrets.has('jwt-secret')) {
          this.secrets.set('jwt-secret', 'dev-secret-key');
        }

        logger.info('Using development environment variables');
        return true;
      }

      // Production: Initialize Secret Manager client
      if (!this.client) {
        this.client = new SecretManagerServiceClient();
      }

      // Load secrets in parallel
      const results = await Promise.all(
        this.requiredSecrets.map(async (secretName) => {
          try {
            // First check environment variables
            if (process.env[secretName]) {
              this.secrets.set(secretName, process.env[secretName]);
              return { secretName, success: true, source: 'env' };
            }

            // Then try Secret Manager
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

      const succeeded = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      logger.info('Secrets loading completed', {
        total: results.length,
        succeeded: succeeded.length,
        failed: failed.length
      });

      // In development, we can continue with missing secrets
      if (process.env.NODE_ENV !== 'production') {
        return true;
      }

      // In production, verify all required secrets are loaded
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
      return process.env.NODE_ENV !== 'production';
    }
  }
}

module.exports = new SecretManager();