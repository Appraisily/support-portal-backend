const OpenAIService = require('../services/OpenAIService');
const TicketService = require('../services/TicketService');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

exports.generateReply = async (req, res, next) => {
  try {
    const { message, context } = req.body;

    logger.info('Generating email reply', {
      messageLength: message.length,
      hasContext: !!context
    });

    if (!message) {
      throw new ApiError(400, 'Message is required');
    }

    const reply = await OpenAIService.generateEmailReply(message, context || {});

    res.json({
      success: true,
      reply
    });
  } catch (error) {
    logger.error('Error in email reply generation', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

exports.generateTicketReply = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    logger.info('Generating ticket reply', { ticketId });

    // Get ticket with messages
    const ticket = await TicketService.getTicketById(ticketId);
    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    // Extract conversation history
    const conversationHistory = ticket.messages.map(msg => ({
      role: msg.direction === 'inbound' ? 'customer' : 'agent',
      content: msg.content,
      timestamp: msg.createdAt
    }));

    // Generate context for OpenAI
    const context = {
      ticketSubject: ticket.subject,
      customerStatus: ticket.customer?.status || 'Regular',
      priority: ticket.priority,
      category: ticket.category,
      previousInteractions: conversationHistory.length - 1, // Excluding latest message
      recentPurchases: false // Could be enhanced with actual purchase data
    };

    // Get latest customer message
    const latestCustomerMessage = conversationHistory
      .filter(msg => msg.role === 'customer')
      .pop();

    if (!latestCustomerMessage) {
      throw new ApiError(400, 'No customer message found in ticket');
    }

    const reply = await OpenAIService.generateTicketReply(
      latestCustomerMessage.content,
      conversationHistory,
      context
    );

    res.json({
      success: true,
      reply,
      ticketId,
      context
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