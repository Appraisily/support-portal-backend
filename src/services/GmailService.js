const { google } = require('googleapis');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const { getModels } = require('../models');

class GmailService {
  constructor() {
    this.userEmail = 'info@appraisily.com'; // Set default email
    this.oauth2Client = null;
    this.gmail = null;
    this.initialized = false;
    this.initPromise = null;
    this.lastHistoryId = null;
  }

  // Rest of the GmailService class implementation remains the same
  // ...
}

module.exports = new GmailService();