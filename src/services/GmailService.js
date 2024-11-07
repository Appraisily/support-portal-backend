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
      const { models } = await getModels();
      this.models = models;

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

      const topicName = `projects/${projectId}/topics/gmail-notifications`;
      
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

  async handleWebhook(webhookData) {
    try {
      logger.info('Processing Gmail webhook', {
        hasData: !!webhookData?.message?.data
      });

      const decodedData = Buffer.from(webhookData.message.data, 'base64').toString();
      const notification = JSON.parse(decodedData);

      if (!notification?.historyId || !notification?.emailAddress) {
        throw new Error('Invalid notification format');
      }

      const result = await this.processNewEmails(notification);
      
      logger.info('Webhook processing completed', {
        historyId: notification.historyId,
        processed: result.processed,
        tickets: result.tickets
      });

      return result;
    } catch (error) {
      logger.error('Error processing webhook', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async processNewEmails(notification) {
    try {
      const history = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: notification.historyId,
        historyTypes: ['messageAdded']
      });

      if (!history.data.history?.length) {
        return { processed: 0, tickets: 0 };
      }

      let processed = 0;
      let tickets = 0;

      for (const item of history.data.history) {
        if (item.messagesAdded) {
          for (const message of item.messagesAdded) {
            const emailData = await this.getEmailData(message.message.id);
            const ticket = await this.createOrUpdateTicket(emailData);
            
            if (ticket) {
              tickets++;
            }
            processed++;
          }
        }
      }

      return { processed, tickets };
    } catch (error) {
      logger.error('Error processing new emails', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getEmailData(messageId) {
    try {
      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const headers = message.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const threadId = message.data.threadId;

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
        messageId,
        threadId,
        subject,
        from,
        content
      };
    } catch (error) {
      logger.error('Error getting email data', {
        error: error.message,
        messageId
      });
      throw error;
    }
  }

  async createOrUpdateTicket(emailData) {
    try {
      // Check for existing ticket with this thread ID
      const existingTicket = await this.models.Ticket.findOne({
        where: { gmailThreadId: emailData.threadId }
      });

      if (existingTicket) {
        // Add new message to existing ticket
        await this.models.Message.create({
          ticketId: existingTicket.id,
          content: emailData.content,
          direction: 'inbound'
        });

        await existingTicket.update({
          lastMessageAt: new Date()
        });

        return existingTicket;
      }

      // Create new customer if needed
      const [customer] = await this.models.Customer.findOrCreate({
        where: { email: emailData.from },
        defaults: {
          name: emailData.from.split('@')[0],
          email: emailData.from
        }
      });

      // Create new ticket
      const ticket = await this.models.Ticket.create({
        subject: emailData.subject,
        status: 'open',
        priority: 'medium',
        category: 'email',
        customerId: customer.id,
        gmailThreadId: emailData.threadId,
        gmailMessageId: emailData.messageId
      });

      // Create first message
      await this.models.Message.create({
        ticketId: ticket.id,
        content: emailData.content,
        direction: 'inbound',
        customerId: customer.id
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating/updating ticket', {
        error: error.message,
        threadId: emailData.threadId
      });
      throw error;
    }
  }
}

module.exports = new GmailService();