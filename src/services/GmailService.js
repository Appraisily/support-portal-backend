const { google } = require('googleapis');
const logger = require('../utils/logger');
const { getModels } = require('../config/database');
const ApiError = require('../utils/apiError');

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
      
      // Initialize OAuth2 client with required scopes
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
      );

      this.oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
        scope: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.metadata'
        ].join(' ')
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
      throw new ApiError(503, 'Gmail service initialization failed');
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
      throw new ApiError(503, 'Failed to setup Gmail watch');
    }
  }

  async processWebhook(notification) {
    try {
      await this.ensureInitialized();

      const decodedData = Buffer.from(notification.message.data, 'base64').toString();
      const data = JSON.parse(decodedData);

      if (!data?.historyId) {
        throw new ApiError(400, 'Invalid notification: missing historyId');
      }

      logger.info('Processing Gmail webhook', {
        historyId: data.historyId,
        emailAddress: data.emailAddress
      });

      const response = await this.gmail.users.history.list({
        userId: this.userEmail,
        startHistoryId: data.historyId,
        historyTypes: ['messageAdded'],
        labelId: 'INBOX'
      });

      const messages = response.data.history || [];
      logger.info('Processing new messages:', {
        count: messages.length,
        historyId: data.historyId
      });

      const processedMessages = [];
      for (const history of messages) {
        for (const message of history.messagesAdded || []) {
          const processedMessage = await this.processMessage(message.message.id);
          if (processedMessage) {
            processedMessages.push(processedMessage);
          }
        }
      }

      return {
        success: true,
        processed: processedMessages.length,
        messages: processedMessages
      };
    } catch (error) {
      logger.error('Error processing webhook:', error);
      throw error;
    }
  }

  async processMessage(messageId) {
    try {
      const message = await this.gmail.users.messages.get({
        userId: this.userEmail,
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date', 'Message-ID', 'References']
      });

      const emailData = this.extractEmailData(message.data);
      const ticket = await this.createOrUpdateTicket(emailData);

      logger.info('Message processed successfully:', {
        messageId,
        ticketId: ticket.id,
        subject: emailData.subject
      });

      return ticket;
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
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

    return {
      messageId: message.id,
      threadId: message.threadId,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      date: getHeader('Date'),
      references: getHeader('References'),
      inReplyTo: getHeader('In-Reply-To')
    };
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

    // Find existing ticket by thread ID or create new one
    const [ticket, created] = await Ticket.findOrCreate({
      where: { gmailThreadId: emailData.threadId },
      defaults: {
        subject: emailData.subject || 'No Subject',
        status: 'open',
        priority: 'medium',
        category: 'email',
        customerId: customer.id,
        gmailMessageId: emailData.messageId,
        lastMessageAt: new Date()
      }
    });

    if (!created) {
      await ticket.update({
        lastMessageAt: new Date()
      });
    }

    // Create message
    await Message.create({
      ticketId: ticket.id,
      content: emailData.subject, // We'll update this with full content later
      direction: 'inbound',
      customerId: customer.id
    });

    return ticket;
  }

  async getWatchStatus() {
    try {
      const response = await this.gmail.users.getProfile({
        userId: this.userEmail
      });

      return {
        historyId: response.data.historyId,
        messagesTotal: response.data.messagesTotal,
        threadsTotal: response.data.threadsTotal
      };
    } catch (error) {
      logger.error('Error getting Gmail watch status:', error);
      throw new ApiError(503, 'Failed to get Gmail watch status');
    }
  }
}

module.exports = new GmailService();