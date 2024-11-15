const logger = require('../utils/logger');
const ticketService = require('../services/TicketService');
const ApiError = require('../utils/apiError');

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
    
    // Send appropriate error response
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error while fetching tickets'
      });
    }
  }
};

exports.getTicket = async (req, res) => {
  try {
    await ticketService.ensureInitialized();

    logger.info('Getting ticket details', {
      ticketId: req.params.id
    });

    const response = await ticketService.getTicketById(req.params.id);
    
    if (!response) {
      throw new ApiError(404, 'Ticket not found');
    }

    res.json(response);
  } catch (error) {
    logger.error('Error getting ticket', {
      ticketId: req.params.id,
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

exports.createTicket = async (req, res) => {
  try {
    await ticketService.ensureInitialized();

    logger.info('Creating new ticket', {
      subject: req.body.subject,
      category: req.body.category,
      customerId: req.body.customerId
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
    next(error);
  }
};

exports.updateTicket = async (req, res) => {
  try {
    await ticketService.ensureInitialized();

    const { id } = req.params;
    
    logger.info('Updating ticket', {
      ticketId: id,
      updates: req.body
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
    next(error);
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
      userId: req.user?.id
    });

    // Get the ticket first to get customer email and thread ID
    const ticketResponse = await ticketService.getTicketById(ticketId);
    
    if (!ticketResponse || !ticketResponse.data) {
      throw new ApiError(404, 'Ticket not found');
    }

    const ticket = ticketResponse.data;

    // Create the reply in the database
    const reply = await ticketService.addReply(ticketId, {
      content,
      direction,
      attachments: req.body.attachments || []
    });

    if (!reply) {
      throw new ApiError(500, 'Failed to create reply');
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
    next(error);
  }
};