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
    const ticket = await ticketService.getTicketById(req.params.id);
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

exports.createTicket = async (req, res, next) => {
  try {
    const ticket = await ticketService.createTicket(req.body);
    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

exports.updateTicket = async (req, res, next) => {
  try {
    const ticket = await ticketService.updateTicket(req.params.id, req.body);
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

exports.replyToTicket = async (req, res, next) => {
  try {
    const reply = await ticketService.addReply(req.params.id, {
      content: req.body.content,
      direction: req.body.direction || 'outbound',
      userId: req.user.id,
      attachments: req.body.attachments
    });
    
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