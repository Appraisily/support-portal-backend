const OpenAIService = require('../services/OpenAIService');
const TicketService = require('../services/TicketService');
const SheetsService = require('../services/SheetsService');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

exports.generateTicketReply = async (req, res) => {
  const startTime = Date.now();
  const { ticketId } = req.params;

  try {
    logger.info('Starting ticket reply generation', { 
      ticketId,
      userId: req.user?.id,
      requestHeaders: {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length']
      }
    });

    // Initialize OpenAI service first
    logger.debug('Initializing OpenAI service...');
    await OpenAIService.ensureInitialized();
    logger.debug('OpenAI service initialized');

    // Initialize ticket service
    logger.debug('Initializing ticket service...');
    await TicketService.ensureInitialized();
    logger.debug('Ticket service initialized');

    // Get ticket with messages
    logger.debug('Fetching ticket details...');
    const ticketResponse = await TicketService.getTicketById(ticketId);
    
    if (!ticketResponse?.success || !ticketResponse?.data) {
      logger.error('Failed to fetch ticket:', {
        ticketId,
        response: ticketResponse
      });
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

    // Get customer info if available
    let customerInfo = null;
    if (ticket.customer?.email) {
      try {
        logger.debug('Fetching customer info from sheets...');
        customerInfo = await SheetsService.getCustomerInfo(ticket.customer.email);
        logger.info('Retrieved customer info:', {
          email: ticket.customer.email,
          hasSales: customerInfo?.sales?.length > 0,
          hasPendingAppraisals: customerInfo?.pendingAppraisals?.length > 0
        });
      } catch (error) {
        logger.warn('Failed to get customer info, continuing without it:', {
          error: error.message,
          email: ticket.customer.email
        });
      }
    }

    // Generate reply using OpenAI
    logger.debug('Starting OpenAI reply generation...');
    const openAIResponse = await OpenAIService.generateTicketReply(
      ticket,
      messages,
      customerInfo
    );

    if (!openAIResponse?.success || !openAIResponse?.reply) {
      logger.error('OpenAI failed to generate reply:', {
        ticketId,
        error: openAIResponse?.error || 'No reply generated',
        response: openAIResponse
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

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to generate reply',
      ticketId
    });
  }
};