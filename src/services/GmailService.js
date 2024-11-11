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
        scope: [
          'https://mail.google.com/',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.metadata'
        ].join(' ')
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
        historyId: decodedData.historyId,
        rawData: webhookData.message.data
      });

      logger.debug('Fetching messages...', {
        userId: 'me',
        labelIds: ['INBOX', 'UNREAD']
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
            logger.debug('Email data retrieved:', {
              messageId: messageData.id,
              subject: emailData.subject,
              from: emailData.from,
              hasContent: !!emailData.content
            });

            messages.push(emailData);
            
            const existingTicket = await this.findExistingTicket(emailData.threadId);
            if (!existingTicket) {
              logger.debug('Creating new ticket for thread:', {
                threadId: emailData.threadId,
                subject: emailData.subject
              });

              const ticket = await this.createOrUpdateTicket(emailData);
              if (ticket) {
                tickets.push(ticket);
                logger.info('Created new ticket:', { 
                  ticketId: ticket.id,
                  messageId: messageData.id,
                  subject: ticket.subject,
                  status: ticket.status
                });

                await this.gmail.users.messages.modify({
                  userId: 'me',
                  id: messageData.id,
                  requestBody: {
                    removeLabelIds: ['UNREAD']
                  }
                });
              } else {
                logger.warn('Failed to create ticket:', {
                  messageId: messageData.id,
                  threadId: emailData.threadId
                });
              }
            } else {
              logger.info('Ticket already exists:', {
                ticketId: existingTicket.id,
                messageId: messageData.id,
                status: existingTicket.status
              });
            }
          } else {
            logger.warn('Failed to get email data:', {
              messageId: messageData.id,
              threadId: messageData.threadId
            });
          }
        } catch (error) {
          logger.error('Error processing individual message:', {
            messageId: messageData.id,
            error: error.message,
            stack: error.stack
          });
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
        stack: error.stack,
        webhookData: JSON.stringify(webhookData)
      });
      throw error;
    }
  }

  async findExistingTicket(threadId) {
    try {
      const models = await getModels();
      const ticket = await models.Ticket.findOne({
        where: { gmailThreadId: threadId }
      });

      logger.debug('Searching for existing ticket:', {
        threadId,
        found: !!ticket,
        ticketId: ticket?.id
      });

      return ticket;
    } catch (error) {
      logger.error('Error finding existing ticket:', {
        threadId,
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  async getEmailData(messageId) {
    try {
      logger.debug('Fetching email data:', { messageId });

      const message = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date', 'Message-ID', 'References', 'In-Reply-To']
      });

      // Get the full message content in a separate call
      const fullMessage = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'raw'
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
        content: this.decodeRawContent(fullMessage.data.raw)
      };

      logger.info('Email data extracted:', {
        messageId: emailData.messageId,
        subject: emailData.subject,
        from: emailData.from,
        contentLength: emailData.content?.length || 0
      });

      return emailData;
    } catch (error) {
      logger.error('Error getting email data:', {
        messageId,
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  decodeRawContent(raw) {
    try {
      const buff = Buffer.from(raw, 'base64');
      const text = buff.toString('utf-8');
      
      // Extract body content between boundaries if present
      const bodyMatch = text.match(/Content-Type: text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)(?=\r?\n--)/i);
      if (bodyMatch && bodyMatch[1]) {
        return bodyMatch[1].trim();
      }
      
      // Fallback: return everything after the first empty line
      const parts = text.split(/\r?\n\r?\n/);
      return parts.length > 1 ? parts.slice(1).join('\n\n').trim() : text;
    } catch (error) {
      logger.error('Error decoding raw content:', error);
      return '';
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
        threadId: emailData.threadId,
        messageId: emailData.messageId
      });

      logger.debug('Creating/finding customer:', { email, name });
      const [customer] = await Customer.findOrCreate({
        where: { email },
        defaults: { name, email }
      });

      logger.info('Customer found/created:', {
        customerId: customer.id,
        email: customer.email,
        name: customer.name,
        isNew: customer.isNewRecord
      });

      let ticket = await Ticket.findOne({
        where: {
          gmailThreadId: emailData.threadId
        }
      });

      if (ticket) {
        logger.info('Updating existing ticket:', {
          ticketId: ticket.id,
          threadId: emailData.threadId,
          oldStatus: ticket.status
        });

        await ticket.update({
          status: 'open',
          lastMessageAt: new Date()
        });
      } else {
        logger.info('Creating new ticket from email:', {
          threadId: emailData.threadId,
          customerId: customer.id,
          subject: emailData.subject
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

        logger.debug('New ticket created:', {
          ticketId: ticket.id,
          status: ticket.status,
          threadId: ticket.gmailThreadId
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
        ticketId: ticket.id,
        direction: message.direction,
        contentLength: message.content.length
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating/updating ticket:', {
        error: error.message,
        stack: error.stack,
        threadId: emailData.threadId,
        subject: emailData.subject
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