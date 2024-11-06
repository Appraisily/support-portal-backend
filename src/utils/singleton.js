// Nuevo archivo para manejar el estado global
const logger = require('./logger');

class AppState {
  constructor() {
    this.initialized = false;
    this.initPromise = null;
    this.models = null;
  }

  async initialize() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        logger.info('Starting application initialization');

        // 1. Cargar secretos si es necesario
        if (process.env.NODE_ENV === 'production' && !secretManager.initialized) {
          logger.info('Loading secrets in AppState...');
          await secretManager.loadSecrets();
        }

        // 2. Cargar modelos
        logger.info('Loading database models...');
        const { models } = await require('../models');
        this.models = models;

        this.initialized = true;
        logger.info('Application initialization complete');
      } catch (error) {
        this.initPromise = null;
        logger.error('Application initialization failed:', error);
        throw error;
      }
    })();

    return this.initPromise;
  }

  async getModels() {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.models;
  }
}

// Exportar una única instancia
module.exports = new AppState(); 