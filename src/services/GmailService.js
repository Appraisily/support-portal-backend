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

      // Ensure secrets are loaded
      await secretManager.ensureInitialized();
      
      // Get Gmail credentials from Secret Manager
      const clientId = await secretManager.getSecret('GMAIL_CLIENT_ID');
      const clientSecret = await secretManager.getSecret('GMAIL_CLIENT_SECRET');
      const refreshToken = await secretManager.getSecret('GMAIL_REFRESH_TOKEN');
      const projectId = await secretManager.getSecret('GOOGLE_CLOUD_PROJECT_ID');

      if (!clientId || !clientSecret || !refreshToken || !projectId) {
        throw new Error('Missing required Gmail credentials or project ID');
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

      // Test connection
      const profile = await this.gmail.users.getProfile({
        userId: 'me'
      });

      logger.info('Gmail connection successful', {
        email: profile.data.emailAddress,
        threadsTotal: profile.data.threadsTotal,
        historyId: profile.data.historyId
      });

      // Initialize models
      this.models = await getModels();

      // Store initial historyId
      if (profile.data.historyId) {
        this.lastHistoryId = profile.data.historyId;
        await this.models.Setting.create({
          key: 'gmail_last_history_id',
          value: profile.data.historyId.toString()
        });
      }

      // Set up Gmail watch
      await this.setupWatch(projectId);

      logger.info('Gmail service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Gmail service', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async setupWatch(projectId) {
    try {
      logger.info('Setting up Gmail watch...');

      // Stop any existing watch
      try {
        await this.gmail.users.stop({
          userId: 'me'
        });
        logger.info('Stopped existing Gmail watch');
      } catch (error) {
        // Ignore errors when stopping existing watch
        logger.warn('No existing watch to stop or error stopping watch:', error.message);
      }

      // Set up new watch
      const response = await this.gmail.users.watch({
        userId: 'me',
        requestBody: {
          labelIds: ['INBOX'],
          topicName: `projects/${projectId}/topics/gmail-notifications`,
          labelFilterAction: 'include'
        }
      });

      logger.info('Gmail watch setup successful', {
        historyId: response.data.historyId,
        expiration: response.data.expiration
      });

      // Store the historyId
      if (response.data.historyId) {
        await this.updateLastHistoryId(response.data.historyId);
      }

      // Schedule watch renewal before expiration
      if (response.data.expiration) {
        const expirationDate = new Date(parseInt(response.data.expiration));
        const renewalTime = expirationDate.getTime() - (24 * 60 * 60 * 1000); // 1 day before expiration
        const now = Date.now();
        
        if (renewalTime > now) {
          setTimeout(() => this.setupWatch(projectId), renewalTime - now);
          logger.info('Scheduled watch renewal', {
            renewalDate: new Date(renewalTime)
          });
        }
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to setup Gmail watch', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async handleWebhook(messageData) {
    try {
      await this.ensureInitialized();

      if (!messageData?.message?.data) {
        logger.warn('Invalid webhook data received');
        return { success: false, error: 'Invalid webhook data' };
      }

      const decodedData = Buffer.from(messageData.message.data, 'base64').toString();
      const notification = JSON.parse(decodedData);

      logger.info('Processing Gmail webhook', {
        historyId: notification.historyId,
        emailAddress: notification.emailAddress
      });

      const result = await this.processNewEmails(notification);
      
      return {
        success: true,
        processed: result.processed,
        tickets: result.tickets
      };
    } catch (error) {
      logger.error('Error handling webhook', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async processNewEmails(notification) {
    try {
      const historyResponse = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: notification.historyId,
        historyTypes: ['messageAdded']
      });

      if (!historyResponse.data.history) {
        return { processed: 0, tickets: 0 };
      }

      let processed = 0;
      let tickets = 0;

      for (const history of historyResponse.data.history) {
        if (history.messagesAdded) {
          for (const message of history.messagesAdded) {
            const emailData = await this.fetchEmailData(message.message.id);
            const ticket = await this.createOrUpdateTicket(emailData);
            if (ticket) tickets++;
            processed++;
          }
        }
      }

      await this.updateLastHistoryId(historyResponse.data.historyId);

      return { processed, tickets };
    } catch (error) {
      logger.error('Error processing new emails', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async fetchEmailData(messageId) {
    try {
      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const headers = message.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      
      let content = '';
      if (message.data.payload.parts) {
        const textPart = message.data.payload.parts.find(
          part => part.mimeType === 'text/plain'
        );
        if (textPart && textPart.body.data) {
          content = Buffer.from(textPart.body.data, 'base64').toString();
        }
      }

      return {
        messageId: message.data.id,
        threadId: message.data.threadId,
        subject,
        from,
        content
      };
    } catch (error) {
      logger.error('Error fetching email data', {
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  async createOrUpdateTicket(emailData) {
    try {
      const existingTicket = await this.models.Ticket.findOne({
        where: { gmailThreadId: emailData.threadId }
      });

      if (existingTicket) {
        await this.models.Message.create({
          ticketId: existingTicket.id,
          content: emailData.content,
          type: 'email',
          direction: 'inbound',
          metadata: {
            gmailMessageId: emailData.messageId,
            gmailThreadId: emailData.threadId
          }
        });

        await existingTicket.update({
          lastMessageAt: new Date()
        });

        return existingTicket;
      }

      const [customer] = await this.models.Customer.findOrCreate({
        where: { email: emailData.from },
        defaults: {
          name: emailData.from.split('@')[0],
          email: emailData.from
        }
      });

      const ticket = await this.models.Ticket.create({
        subject: emailData.subject,
        category: 'email',
        customerId: customer.id,
        status: 'open',
        priority: 'medium',
        gmailThreadId: emailData.threadId,
        gmailMessageId: emailData.messageId,
        lastMessageAt: new Date()
      });

      await this.models.Message.create({
        ticketId: ticket.id,
        content: emailData.content,
        type: 'email',
        direction: 'inbound',
        metadata: {
          gmailMessageId: emailData.messageId,
          gmailThreadId: emailData.threadId
        }
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating/updating ticket', {
        error: error.message,
        emailData
      });
      throw error;
    }
  }

  async updateLastHistoryId(historyId) {
    try {
      await this.models.Setting.create({
        key: 'gmail_last_history_id',
        value: historyId.toString()
      });
      this.lastHistoryId = historyId;
    } catch (error) {
      logger.error('Error updating history ID', {
        error: error.message,
        historyId
      });
      throw error;
    }
  }
}

module.exports = new GmailService();