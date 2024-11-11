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
      logger.info('Initializing Gmail service...');
      
      const SCOPES = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify'
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

      const messagesResponse = await this.gmail.users.messages.list({
        userId: 'me',
        labelIds: ['INBOX', 'UNREAD'],
        maxResults: 10
      });

      if (!messagesResponse.data.messages || messagesResponse.data.messages.length === 0) {
        logger.info('No new messages found');
        return { processed: 0, messages: [], tickets: [] };
      }

      logger.info('Found messages:', {
        count: messagesResponse.data.messages.length,
        messageIds: messagesResponse.data.messages.map(m => m.id)
      });

      const messages = [];
      const tickets = [];

      for (const messageData of messagesResponse.data.messages) {
        try {
          logger.info('Processing message:', { 
            messageId: messageData.id,
            threadId: messageData.threadId
          });
          
          const emailData = await this.getEmailData(messageData.id);
          if (emailData) {
            messages.push(emailData);
            
            const existingTicket = await this.findExistingTicket(messageData.threadId);
            if (!existingTicket) {
              const ticket = await this.createOrUpdateTicket(emailData);
              if (ticket) {
                tickets.push(ticket);
                
                await this.gmail.users.messages.modify({
                  userId: 'me',
                  id: messageData.id,
                  requestBody: {
                    removeLabelIds: ['UNREAD']
                  }
                });
              }
            }
          }
        } catch (error) {
          logger.error('Error processing message:', {
            messageId: messageData.id,
            error: error.message,
            stack: error.stack
          });
        }
      }

      return {
        processed: messages.length,
        messages,
        tickets
      };
    } catch (error) {
      logger.error('Error processing webhook:', error);
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

      if (!message.data.payload || !message.data.payload.headers) {
        logger.error('Invalid message format:', { messageId });
        return null;
      }

      const headers = message.data.payload.headers;
      const content = this.extractContent(message.data.payload);

      return {
        messageId: message.data.id,
        threadId: message.data.threadId,
        subject: this.getHeader(headers, 'Subject') || 'No Subject',
        from: this.getHeader(headers, 'From'),
        to: this.getHeader(headers, 'To'),
        inReplyTo: this.getHeader(headers, 'In-Reply-To'),
        references: this.getHeader(headers, 'References'),
        content: content
      };
    } catch (error) {
      logger.error('Error getting email data:', {
        messageId,
        error: error.message
      });
      return null;
    }
  }

  extractContent(payload) {
    if (!payload) return '';

    if (payload.body && payload.body.data) {
      return Buffer.from(payload.body.data, 'base64').toString();
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          return Buffer.from(part.body.data, 'base64').toString();
        }
      }
      
      // Fallback to first part with content if no text/plain
      for (const part of payload.parts) {
        if (part.body && part.body.data) {
          return Buffer.from(part.body.data, 'base64').toString();
        }
      }
    }

    return '';
  }

  async createOrUpdateTicket(emailData) {
    try {
      if (!emailData || !emailData.from || !emailData.subject) {
        logger.error('Invalid email data for ticket creation:', emailData);
        return null;
      }

      const models = await getModels();
      const { Customer, Ticket, Message } = models;

      const emailMatch = emailData.from.match(/<(.+)>/) || [null, emailData.from];
      const email = emailMatch[1].toLowerCase();
      const name = emailData.from.split('<')[0].trim() || email.split('@')[0];

      logger.info('Creating/updating ticket for:', { email, name });

      const [customer] = await Customer.findOrCreate({
        where: { email },
        defaults: { name, email }
      });

      let ticket = await Ticket.findOne({
        where: { gmailThreadId: emailData.threadId }
      });

      if (ticket) {
        logger.info('Updating existing ticket:', { ticketId: ticket.id });
        await ticket.update({
          status: 'open',
          lastMessageAt: new Date()
        });
      } else {
        logger.info('Creating new ticket');
        ticket = await Ticket.create({
          subject: emailData.subject.substring(0, 255),
          status: 'open',
          priority: 'medium',
          category: 'email',
          customerId: customer.id,
          gmailThreadId: emailData.threadId,
          gmailMessageId: emailData.messageId,
          lastMessageAt: new Date()
        });
      }

      await Message.create({
        ticketId: ticket.id,
        content: emailData.content || '',
        direction: 'inbound',
        customerId: customer.id
      });

      logger.info('Ticket processed successfully:', {
        ticketId: ticket.id,
        customerId: customer.id
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating/updating ticket:', {
        error: error.message,
        stack: error.stack,
        emailData: {
          subject: emailData?.subject,
          threadId: emailData?.threadId
        }
      });
      return null;
    }
  }

  async findExistingTicket(threadId) {
    try {
      const models = await getModels();
      return await models.Ticket.findOne({
        where: { gmailThreadId: threadId }
      });
    } catch (error) {
      logger.error('Error finding ticket:', {
        threadId,
        error: error.message
      });
      return null;
    }
  }

  getHeader(headers, name) {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
  }

  async setupWatch() {
    try {
      logger.info('Setting up Gmail watch...');

      try {
        await this.gmail.users.stop({
          userId: 'me'
        });
        logger.info('Stopped existing Gmail watch');
      } catch (error) {
        logger.warn('Error stopping existing watch:', error.message);
      }

      const response = await this.gmail.users.watch({
        userId: 'me',
        requestBody: {
          labelIds: ['INBOX', 'UNREAD'],
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