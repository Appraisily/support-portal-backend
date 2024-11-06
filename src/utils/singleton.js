const logger = require('./logger');
const { initializeDatabase } = require('../config/database');

class AppState {
  constructor() {
    this.initialized = false;
    this.models = null;
    this.initPromise = null;
  }

  async initialize() {
    if (this.initialized) {
      return this.models;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        logger.info('Initializing application state');
        this.models = await initializeDatabase();
        this.initialized = true;
        logger.info('Application state initialized successfully');
        return this.models;
      } catch (error) {
        logger.error('Failed to initialize application state', {
          error: error.message,
          stack: error.stack
        });
        this.initialized = false;
        this.models = null;
        throw error;
      } finally {
        this.initPromise = null;
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

module.exports = new AppState(); 