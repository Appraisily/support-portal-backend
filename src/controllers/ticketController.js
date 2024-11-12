const TicketService = require('../services/TicketService');
const GmailService = require('../services/GmailService');
const logger = require('../utils/logger');

// Create instance of TicketService
const ticketService = new TicketService();

exports.listTickets = async (req, res, next) => {
  try {
    const { status, priority, page, limit, sortBy, sortOrder } = req.query;

    logger.info('Listing tickets request:', {
      filters: { status, priority },
      pagination: { page, limit },
      sorting: { sortBy, sortOrder },
      userId: req.user?.id
    });

    await ticketService.ensureInitialized();

    const result = await ticketService.listTickets(
      { status, priority, sort: sortBy, order: sortOrder },
      { page, limit }
    );

    res.json({
      success: true,
      data: {
        tickets: result.tickets,
        pagination: result.pagination
      }
    });
  } catch (error) {
    logger.error('Error listing tickets', {
      error: error.message,
      filters: req.query,
      userId: req.user?.id
    });
    next(error);
  }
};

exports.getTicket = async (req, res, next) => {
  try {
    await ticketService.ensureInitialized();

    logger.info('Getting ticket details', {
      ticketId: req.params.id
    });

    const response = await ticketService.getTicketById(req.params.id);
    res.json(response);
  } catch (error) {
    logger.error('Error getting ticket', {
      ticketId: req.params.id,
      error: error.message
    });
    next(error);
  }
};

exports.createTicket = async (req, res, next) => {
  try {
    await ticketService.ensureInitialized();

    logger.info('Creating new ticket', {
      subject: req.body.subject,
      category: req.body.category,
      customerId: req.body.customerId
    });

    const ticket = await ticketService.createTicket(req.body);
    
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
      body: req.body
    });
    next(error);
  }
};

exports.updateTicket = async (req, res, next) => {
  try {
    await ticketService.ensureInitialized();

    const { id } = req.params;
    
    logger.info('Updating ticket', {
      ticketId: id,
      updates: req.body
    });

    const ticket = await ticketService.updateTicket(id, req.body);
    
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
      ticketId: req.params.id,
      updates: req.body
    });
    next(error);
  }
};

exports.replyToTicket = async (req, res, next) => {
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
    const ticket = ticketResponse.data;

    // Create the reply in the database - Note: userId is optional
    const reply = await ticketService.addReply(ticketId, {
      content,
      direction,
      attachments: req.body.attachments || []
    });

    // Send email reply if it's outbound
    if (direction === 'outbound' && ticket.customer?.email) {
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