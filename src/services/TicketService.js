const Ticket = require('../models/ticket');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

class TicketService {
  async listTickets(filters, pagination) {
    const { status, priority, page = 1, limit = 10, sort = 'createdAt', order = 'desc' } = pagination;
    
    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;

    const sortOptions = { [sort]: order === 'desc' ? -1 : 1 };
    
    const tickets = await Ticket.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('assignedTo', 'name email');

    const total = await Ticket.countDocuments(query);

    return {
      tickets,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    };
  }

  async getTicketById(id) {
    const ticket = await Ticket.findById(id)
      .populate('messages')
      .populate('attachments');

    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    return ticket;
  }

  async createTicket(ticketData) {
    const ticket = new Ticket(ticketData);
    await ticket.save();
    logger.info(`New ticket created with ID: ${ticket._id}`);
    return ticket;
  }

  async updateTicket(id, updates) {
    const ticket = await Ticket.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    logger.info(`Ticket ${id} updated`);
    return ticket;
  }
}

module.exports = new TicketService();