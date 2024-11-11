const OpenAIService = require('../services/OpenAIService');
const TicketService = require('../services/TicketService');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

exports.generateTicketReply = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    logger.info('Generating ticket reply', { ticketId });

    // Get ticket with messages
    const ticket = await TicketService.getTicketById(ticketId);
    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    // Get messages in chronological order
    const messages = ticket.messages.sort((a, b) => 
      new Date(a.createdAt) - new Date(b.createdAt)
    );

    // Generate reply using OpenAI
    const result = await OpenAIService.generateTicketReply(ticketId, messages);

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