const { google } = require('googleapis');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const { getModels } = require('../models');

class GmailService {
  constructor() {
    this.userEmail = 'info@appraisily.com';
    this.oauth2Client = null;
    this.gmail = null;
    this.initialized = false;
    this.initPromise = null;
    this.lastHistoryId = null;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    try {
      this.initPromise = this._initialize();
      await this.initPromise;
      this.initialized = true;
    } catch (error) {
      this.initPromise = null;
      logger.error('Gmail service initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async _initialize() {
    try {
      const SCOPES = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send'
      ];

      this.oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
      );

      this.oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
        scope: SCOPES.join(' ')
      });

      this.gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      logger.info('Gmail service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Gmail service:', error);
      throw new ApiError(503, 'Gmail service initialization failed');
    }
  }

  async sendEmail(to, subject, content, threadId = null) {
    await this.ensureInitialized();

    try {
      logger.info('Sending email', {
        to,
        subject,
        threadId: threadId || 'new thread'
      });

      const message = [
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
        'Content-Transfer-Encoding: 7bit',
        `To: ${to}`,
        `From: ${this.userEmail}`,
        `Subject: ${subject}`,
        '',
        content
      ].join('\n');

      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const params = {
        userId: 'me',
        resource: {
          raw: encodedMessage,
          ...(threadId && { threadId })
        }
      };

      const response = await this.gmail.users.messages.send(params);

      logger.info('Email sent successfully', {
        messageId: response.data.id,
        threadId: response.data.threadId
      });

      return {
        success: true,
        messageId: response.data.id,
        threadId: response.data.threadId
      };

    } catch (error) {
      logger.error('Error sending email:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  // ... rest of the existing methods ...
}

module.exports = new GmailService();