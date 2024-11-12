const OpenAIService = require('../services/OpenAIService');
const TicketService = require('../services/TicketService');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

// Create instance of TicketService
const ticketService = new TicketService();

exports.generateTicketReply = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    logger.info('Starting ticket reply generation', { ticketId });

    await ticketService.ensureInitialized();

    // Get ticket with messages and customer info
    const ticketResponse = await ticketService.getTicketById(ticketId);
    if (!ticketResponse.success) {
      throw new ApiError(404, 'Ticket not found');
    }

    const ticket = ticketResponse.data;
    const messages = ticket.messages;

    logger.info('Preparing to generate reply', {
      ticketId,
      messageCount: messages.length,
      hasCustomerInfo: !!ticket.customerInfo
    });

    // Generate reply using OpenAI with full context
    const result = await OpenAIService.generateTicketReply(
      ticket,
      messages,
      ticket.customerInfo
    );

    logger.info('Reply generated successfully', {
      ticketId,
      replyLength: result.reply?.length || 0
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