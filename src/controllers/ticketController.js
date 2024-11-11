const TicketService = require('../services/TicketService');
const OpenAIService = require('../services/OpenAIService');
const logger = require('../utils/logger');

exports.listTickets = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = status ? { status } : {};

    const tickets = await TicketService.listTickets(query, {
      page,
      limit,
      populate: [
        { path: 'customer', select: 'id name email avatar' },
        { path: 'messages' }
      ]
    });

    res.json(tickets);
  } catch (error) {
    next(error);
  }
};

exports.getTicket = async (req, res, next) => {
  try {
    const ticket = await TicketService.getTicketById(req.params.id);
    res.json({ ticket });
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
    const { content } = req.body;
    const userId = req.user?.id || 'admin'; // Temporary fallback for testing

    const message = await TicketService.addReply(id, {
      content,
      userId
    });

    logger.info(`Reply sent to ticket ${id}`);
    res.json({
      success: true,
      message
    });
  } catch (error) {
    logger.error('Error handler caught error:', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method
    });
    next(error);
  }
};

exports.generateAIReply = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ticket = await TicketService.getTicketById(id);

    // Get customer context
    const context = {
      totalPurchases: ticket.customer.totalPurchases,
      customerSince: ticket.customer.createdAt,
      recentIssues: ticket.customer.recentIssues
    };

    // Generate AI reply
    const suggestedReply = await OpenAIService.generateReply(ticket, context);

    res.json({
      success: true,
      suggestedReply
    });
  } catch (error) {
    logger.error('Error generating AI reply:', {
      error: error.message,
      ticketId: req.params.id
    });
    next(error);
  }
};