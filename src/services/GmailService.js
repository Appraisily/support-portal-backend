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
      
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
      );

      this.oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN,
        scope: 'https://mail.google.com/'
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

      const history = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: decodedData.historyId,
        historyTypes: ['messageAdded'],
        labelId: 'INBOX'
      });

      logger.info('Retrieved history:', {
        hasHistory: !!history.data.history,
        itemCount: history.data.history?.length || 0
      });

      const messages = [];
      const tickets = [];

      if (history.data.history) {
        for (const item of history.data.history) {
          if (item.messagesAdded) {
            for (const messageAdded of item.messagesAdded) {
              try {
                const message = messageAdded.message;
                logger.info('Processing message:', { messageId: message.id });
                
                const emailData = await this.getEmailData(message.id);
                if (emailData) {
                  messages.push(emailData);
                  
                  const existingTicket = await this.findExistingTicket(emailData.threadId);
                  if (!existingTicket) {
                    const ticket = await this.createOrUpdateTicket(emailData);
                    if (ticket) {
                      tickets.push(ticket);
                      logger.info('Created new ticket:', { 
                        ticketId: ticket.id,
                        messageId: message.id 
                      });
                    }
                  } else {
                    logger.info('Ticket already exists:', {
                      ticketId: existingTicket.id,
                      messageId: message.id
                    });
                  }
                }
              } catch (error) {
                logger.error('Error processing individual message:', {
                  messageId: messageAdded.message.id,
                  error: error.message
                });
              }
            }
          }
        }
      }

      logger.info('Webhook processing completed', {
        processed: messages.length,
        messages: messages.length,
        tickets: tickets.length,
        processingTime: Date.now() - new Date(webhookData.message.publishTime).getTime()
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

  async findExistingTicket(threadId) {
    try {
      const models = await getModels();
      return await models.Ticket.findOne({
        where: { gmailThreadId: threadId }
      });
    } catch (error) {
      logger.error('Error finding existing ticket:', {
        threadId,
        error: error.message
      });
      return null;
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
      return null;
    }
  }

  async createOrUpdateTicket(emailData) {
    try {
      const models = await getModels();
      const { Customer, Ticket, Message } = models;

      const emailMatch = emailData.from.match(/<(.+)>/) || [null, emailData.from];
      const email = emailMatch[1].toLowerCase();
      const name = emailData.from.split('<')[0].trim() || email.split('@')[0];

      logger.info('Processing email for ticket:', {
        email,
        subject: emailData.subject,
        threadId: emailData.threadId
      });

      const [customer] = await Customer.findOrCreate({
        where: { email },
        defaults: { name, email }
      });

      logger.info('Customer found/created:', {
        customerId: customer.id,
        email: customer.email
      });

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

      const message = await Message.create({
        ticketId: ticket.id,
        content: emailData.content,
        direction: 'inbound',
        customerId: customer.id
      });

      logger.info('Message created:', {
        messageId: message.id,
        ticketId: ticket.id
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating/updating ticket:', {
        error: error.message,
        threadId: emailData.threadId
      });
      return null;
    }
  }

  getHeader(headers, name) {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
  }

  extractContent(payload) {
    if (!payload) return '';

    if (payload.mimeType === 'text/plain' && payload.body.data) {
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
          labelIds: ['INBOX'],
          topicName: `projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/topics/gmail-notifications`
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

  async getWatchStatus() {
    try {
      const response = await this.gmail.users.getProfile({
        userId: 'me'
      });
      
      return {
        emailAddress: response.data.emailAddress,
        messagesTotal: response.data.messagesTotal,
        threadsTotal: response.data.threadsTotal,
        historyId: response.data.historyId
      };
    } catch (error) {
      logger.error('Error getting Gmail watch status:', error);
      throw error;
    }
  }
}

module.exports = new GmailService();