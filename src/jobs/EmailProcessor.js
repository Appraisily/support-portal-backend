const GmailService = require('../services/GmailService');
const TicketService = require('../services/TicketService');
const logger = require('../utils/logger');

class EmailProcessor {
  async processWebhook(messageData) {
    try {
      logger.info('Processing incoming email webhook');
      
      const result = await GmailService.handleWebhook(messageData);
      
      if (result.ticketId) {
        // Update existing ticket
        await TicketService.updateTicket(result.ticketId, {
          lastEmailUpdate: new Date(),
          status: 'pending'
        });
      } else {
        // Create new ticket from email
        await TicketService.createTicket({
          subject: messageData.subject,
          customer: {
            email: messageData.from,
            name: messageData.fromName
          },
          status: 'open',
          priority: 'medium',
          category: 'email',
          gmailThreadId: messageData.threadId
        });
      }
      
      logger.info('Email processed successfully');
    } catch (error) {
      logger.error('Email processing error:', error);
      throw error;
    }
  }
}

module.exports = new EmailProcessor();