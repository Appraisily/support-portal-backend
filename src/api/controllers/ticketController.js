const TicketService = require('../../services/TicketService');
const logger = require('../../utils/logger');

exports.listTickets = async (req, res, next) => {
  try {
    logger.info('API: Listing tickets', {
      query: req.query
    });
    
    const result = await TicketService.listTickets(req.query);
    
    logger.info('API: Tickets retrieved', {
      count: result.tickets?.length || 0
    });
    
    res.json(result);
  } catch (error) {
    logger.error('API: Error listing tickets', {
      error: error.message,
      query: req.query
    });
    next(error);
  }
};

exports.getTicket = async (req, res, next) => {
  try {
    logger.info('API: Getting ticket', {
      ticketId: req.params.id
    });
    
    const ticket = await TicketService.getTicketById(req.params.id);
    
    logger.info('API: Ticket retrieved', {
      ticketId: ticket.id
    });
    
    res.json({ ticket });
  } catch (error) {
    logger.error('API: Error getting ticket', {
      error: error.message,
      ticketId: req.params.id
    });
    next(error);
  }
};

exports.createTicket = async (req, res, next) => {
  try {
    logger.info('API: Creating ticket', {
      data: req.body
    });
    
    const ticket = await TicketService.createTicket(req.body);
    
    logger.info('API: Ticket created', {
      ticketId: ticket.id
    });
    
    res.status(201).json({ ticket });
  } catch (error) {
    logger.error('API: Error creating ticket', {
      error: error.message,
      data: req.body
    });
    next(error);
  }
};

exports.updateTicket = async (req, res, next) => {
  try {
    logger.info('API: Updating ticket', {
      ticketId: req.params.id,
      updates: req.body
    });
    
    const ticket = await TicketService.updateTicket(req.params.id, req.body);
    
    logger.info('API: Ticket updated', {
      ticketId: ticket.id
    });
    
    res.json({ ticket });
  } catch (error) {
    logger.error('API: Error updating ticket', {
      error: error.message,
      ticketId: req.params.id,
      updates: req.body
    });
    next(error);
  }
};