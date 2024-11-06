const TicketService = require('../services/TicketService');
const logger = require('../utils/logger');

exports.listTickets = async (req, res, next) => {
  try {
    const { status, priority, page = 1, limit = 10 } = req.query;
    
    logger.info('Listing tickets', {
      filters: { status, priority },
      pagination: { page, limit },
      userId: req.user?.id
    });

    const result = await TicketService.listTickets(
      { status, priority },
      { page, limit }
    );

    logger.info('Tickets retrieved', {
      totalTickets: result.total,
      currentPage: result.page,
      ticketsReturned: result.tickets.length
    });

    res.json({
      tickets: result.tickets,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages
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
      ticketId: req.params.id,
      userId: req.user?.id
    });

    const ticket = await TicketService.getTicketById(req.params.id);
    res.json({ ticket });
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
      userId: req.user?.id
    });

    const ticket = await TicketService.createTicket(req.body);
    
    logger.info('Ticket created', {
      ticketId: ticket.id,
      status: ticket.status
    });

    res.status(201).json({ ticket });
  } catch (error) {
    logger.error('Error creating ticket', {
      error: error.message,
      requestBody: req.body
    });
    next(error);
  }
};

exports.updateTicket = async (req, res, next) => {
  try {
    logger.info('Updating ticket', {
      ticketId: req.params.id,
      updates: req.body,
      userId: req.user?.id
    });

    const ticket = await TicketService.updateTicket(req.params.id, req.body);
    
    logger.info('Ticket updated', {
      ticketId: ticket.id,
      newStatus: ticket.status
    });

    res.json({ ticket });
  } catch (error) {
    logger.error('Error updating ticket', {
      ticketId: req.params.id,
      error: error.message
    });
    next(error);
  }
};

exports.replyToTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, attachments } = req.body;

    logger.info('Adding reply to ticket', {
      ticketId: id,
      userId: req.user?.id,
      hasAttachments: !!attachments
    });

    const ticket = await TicketService.getTicketById(id);
    const message = await TicketService.addMessage(id, {
      content,
      attachments,
      author: req.user.id
    });

    logger.info('Reply added successfully', {
      ticketId: id,
      messageId: message.id,
      userId: req.user?.id
    });

    res.json({
      success: true,
      message
    });
  } catch (error) {
    logger.error('Error adding reply to ticket', {
      ticketId: req.params.id,
      error: error.message,
      stack: error.stack,
      userId: req.user?.id
    });
    next(error);
  }
};