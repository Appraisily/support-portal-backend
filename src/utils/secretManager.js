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
      // ¡IMPORTANTE! No eliminar ningún secreto sin revisar todas las dependencias
      // Estos secretos son utilizados por:
      // - DB_* -> Conexión a base de datos
      // - GMAIL_* -> Autenticación con Gmail API
      // - ADMIN_* -> Autenticación de administrador
      // - jwt-secret -> Generación de tokens de sesión (¡OJO! el nombre en Secret Manager es "jwt-secret" en minúsculas con guion!)
      const requiredSecrets = [
        // Secretos para base de datos
        'DB_USER',
        'DB_PASSWORD',
        'DB_NAME',
        'DB_HOST',
        'DB_PORT',
        'CLOUD_SQL_CONNECTION_NAME',
        
        // Secretos para Gmail API
        'GMAIL_CLIENT_ID',
        'GMAIL_CLIENT_SECRET',
        'GMAIL_REFRESH_TOKEN',
        
        // Secretos para autenticación de admin
        'ADMIN_EMAIL',    // Usado en authController.login
        'ADMIN_PASSWORD', // Usado en authController.login
        
        // Secreto para JWT
        {
          secretName: 'jwt-secret',  // ¡IMPORTANTE! Este es el nombre exacto en Secret Manager
          envVar: 'JWT_SECRET'       // Este es el nombre que usamos en el código
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
