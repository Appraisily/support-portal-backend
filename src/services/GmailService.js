const { google } = require('googleapis');
const logger = require('../utils/logger');

class GmailService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      'https://developers.google.com/oauthplayground'
    );

    if (process.env.NODE_ENV === 'production') {
      this.setupGmail();
    } else {
      this.mockMode = true;
      logger.info('Gmail service running in mock mode');
    }
  }

  async setupGmail() {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
      });

      this.gmail = google.gmail({
        version: 'v1',
        auth: this.oauth2Client
      });

      logger.info('Gmail service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Gmail service:', error);
      this.mockMode = true;
    }
  }

  async handleWebhook(data) {
    try {
      logger.info('Processing webhook data:', data);

      if (!data.emailAddress) {
        throw new Error('Email address is missing from webhook data');
      }

      // Get latest messages for this email
      const messages = await this.getLatestMessages(data.emailAddress, data.historyId);
      
      if (!messages || messages.length === 0) {
        logger.info('No new messages found');
        return {
          success: true,
          processedMessages: 0,
          createdTickets: 0,
          historyId: data.historyId
        };
      }

      let processedMessages = 0;
      let createdTickets = 0;

      for (const message of messages) {
        const emailData = await this.processMessage(message);
        if (emailData) {
          await this.createOrUpdateTicket(emailData);
          processedMessages++;
          createdTickets++;
        }
      }

      const result = {
        success: true,
        processedMessages,
        createdTickets,
        historyId: data.historyId
      };

      logger.info('Webhook processing completed:', result);
      return result;

    } catch (error) {
      logger.error('Gmail webhook processing error:', error);
      throw error;
    }
  }

  async getLatestMessages(emailAddress, historyId) {
    if (this.mockMode) {
      return [];
    }

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: `from:${emailAddress}`,
        maxResults: 10
      });

      return response.data.messages || [];
    } catch (error) {
      logger.error('Error getting messages:', error);
      return [];
    }
  }

  async processMessage(message) {
    if (this.mockMode) {
      return null;
    }

    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });

      const emailData = this.extractEmailData(response.data);
      return emailData;
    } catch (error) {
      logger.error('Error processing message:', error);
      return null;
    }
  }

  async createOrUpdateTicket(emailData) {
    const TicketService = require('./TicketService');
    
    try {
      // Check if thread already exists
      const existingTicket = await TicketService.findByGmailThreadId(emailData.threadId);

      if (existingTicket) {
        // Update existing ticket
        await TicketService.updateTicket(existingTicket.id, {
          status: 'pending',
          lastEmailUpdate: new Date()
        });

        // Add new message
        await TicketService.addMessage(existingTicket.id, {
          content: emailData.content,
          internal: false,
          from: emailData.from
        });

      } else {
        // Create new ticket
        await TicketService.createTicket({
          subject: emailData.subject,
          content: emailData.content,
          customer: {
            email: emailData.from,
            name: emailData.fromName
          },
          status: 'open',
          priority: 'medium',
          category: 'email',
          gmailThreadId: emailData.threadId
        });
      }

      return true;
    } catch (error) {
      logger.error('Error creating/updating ticket:', error);
      return false;
    }
  }

  extractEmailData(message) {
    const headers = message.payload.headers;
    const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';
    const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
    const threadId = message.threadId;

    // Parse from field to get name and email
    const fromMatch = from.match(/(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)/);
    const fromName = fromMatch ? fromMatch[1] || '' : '';
    const fromEmail = fromMatch ? fromMatch[2] : from;

    let content = '';
    if (message.payload.parts) {
      const textPart = message.payload.parts.find(
        part => part.mimeType === 'text/plain'
      );
      if (textPart && textPart.body.data) {
        content = Buffer.from(textPart.body.data, 'base64').toString();
      }
    } else if (message.payload.body.data) {
      content = Buffer.from(message.payload.body.data, 'base64').toString();
    }

    return {
      subject,
      from: fromEmail,
      fromName,
      content,
      threadId
    };
  }
}

module.exports = new GmailService();