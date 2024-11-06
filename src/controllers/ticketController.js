const TicketService = require('../services/TicketService');
const logger = require('../utils/logger');

exports.listTickets = async (req, res, next) => {
  try {
    const { status, priority, page = 1, limit = 10 } = req.query;
    
    logger.info('Raw ticket list request:', {
      query: JSON.stringify(req.query),
      headers: JSON.stringify(req.headers),
      user: req.user ? {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      } : null,
      params: {
        status,
        priority,
        page,
        limit
      }
    });

    const result = await TicketService.listTickets(
      { status, priority },
      { page, limit }
    );

    logger.info('Ticket list response prepared:', {
      totalTickets: result.total,
      returnedTickets: result.tickets.length,
      pagination: {
        page: result.page,
        totalPages: result.totalPages,
        limit
      },
      sampleTicket: result.tickets[0] ? {
        id: result.tickets[0].id,
        subject: result.tickets[0].subject,
        status: result.tickets[0].status,
        hasCustomer: !!result.tickets[0].customer,
        hasMessages: !!result.tickets[0].lastMessage
      } : 'No tickets found'
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
    logger.error('Ticket list error:', {
      error: error.message,
      stack: error.stack,
      query: JSON.stringify(req.query),
      user: req.user?.id,
      type: error.constructor.name,
      sequelizeError: error.original?.message,
      sqlState: error.original?.sqlState
    });
    next(error);
  }
};

exports.getTicket = async (req, res, next) => {
  try {
    const ticket = await TicketService.getTicketById(req.params.id);
    
    const response = {
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        customer: ticket.customer ? {
          id: ticket.customer.id,
          name: ticket.customer.name,
          email: ticket.customer.email
        } : null,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt.toISOString(),
        lastUpdated: ticket.updatedAt.toISOString(),
        category: ticket.category,
        messages: ticket.messages || [],
        attachments: ticket.attachments || []
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

exports.createTicket = async (req, res, next) => {
  try {
    const ticket = await TicketService.createTicket(req.body);
    res.status(201).json({ ticket });
  } catch (error) {
    next(error);
  }
};

exports.updateTicket = async (req, res, next) => {
  try {
    const ticket = await TicketService.updateTicket(req.params.id, req.body);
    res.json({ ticket });
  } catch (error) {
    next(error);
  }
};

exports.replyToTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, attachments } = req.body;

    const ticket = await TicketService.getTicketById(id);
    const message = await TicketService.addMessage(id, {
      content,
      attachments,
      author: req.user.id
    });

    logger.info(`Reply sent to ticket ${id}`);
    res.json({
      success: true,
      message
    });
  } catch (error) {
    next(error);
  }
};