const OpenAIService = require('../services/OpenAIService');
const TicketService = require('../services/TicketService');
const SheetsService = require('../services/SheetsService');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

exports.generateTicketReply = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    logger.info('Starting ticket reply generation', { ticketId });

    // Get ticket with messages and customer info
    const ticket = await TicketService.getTicketById(ticketId);
    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    // Get customer information from sheets
    let customerInfo = null;
    if (ticket.customer?.email) {
      try {
        customerInfo = await SheetsService.getCustomerInfo(ticket.customer.email);
        logger.info('Retrieved customer info:', {
          ticketId,
          customerEmail: ticket.customer.email,
          customerInfo
        });
      } catch (error) {
        logger.warn('Could not fetch customer info from sheets', {
          error: error.message,
          customerEmail: ticket.customer.email
        });
        // Continue without customer info
      }
    }

    // Get messages in chronological order
    const messages = ticket.messages.sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );

    logger.info('Preparing to generate reply', {
      ticketId,
      messageCount: messages.length,
      hasCustomerInfo: !!customerInfo
    });

    // Generate reply using OpenAI with full context
    const result = await OpenAIService.generateTicketReply(ticket, messages, customerInfo);

    logger.info('Successfully generated ticket reply', {
      ticketId,
      generatedReply: result.reply
    });

    res.json({
      success: true,
      ticketId,
      generatedReply: result.reply
    });

  } catch (error) {
    logger.error('Error generating ticket reply', {
      ticketId: req.params.ticketId,
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};