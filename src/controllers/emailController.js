const OpenAIService = require('../services/OpenAIService');
const TicketService = require('../services/TicketService');
const SheetsService = require('../services/SheetsService');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

// Create instance of TicketService
const ticketService = new TicketService();

exports.generateTicketReply = async (req, res) => {
  const startTime = Date.now();
  const { ticketId } = req.params;

  try {
    logger.info('Starting ticket reply generation', { 
      ticketId,
      userId: req.user?.id 
    });

    // Initialize services
    await ticketService.ensureInitialized();
    await OpenAIService.ensureInitialized();

    // Get ticket with messages and customer info
    const ticketResponse = await ticketService.getTicketById(ticketId);
    
    if (!ticketResponse?.success || !ticketResponse?.data) {
      logger.error('Failed to fetch ticket:', {
        ticketId,
        error: 'Ticket not found or invalid response'
      });
      throw new ApiError(404, 'Ticket not found');
    }

    const ticket = ticketResponse.data;
    const messages = ticket.messages;

    // Get customer info from sheets if customer exists
    const customerInfo = ticket.customer ? 
      await SheetsService.getCustomerInfo(ticket.customer.email) : 
      null;

    logger.info('Retrieved ticket data for OpenAI generation:', {
      ticketId,
      subject: ticket.subject,
      messageCount: messages.length,
      hasCustomer: !!ticket.customer,
      hasCustomerInfo: !!customerInfo,
      customerEmail: ticket.customer?.email,
      status: ticket.status,
      priority: ticket.priority
    });

    // Generate reply using OpenAI
    const openAIResponse = await OpenAIService.generateTicketReply(
      ticket,
      messages,
      customerInfo
    );

    if (!openAIResponse?.success || !openAIResponse?.reply) {
      logger.error('OpenAI failed to generate reply:', {
        ticketId,
        response: openAIResponse,
        error: openAIResponse?.error || 'No reply generated'
      });
      throw new ApiError(500, 'Failed to generate reply');
    }

    const processingTime = Date.now() - startTime;
    logger.info('Reply generated successfully', {
      ticketId,
      replyLength: openAIResponse.reply.length,
      processingTime,
      firstLine: openAIResponse.reply.split('\n')[0]
    });

    // Send successful response
    res.json({
      success: true,
      ticketId,
      generatedReply: openAIResponse.reply
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error generating ticket reply', {
      ticketId,
      error: error.message,
      stack: error.stack,
      processingTime,
      errorType: error.constructor.name,
      statusCode: error.statusCode
    });

    // Send appropriate error response
    const statusCode = error.statusCode || 500;
    const message = error.statusCode ? error.message : 'Failed to generate reply';

    res.status(statusCode).json({
      success: false,
      message,
      ticketId
    });
  }
};