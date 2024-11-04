const TicketService = require('../services/TicketService');
const logger = require('../utils/logger');

exports.listTickets = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = status ? { status } : {};

    logger.info('Listing tickets with query:', { query, page, limit });

    const result = await TicketService.listTickets(query, {
      page,
      limit
    });

    const tickets = result.tickets.map(ticket => ({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      customer: ticket.customer ? {
        id: ticket.customer.id,
        name: ticket.customer.name,
        email: ticket.customer.email
      } : null,
      createdAt: ticket.createdAt.toISOString(),
      lastUpdated: ticket.updatedAt.toISOString(),
      messages: (ticket.messages || []).map(message => ({
        id: message.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        author: message.author
      }))
    }));

    logger.info('Successfully mapped tickets:', { count: tickets.length });

    res.json(tickets);
  } catch (error) {
    logger.error('Error in listTickets:', error);
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