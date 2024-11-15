const ticketService = require('../services/TicketService');
const GmailService = require('../services/GmailService');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

exports.listTickets = async (req, res) => {
  try {
    const { status, priority, page = 1, limit = 10, sortBy, sortOrder } = req.query;

    logger.info('Listing tickets request:', {
      filters: { status, priority },
      pagination: { page, limit },
      sorting: { sortBy, sortOrder },
      userId: req.user?.id
    });

    // Ensure database is initialized
    await ticketService.ensureInitialized();

    const result = await ticketService.listTickets(
      { status, priority, sort: sortBy, order: sortOrder },
      { page: parseInt(page), limit: parseInt(limit) }
    );

    if (!result) {
      throw new ApiError(500, 'Failed to fetch tickets');
    }

    res.json({
      success: true,
      data: {
        tickets: result.tickets || [],
        pagination: {
          total: result.pagination?.total || 0,
          page: parseInt(page),
          totalPages: result.pagination?.totalPages || 0
        }
      }
    });
  } catch (error) {
    logger.error('Error listing tickets', {
      error: error.message,
      stack: error.stack,
      filters: req.query,
      userId: req.user?.id
    });
    
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch tickets'
    });
  }
};

exports.getTicket = async (req, res) => {
  try {
    await ticketService.ensureInitialized();

    logger.info('Getting ticket details', {
      ticketId: req.params.id,
      userId: req.user?.id
    });

    const response = await ticketService.getTicketById(req.params.id);
    
    if (!response?.success || !response?.data) {
      throw new ApiError(404, 'Ticket not found');
    }

    res.json(response);
  } catch (error) {
    logger.error('Error getting ticket', {
      ticketId: req.params.id,
      error: error.message,
      stack: error.stack
    });

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to fetch ticket'
    });
  }
};

exports.createTicket = async (req, res) => {
  try {
    await ticketService.ensureInitialized();

    logger.info('Creating new ticket', {
      subject: req.body.subject,
      category: req.body.category,
      customerId: req.body.customerId,
      userId: req.user?.id
    });

    const ticket = await ticketService.createTicket(req.body);
    
    if (!ticket) {
      throw new ApiError(500, 'Failed to create ticket');
    }

    logger.info('Ticket created successfully', {
      ticketId: ticket.id
    });

    res.status(201).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    logger.error('Error creating ticket', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to create ticket'
    });
  }
};

exports.updateTicket = async (req, res) => {
  try {
    await ticketService.ensureInitialized();

    const { id } = req.params;
    
    logger.info('Updating ticket', {
      ticketId: id,
      updates: req.body,
      userId: req.user?.id
    });

    const ticket = await ticketService.updateTicket(id, req.body);
    
    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    logger.info('Ticket updated successfully', {
      ticketId: id
    });

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    logger.error('Error updating ticket', {
      error: error.message,
      stack: error.stack,
      ticketId: req.params.id,
      updates: req.body
    });

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update ticket'
    });
  }
};

exports.replyToTicket = async (req, res) => {
  try {
    await ticketService.ensureInitialized();

    const ticketId = req.params.id;
    const { content, direction = 'outbound' } = req.body;
    
    logger.info('Adding reply to ticket', {
      ticketId,
      direction,
      userId: req.user?.id,
      contentLength: content?.length
    });

    // Get the ticket first
    const ticketResponse = await ticketService.getTicketById(ticketId);
    
    if (!ticketResponse?.success || !ticketResponse?.data) {
      throw new ApiError(404, 'Ticket not found');
    }

    const ticket = ticketResponse.data;

    // Create the reply
    const reply = await ticketService.addReply(ticketId, {
      content,
      direction,
      userId: req.user?.id,
      attachments: req.body.attachments || []
    });

    if (!reply) {
      throw new ApiError(500, 'Failed to create reply');
    }

    // Send email if outbound
    if (direction === 'outbound' && ticket.customer?.email) {
      try {
        await GmailService.sendEmail(
          ticket.customer.email,
          `Re: ${ticket.subject}`,
          content,
          ticket.gmailThreadId
        );

        logger.info('Email reply sent successfully', {
          ticketId,
          customerEmail: ticket.customer.email
        });
      } catch (emailError) {
        logger.warn('Failed to send email reply', {
          error: emailError.message,
          ticketId,
          customerEmail: ticket.customer.email
        });
        // Continue even if email fails
      }
    }
    
    res.status(201).json({ 
      success: true, 
      data: reply 
    });
  } catch (error) {
    logger.error('Error in ticket reply:', {
      ticketId: req.params.id,
      error: error.message,
      stack: error.stack
    });

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to add reply'
    });
  }
};