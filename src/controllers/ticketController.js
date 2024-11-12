const TicketService = require('../services/TicketService');
const GmailService = require('../services/GmailService');
const logger = require('../utils/logger');

exports.listTickets = async (req, res, next) => {
  try {
    const { status, priority, page, limit, sortBy, sortOrder } = req.query;

    logger.info('Listing tickets request:', {
      filters: { status, priority },
      pagination: { page, limit },
      sorting: { sortBy, sortOrder },
      userId: req.user?.id
    });

    const result = await TicketService.listTickets(
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
    logger.info('Getting ticket details', {
      ticketId: req.params.id
    });

    const response = await TicketService.getTicketById(req.params.id);
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
    logger.info('Creating new ticket', {
      subject: req.body.subject,
      category: req.body.category,
      customerId: req.body.customerId
    });

    const ticket = await TicketService.createTicket(req.body);
    
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
    const { id } = req.params;
    
    logger.info('Updating ticket', {
      ticketId: id,
      updates: req.body
    });

    const ticket = await TicketService.updateTicket(id, req.body);
    
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
    const ticketId = req.params.id;
    
    logger.info('Adding reply to ticket', {
      ticketId,
      direction: req.body.direction || 'outbound'
    });

    // Get the ticket to get customer email and thread ID
    const ticketResponse = await TicketService.getTicketById(ticketId);
    const ticket = ticketResponse.data;
    
    // Create the reply in the database
    const reply = await TicketService.addReply(ticketId, {
      content: req.body.content,
      direction: req.body.direction || 'outbound',
      userId: req.user.id,
      attachments: req.body.attachments
    });

    // Send the email reply if it's an outbound message
    if (req.body.direction !== 'inbound' && ticket.customer?.email) {
      await GmailService.sendEmail(
        ticket.customer.email,
        `Re: ${ticket.subject}`,
        req.body.content,
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