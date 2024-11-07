const { google } = require('googleapis');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { getModels } = require('../config/database');
const secretManager = require('../utils/secretManager');

class GmailService {
  constructor() {
    this.initialized = false;
    this.initPromise = null;
    this.models = null;
    this.gmail = null;
    this.oauth2Client = null;
    this.lastHistoryId = null;
    this.userEmail = 'info@appraisily.com';
    this.pubsubTopic = 'gmail-notifications';
  }

  async ensureInitialized() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize();
    await this.initPromise;
    this.initialized = true;
  }

  async _initialize() {
    try {
      logger.info('Initializing Gmail service...');

      // Get credentials
      const clientId = await secretManager.getSecret('GMAIL_CLIENT_ID');
      const clientSecret = await secretManager.getSecret('GMAIL_CLIENT_SECRET');
      const refreshToken = await secretManager.getSecret('GMAIL_REFRESH_TOKEN');

      if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Missing Gmail credentials');
      }

      // Initialize OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'https://developers.google.com/oauthplayground'
      );

      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      // Initialize Gmail API
      this.gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      // Initialize models
      this.models = await getModels();

      // Set up watch only in production
      if (process.env.NODE_ENV === 'production') {
        await this.setupWatch();
      }

      logger.info('Gmail service initialized successfully');
    } catch (error) {
      logger.error('Gmail service initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async setupWatch() {
    try {
      const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
      if (!projectId) {
        throw new Error('GOOGLE_CLOUD_PROJECT_ID not configured');
      }

      const topicName = `projects/${projectId}/topics/${this.pubsubTopic}`;
      
      logger.info('Setting up Gmail watch...', {
        projectId,
        topicName
      });

      // Stop existing watch if any
      try {
        await this.gmail.users.stop({ userId: 'me' });
        logger.info('Stopped existing Gmail watch');
      } catch (error) {
        // Ignore errors when stopping
        logger.warn('No existing watch to stop or error stopping watch:', error.message);
      }

      const response = await this.gmail.users.watch({
        userId: 'me',
        requestBody: {
          labelIds: ['INBOX'],
          topicName,
          labelFilterAction: 'include'
        }
      });

      logger.info('Gmail watch setup successful', {
        historyId: response.data.historyId,
        expiration: response.data.expiration
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to setup Gmail watch', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // ... rest of the class implementation remains the same ...
}