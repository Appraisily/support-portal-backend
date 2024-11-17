const OpenAIService = require('../services/OpenAIService');
const TicketService = require('../services/TicketService');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

exports.generateTicketReply = async (req, res) => {
  const startTime = Date.now();
  const { ticketId } = req.params;

  try {
    logger.info('Starting ticket reply generation', { 
      ticketId,
      userId: req.user?.id,
      requestBody: req.body,
      requestHeaders: {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length']
      }
    });

    // Get ticket with messages
    const ticketResponse = await TicketService.getTicketById(ticketId);
    
    if (!ticketResponse?.success || !ticketResponse?.data) {
      throw new ApiError(404, 'Ticket not found');
    }

    const ticket = ticketResponse.data;
    const messages = ticket.messages || [];

    // Validate we have messages to work with
    if (!messages.length) {
      throw new ApiError(400, 'No messages found in ticket');
    }

    logger.info('Retrieved ticket data for OpenAI generation:', {
      ticketId,
      subject: ticket.subject,
      messageCount: messages.length,
      hasCustomer: !!ticket.customer,
      hasCustomerInfo: !!ticket.customerInfo,
      customerEmail: ticket.customer?.email,
      status: ticket.status,
      priority: ticket.priority
    });

    // Generate reply using OpenAI
    const openAIResponse = await OpenAIService.generateTicketReply(
      ticket, 
      messages, 
      ticket.customerInfo
    );

    if (!openAIResponse?.success || !openAIResponse?.reply) {
      throw new ApiError(500, 'Failed to generate reply');
    }

    const processingTime = Date.now() - startTime;
    logger.info('Reply generated successfully', {
      ticketId,
      replyLength: openAIResponse.reply.length,
      processingTime,
      previewText: openAIResponse.reply.substring(0, 100)
    });

    res.json({
      success: true,
      ticketId,
      generatedReply: openAIResponse.reply
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error generating ticket reply:', {
      ticketId,
      error: error.message,
      stack: error.stack,
      processingTime,
      errorType: error.constructor.name,
      statusCode: error.statusCode || 500
    });

    // Send appropriate error response
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate reply',
      ticketId
    });
  }
};