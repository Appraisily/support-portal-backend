const OpenAIService = require('../services/OpenAIService');
const TicketService = require('../services/TicketService');
const SheetsService = require('../services/SheetsService');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

// Create instance of TicketService
const ticketService = new TicketService();

exports.generateTicketReply = async (req, res, next) => {
  const startTime = Date.now();
  const { ticketId } = req.params;

  try {
    logger.info('Starting ticket reply generation', { ticketId });

    // Initialize services
    await ticketService.ensureInitialized();

    // Get ticket with messages and customer info
    const ticketResponse = await ticketService.getTicketById(ticketId);
    
    if (!ticketResponse.success) {
      logger.error('Failed to fetch ticket:', {
        ticketId,
        error: 'Ticket not found'
      });
      throw new ApiError(404, 'Ticket not found');
    }

    const ticket = ticketResponse.data;
    const messages = ticket.messages;

    // Get customer info from sheets
    const customerInfo = ticket.customer ? 
      await SheetsService.getCustomerInfo(ticket.customer.email) : 
      null;

    logger.info('Retrieved ticket data:', {
      ticketId,
      subject: ticket.subject,
      messageCount: messages.length,
      hasCustomerInfo: !!customerInfo
    });

    // Generate reply using OpenAI
    const openAIResponse = await OpenAIService.generateTicketReply(
      ticket,
      messages,
      customerInfo
    );

    if (!openAIResponse.success || !openAIResponse.reply) {
      logger.error('OpenAI failed to generate reply:', {
        ticketId,
        response: openAIResponse
      });
      throw new ApiError(500, 'Failed to generate reply');
    }

    logger.info('Reply generated successfully', {
      ticketId,
      replyLength: openAIResponse.reply.length,
      processingTime: Date.now() - startTime
    });

    // Send successful response
    res.json({
      success: true,
      ticketId,
      generatedReply: openAIResponse.reply
    });

  } catch (error) {
    logger.error('Error generating ticket reply', {
      ticketId,
      error: error.message,
      stack: error.stack,
      processingTime: Date.now() - startTime
    });

    // If it's not already an ApiError, convert it
    if (!(error instanceof ApiError)) {
      error = new ApiError(
        500,
        'Error generating reply: ' + (error.message || 'Unknown error')
      );
    }

    res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }
};