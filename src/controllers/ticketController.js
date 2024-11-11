const ticketService = require('../services/TicketService');
const gmailService = require('../services/GmailService');
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
    const ticketId = req.params.id;
    
    // First get the ticket to get customer email and thread ID
    const ticket = await ticketService.getTicketById(ticketId);
    
    // Create the reply in the database
    const reply = await ticketService.addReply(ticketId, {
      content: req.body.content,
      direction: req.body.direction || 'outbound',
      userId: null,
      attachments: req.body.attachments
    });

    // Send the email reply
    if (ticket.customer && ticket.customer.email) {
      await gmailService.sendEmail(
        ticket.customer.email,
        `Re: ${ticket.subject}`,
        req.body.content,
        ticket.gmailThreadId
      );
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