const { google } = require('googleapis');
const logger = require('../utils/logger');
const { getModels } = require('../config/database');

class GmailService {
  constructor() {
    this.userEmail = process.env.GMAIL_USER_EMAIL || 'info@appraisily.com';
    this.oauth2Client = null;
    this.gmail = null;
    this.initialized = false;
    this.initPromise = null;
    this.models = null;
    this.lastHistoryId = null;

    logger.info('Creating Gmail service instance', {
      userEmail: this.userEmail,
      environment: process.env.NODE_ENV
    });
  }

  async ensureInitialized() {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this._initialize();
    }

    try {
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
      logger.info('Initializing Gmail service...');
      
      // Initialize OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
      );

      this.oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
      });

      // Initialize Gmail API
      this.gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      // Initialize models
      this.models = await getModels();

      // Setup Gmail watch
      await this.setupWatch();

      logger.info('Gmail service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Gmail service:', error);
      throw error;
    }
  }

  async setupWatch() {
    try {
      logger.info('Setting up Gmail watch...');

      // Stop any existing watch
      try {
        await this.gmail.users.stop({
          userId: this.userEmail
        });
        logger.info('Stopped existing Gmail watch');
      } catch (error) {
        // Ignore errors when stopping existing watch
        logger.warn('Error stopping existing watch:', error.message);
      }

      // Start new watch
      const response = await this.gmail.users.watch({
        userId: this.userEmail,
        requestBody: {
          labelIds: ['INBOX'],
          topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`,
          labelFilterAction: 'include'
        }
      });

      if (response.data.historyId) {
        this.lastHistoryId = response.data.historyId;
        logger.info('Gmail watch setup successful:', {
          historyId: this.lastHistoryId,
          expiration: response.data.expiration
        });
      }

      return response.data;
    } catch (error) {
      logger.error('Failed to setup Gmail watch:', error);
      throw error;
    }
  }

  async processNewEmails(notification) {
    try {
      await this.ensureInitialized();

      if (!notification?.historyId) {
        throw new Error('Invalid notification: missing historyId');
      }

      const response = await this.gmail.users.history.list({
        userId: this.userEmail,
        startHistoryId: notification.historyId,
        historyTypes: ['messageAdded']
      });

      const messages = response.data.history || [];
      logger.info('Processing new messages:', {
        count: messages.length,
        historyId: notification.historyId
      });

      for (const history of messages) {
        for (const message of history.messages || []) {
          await this.processMessage(message.id);
        }
      }

      return {
        processed: messages.length,
        historyId: response.data.historyId
      };
    } catch (error) {
      logger.error('Error processing new emails:', error);
      throw error;
    }
  }

  async processMessage(messageId) {
    try {
      const message = await this.gmail.users.messages.get({
        userId: this.userEmail,
        id: messageId
      });

      const emailData = this.extractEmailData(message.data);
      await this.createOrUpdateTicket(emailData);

      logger.info('Message processed successfully:', {
        messageId,
        subject: emailData.subject
      });
    } catch (error) {
      logger.error('Error processing message:', {
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  extractEmailData(message) {
    const headers = message.payload.headers;
    return {
      messageId: message.id,
      threadId: message.threadId,
      subject: headers.find(h => h.name === 'Subject')?.value || '',
      from: headers.find(h => h.name === 'From')?.value || '',
      content: this.extractContent(message.payload)
    };
  }

  extractContent(payload) {
    if (payload.body.data) {
      return Buffer.from(payload.body.data, 'base64').toString();
    }

    if (payload.parts) {
      const textPart = payload.parts.find(part => 
        part.mimeType === 'text/plain' || part.mimeType === 'text/html'
      );
      if (textPart?.body?.data) {
        return Buffer.from(textPart.body.data, 'base64').toString();
      }
    }

    return '';
  }

  async createOrUpdateTicket(emailData) {
    const { Customer, Ticket, Message } = this.models;

    // Extract email address from "From" field
    const emailMatch = emailData.from.match(/<(.+)>/) || [null, emailData.from];
    const email = emailMatch[1].toLowerCase();
    const name = emailData.from.split('<')[0].trim();

    // Find or create customer
    const [customer] = await Customer.findOrCreate({
      where: { email },
      defaults: { name, email }
    });

    // Find existing ticket by thread ID
    const existingTicket = await Ticket.findOne({
      where: { gmailThreadId: emailData.threadId }
    });

    if (existingTicket) {
      // Add message to existing ticket
      await Message.create({
        ticketId: existingTicket.id,
        content: emailData.content,
        author: customer.email,
        type: 'email'
      });

      await existingTicket.update({
        lastMessageAt: new Date()
      });

      return existingTicket;
    } else {
      // Create new ticket
      const ticket = await Ticket.create({
        subject: emailData.subject,
        status: 'open',
        priority: 'medium',
        category: 'email',
        customerId: customer.id,
        gmailThreadId: emailData.threadId,
        gmailMessageId: emailData.messageId,
        lastMessageAt: new Date()
      });

      // Add first message
      await Message.create({
        ticketId: ticket.id,
        content: emailData.content,
        author: customer.email,
        type: 'email'
      });

      return ticket;
    }
  }
}

module.exports = new GmailService();