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