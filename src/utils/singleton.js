// Nuevo archivo para manejar el estado global
const logger = require('./logger');

class ApplicationState {
  constructor() {
    this.initialized = false;
    this.initializationPromise = null;
    this.models = null;
    this.gmailService = null;
    logger.info('Creating ApplicationState singleton');
  }

  async initialize() {
    if (this.initialized) {
      logger.info('Application already initialized');
      return;
    }

    // Evitar múltiples inicializaciones simultáneas
    if (this.initializationPromise) {
      logger.info('Initialization already in progress, waiting...');
      return this.initializationPromise;
    }

    logger.info('Starting application initialization');
    this.initializationPromise = this._initialize();
    
    try {
      await this.initializationPromise;
      this.initialized = true;
      logger.info('Application initialization completed');
    } catch (error) {
      logger.error('Application initialization failed:', error);
      this.initializationPromise = null;
      throw error;
    }
  }

  async _initialize() {
    const { loadSecrets } = require('./secretManager');
    const { getModels } = require('../config/database');
    const GmailService = require('../services/GmailService');

    // Cargar secretos
    await loadSecrets();

    // Inicializar modelos
    this.models = await getModels();

    // Inicializar Gmail
    this.gmailService = GmailService;
    await this.gmailService.setupGmail();
  }

  getModels() {
    if (!this.initialized) {
      throw new Error('Application not initialized');
    }
    return this.models;
  }

  getGmailService() {
    if (!this.initialized) {
      throw new Error('Application not initialized');
    }
    return this.gmailService;
  }
}

// Exportar una única instancia
module.exports = new ApplicationState(); 