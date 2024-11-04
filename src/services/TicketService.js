const { models } = require('../config/database');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

class TicketService {
  async listTickets(filters = {}, pagination = {}) {
    try {
      const { 
        status, 
        priority, 
        page = 1, 
        limit = 10, 
        sort = 'createdAt', 
        order = 'DESC' 
      } = { ...filters, ...pagination };

      const query = {};
      if (status) query.status = status;
      if (priority) query.priority = priority;

      const tickets = await models.Ticket.findAndCountAll({
        where: query,
        include: [
          {
            model: models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email']
          },
          {
            model: models.Message,
            as: 'messages'
          }
        ],
        order: [[sort, order]],
        limit: parseInt(limit),
        offset: (page - 1) * limit
      });

      return {
        tickets: tickets.rows,
        total: tickets.count,
        page: parseInt(page),
        totalPages: Math.ceil(tickets.count / limit)
      };
    } catch (error) {
      logger.error('Error listing tickets:', error);
      throw error;
    }
  }

  async getTicketById(id) {
    const ticket = await models.Ticket.findByPk(id, {
      include: [
        {
          model: models.Message,
          as: 'messages'
        },
        {
          model: models.Attachment,
          as: 'attachments'
        }
      ]
    });

    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    return ticket;
  }

  async createTicket(ticketData) {
    try {
      const ticket = await models.Ticket.create(ticketData);
      logger.info(`New ticket created with ID: ${ticket.id}`);
      return ticket;
    } catch (error) {
      logger.error('Error creating ticket:', error);
      throw error;
    }
  }

  async updateTicket(id, updates) {
    const ticket = await models.Ticket.findByPk(id);

    if (!ticket) {
      throw new ApiError(404, 'Ticket not found');
    }

    await ticket.update(updates);
    logger.info(`Ticket ${id} updated`);
    
    return ticket;
  }

  async addMessage(ticketId, messageData) {
    const ticket = await this.getTicketById(ticketId);
    const message = await models.Message.create({
      ...messageData,
      ticketId: ticket.id
    });
    
    return message;
  }
}

module.exports = new TicketService();