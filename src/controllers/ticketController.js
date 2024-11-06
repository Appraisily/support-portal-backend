const ticketService = require('../services/TicketService');
const logger = require('../utils/logger');

exports.listTickets = async (req, res, next) => {
  try {
    await ticketService.ensureInitialized();
    
    const { status, priority, page, limit, sort, order } = req.query;

    logger.info('Listing tickets request:', {
      filters: { status, priority },
      pagination: { page, limit },
      sorting: { sort, order },
      userId: req.user?.id
    });

    const result = await ticketService.listTickets(
      { status, priority, sort, order },
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
      ticketId: req.params.id,
      userId: req.user?.id
    });

    const ticket = await ticketService.getTicketById(req.params.id);
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

    const ticket = await ticketService.createTicket(req.body);
    
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

    const ticket = await ticketService.updateTicket(req.params.id, req.body);
    
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

    const ticket = await ticketService.getTicketById(id);
    const message = await ticketService.addMessage(id, {
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