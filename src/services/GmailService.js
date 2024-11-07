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
      const projectId = await secretManager.getSecret('GOOGLE_CLOUD_PROJECT_ID');

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

      // Set up watch
      await this.setupWatch(projectId);

      logger.info('Gmail service initialized successfully');
    } catch (error) {
      logger.error('Gmail service initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async handleWebhook(data) {
    try {
      await this.ensureInitialized();

      const decodedData = Buffer.from(data.message.data, 'base64').toString();
      const notification = JSON.parse(decodedData);

      logger.info('Processing Gmail notification', {
        historyId: notification.historyId,
        emailAddress: notification.emailAddress
      });

      if (notification.emailAddress !== this.userEmail) {
        logger.warn('Ignoring notification for different email address', {
          received: notification.emailAddress,
          expected: this.userEmail
        });
        return { processed: 0, tickets: 0 };
      }

      return await this.processNewEmails(notification);
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
            
            if (ticket) {
              tickets++;
              logger.info('Ticket created/updated from email', {
                ticketId: ticket.id,
                threadId: emailData.threadId,
                isNew: !ticket.existingTicket
              });
            }
            
            processed++;
          }
        }
      }

      await this.updateLastHistoryId(historyResponse.data.historyId);

      return { processed, tickets };
    } catch (error) {
      logger.error('Error processing emails', {
        error: error.message,
        stack: error.stack
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
          type: 'email',
          direction: 'inbound',
          metadata: {
            gmailMessageId: emailData.messageId,
            gmailThreadId: emailData.threadId
          }
        });

        // Update ticket
        await existingTicket.update({
          lastMessageAt: new Date(),
          status: 'open' // Reopen ticket if it was closed
        });

        return { ...existingTicket.toJSON(), existingTicket: true };
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
        category: 'email',
        customerId: customer.id,
        status: 'open',
        priority: 'medium',
        gmailThreadId: emailData.threadId,
        gmailMessageId: emailData.messageId,
        lastMessageAt: new Date()
      });

      // Add initial message
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

      return { ...ticket.toJSON(), existingTicket: false };
    } catch (error) {
      logger.error('Error creating/updating ticket', {
        error: error.message,
        threadId: emailData.threadId
      });
      throw error;
    }
  }

  async fetchEmailData(messageId) {
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
  }

  async setupWatch(projectId) {
    try {
      const topicName = `projects/${projectId}/topics/gmail-notifications`;
      
      // Stop existing watch if any
      try {
        await this.gmail.users.stop({ userId: 'me' });
      } catch (error) {
        // Ignore errors when stopping
      }

      const response = await this.gmail.users.watch({
        userId: 'me',
        requestBody: {
          labelIds: ['INBOX'],
          topicName: topicName
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

  async updateLastHistoryId(historyId) {
    await this.models.Setting.create({
      key: 'gmail_last_history_id',
      value: historyId.toString()
    });
    this.lastHistoryId = historyId;
  }
}

// Export singleton instance
module.exports = new GmailService();