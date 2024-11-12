const { google } = require('googleapis');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const secretManager = require('../utils/secretManager');

class GmailService {
  constructor() {
    this.gmail = null;
    this.initialized = false;
    this.initPromise = null;
    this.lastHistoryId = null;
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  async ensureInitialized() {
    if (this.initialized) return true;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initialize();
    const result = await this.initPromise;
    this.initPromise = null;
    return result;
  }

  async _initialize() {
    try {
      // Get required secrets
      const [clientId, clientSecret, refreshToken] = await Promise.all([
        secretManager.getSecret('GMAIL_CLIENT_ID'),
        secretManager.getSecret('GMAIL_CLIENT_SECRET'),
        secretManager.getSecret('GMAIL_REFRESH_TOKEN')
      ]);

      // In development, we can proceed without Gmail credentials
      if (this.isDevelopment && (!clientId || !clientSecret || !refreshToken)) {
        logger.warn('Gmail credentials not configured, running in mock mode');
        this.initialized = true;
        return true;
      }

      if (!clientId || !clientSecret || !refreshToken) {
        logger.error('Missing Gmail credentials');
        throw new Error('Gmail credentials not configured');
      }

      // Create OAuth2 client
      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret
      );

      oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      // Initialize Gmail API
      this.gmail = google.gmail({
        version: 'v1',
        auth: oauth2Client
      });

      // Get current history ID
      const profile = await this.gmail.users.getProfile({
        userId: 'me'
      });
      this.lastHistoryId = profile.data.historyId;

      this.initialized = true;
      logger.info('Gmail service initialized successfully', {
        historyId: this.lastHistoryId
      });
      return true;

    } catch (error) {
      // In development, we can proceed even if initialization fails
      if (this.isDevelopment) {
        logger.warn('Gmail service initialization failed, running in mock mode', {
          error: error.message
        });
        this.initialized = true;
        return true;
      }

      logger.error('Gmail service initialization failed:', {
        error: error.message,
        stack: error.stack
      });
      this.initialized = false;
      throw error;
    }
  }

  async setupGmailWatch() {
    try {
      await this.ensureInitialized();

      // In development, return mock data
      if (this.isDevelopment || !this.gmail) {
        logger.info('Gmail watch setup skipped in development mode');
        return {
          historyId: '123456',
          expiration: Date.now() + (7 * 24 * 60 * 60 * 1000)
        };
      }

      const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
      if (!projectId) {
        throw new Error('Missing GOOGLE_CLOUD_PROJECT_ID');
      }

      const topicName = `projects/${projectId}/topics/gmail-notifications`;

      const watchResponse = await this.gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName,
          labelIds: ['INBOX'],
          labelFilterAction: 'include'
        }
      });

      this.lastHistoryId = watchResponse.data.historyId;

      logger.info('Gmail watch setup successfully', {
        historyId: this.lastHistoryId,
        expiration: watchResponse.data.expiration
      });

      return {
        historyId: this.lastHistoryId,
        expiration: watchResponse.data.expiration
      };

    } catch (error) {
      logger.error('Failed to setup Gmail watch:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async processWebhook(data) {
    try {
      await this.ensureInitialized();

      // In development or mock mode, return empty result
      if (this.isDevelopment || !this.gmail) {
        logger.info('Webhook processing skipped in development mode');
        return { processed: true, messages: [] };
      }

      if (!data?.message?.data) {
        throw new ApiError(400, 'Invalid webhook data');
      }

      const decodedData = JSON.parse(
        Buffer.from(data.message.data, 'base64').toString()
      );

      logger.info('Processing Gmail webhook:', {
        emailAddress: decodedData.emailAddress,
        historyId: decodedData.historyId
      });

      // Get history
      const history = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: decodedData.historyId
      });

      // Process messages
      const messages = [];
      if (history.data.history) {
        for (const item of history.data.history) {
          if (item.messagesAdded) {
            for (const message of item.messagesAdded) {
              messages.push(await this.getMessage(message.message.id));
            }
          }
        }
      }

      // Update last history ID
      this.lastHistoryId = decodedData.historyId;

      return {
        processed: true,
        messages
      };

    } catch (error) {
      logger.error('Error processing webhook:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getMessage(messageId) {
    try {
      await this.ensureInitialized();

      if (this.isDevelopment || !this.gmail) {
        return {
          id: messageId,
          threadId: 'mock-thread-id',
          labelIds: ['INBOX'],
          payload: {
            headers: [
              { name: 'From', value: 'test@example.com' },
              { name: 'Subject', value: 'Test Email' }
            ]
          }
        };
      }

      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      return response.data;
    } catch (error) {
      logger.error('Error getting message:', {
        error: error.message,
        messageId
      });
      throw error;
    }
  }

  async getWatchStatus() {
    try {
      await this.ensureInitialized();

      if (this.isDevelopment || !this.gmail) {
        return {
          email: 'info@appraisily.com',
          historyId: this.lastHistoryId || '123456',
          messagesTotal: 0
        };
      }

      const response = await this.gmail.users.getProfile({
        userId: 'me'
      });

      return {
        email: response.data.emailAddress,
        historyId: this.lastHistoryId || response.data.historyId,
        messagesTotal: response.data.messagesTotal
      };
    } catch (error) {
      logger.error('Error getting watch status:', {
        error: error.message
      });
      throw error;
    }
  }

  async sendEmail(to, subject, content, threadId = null) {
    try {
      await this.ensureInitialized();

      if (this.isDevelopment || !this.gmail) {
        logger.info('Email sending skipped in development mode', {
          to,
          subject,
          threadId
        });
        return;
      }

      const email = [
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `To: ${to}`,
        `Subject: ${subject}`,
        '',
        content
      ].join('\r\n');

      const encodedEmail = Buffer.from(email).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const params = {
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      };

      if (threadId) {
        params.requestBody.threadId = threadId;
      }

      await this.gmail.users.messages.send(params);

      logger.info('Email sent successfully', {
        to,
        subject,
        threadId
      });

    } catch (error) {
      logger.error('Error sending email:', {
        error: error.message,
        to,
        subject
      });
      throw error;
    }
  }
}

module.exports = new GmailService();