const { google } = require('googleapis');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const { getModels } = require('../models');

class GmailService {
  constructor() {
    this.userEmail = process.env.GMAIL_USER_EMAIL || 'info@appraisily.com';
    this.oauth2Client = null;
    this.gmail = null;
    this.initialized = false;
    this.initPromise = null;
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

      // Setup Gmail watch
      await this.setupWatch();

      logger.info('Gmail service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Gmail service:', error);
      throw new ApiError(503, 'Gmail service initialization failed');
    }
  }

  async processWebhook(webhookData) {
    try {
      const decodedData = JSON.parse(
        Buffer.from(webhookData.message.data, 'base64').toString()
      );

      logger.info('Processing webhook data:', {
        emailAddress: decodedData.emailAddress,
        historyId: decodedData.historyId
      });

      const history = await this.gmail.users.history.list({
        userId: this.userEmail,
        startHistoryId: decodedData.historyId,
        labelIds: ['INBOX'],
        maxResults: 100
      });

      const messages = [];
      const tickets = [];

      if (history.data.history && history.data.history.length > 0) {
        for (const item of history.data.history) {
          if (item.messagesAdded) {
            for (const messageAdded of item.messagesAdded) {
              const message = messageAdded.message;
              logger.info('Processing new message:', {
                messageId: message.id,
                threadId: message.threadId
              });

              const emailData = await this.getEmailData(message.id);
              messages.push(emailData);

              const ticket = await this.createOrUpdateTicket(emailData);
              if (ticket) {
                tickets.push(ticket);
                logger.info('Ticket created/updated:', {
                  ticketId: ticket.id,
                  status: ticket.status,
                  messageId: message.id
                });
              }
            }
          }
        }
      }

      logger.info('Webhook processing completed:', {
        processedMessages: messages.length,
        createdTickets: tickets.length,
        historyId: decodedData.historyId
      });

      return {
        processed: messages.length,
        messages,
        tickets
      };
    } catch (error) {
      logger.error('Error processing webhook:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getEmailData(messageId) {
    try {
      const message = await this.gmail.users.messages.get({
        userId: this.userEmail,
        id: messageId,
        format: 'full'
      });

      const headers = message.data.payload.headers;
      const emailData = {
        messageId: message.data.id,
        threadId: message.data.threadId,
        subject: this.getHeader(headers, 'Subject') || 'No Subject',
        from: this.getHeader(headers, 'From'),
        to: this.getHeader(headers, 'To'),
        inReplyTo: this.getHeader(headers, 'In-Reply-To'),
        references: this.getHeader(headers, 'References'),
        content: this.extractContent(message.data.payload)
      };

      logger.info('Email data extracted:', {
        messageId: emailData.messageId,
        subject: emailData.subject,
        from: emailData.from
      });

      return emailData;
    } catch (error) {
      logger.error('Error getting email data:', {
        messageId,
        error: error.message
      });
      throw error;
    }
  }

  async createOrUpdateTicket(emailData) {
    try {
      const models = getModels();
      const { Customer, Ticket, Message } = models;

      // Extract email address and name
      const emailMatch = emailData.from.match(/<(.+)>/) || [null, emailData.from];
      const email = emailMatch[1].toLowerCase();
      const name = emailData.from.split('<')[0].trim();

      logger.info('Processing email for ticket:', {
        email,
        subject: emailData.subject,
        threadId: emailData.threadId
      });

      // Find or create customer
      const [customer] = await Customer.findOrCreate({
        where: { email },
        defaults: { name, email }
      });

      // Check for existing ticket
      let ticket = await Ticket.findOne({
        where: {
          gmailThreadId: emailData.threadId
        }
      });

      if (ticket) {
        logger.info('Updating existing ticket:', {
          ticketId: ticket.id,
          threadId: emailData.threadId
        });

        await ticket.update({
          status: 'open',
          lastMessageAt: new Date()
        });
      } else {
        logger.info('Creating new ticket from email:', {
          threadId: emailData.threadId,
          customerId: customer.id
        });

        ticket = await Ticket.create({
          subject: emailData.subject,
          status: 'open',
          priority: 'medium',
          category: 'email',
          customerId: customer.id,
          gmailThreadId: emailData.threadId,
          gmailMessageId: emailData.messageId,
          lastMessageAt: new Date()
        });
      }

      // Add message
      await Message.create({
        ticketId: ticket.id,
        content: emailData.content,
        direction: 'inbound',
        customerId: customer.id
      });

      logger.info('Ticket processed successfully:', {
        ticketId: ticket.id,
        messageId: emailData.messageId
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating/updating ticket:', {
        error: error.message,
        threadId: emailData.threadId
      });
      throw error;
    }
  }

  getHeader(headers, name) {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : null;
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
}

module.exports = new GmailService();