const { models } = require('../config/database');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

class TicketService {
  async findByGmailThreadId(threadId) {
    try {
      return await models.Ticket.findOne({
        where: { gmailThreadId: threadId }
      });
    } catch (error) {
      logger.error('Error finding ticket by Gmail thread ID:', error);
      return null;
    }
  }

  async listTickets(filters = {}, options = {}) {
    const { status, priority, assignedToId } = filters;
    const { page = 1, limit = 10, sort = 'createdAt', order = 'DESC' } = options;

    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assignedToId) query.assignedToId = assignedToId;

    try {
      const tickets = await models.Ticket.findAndCountAll({
        where: query,
        order: [[sort, order]],
        limit: parseInt(limit),
        offset: (page - 1) * limit,
        include: [
          {
            model: models.User,
            as: 'assignedTo',
            attributes: ['id', 'name', 'email']
          },
          {
            model: models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email', 'avatar']
          }
        ]
      });

      return {
        tickets: tickets.rows,
        total: tickets.count,
        page: parseInt(page),
        totalPages: Math.ceil(tickets.count / limit)
      };
    } catch (error) {
      logger.error('Error listing tickets:', error);
      throw new ApiError(500, 'Failed to list tickets');
    }
  }

  async getTicketById(id) {
    try {
      const ticket = await models.Ticket.findByPk(id, {
        include: [
          {
            model: models.Message,
            as: 'messages',
            include: [
              {
                model: models.User,
                as: 'author',
                attributes: ['id', 'name', 'email']
              },
              {
                model: models.Attachment,
                as: 'attachments'
              }
            ]
          },
          {
            model: models.User,
            as: 'assignedTo',
            attributes: ['id', 'name', 'email']
          },
          {
            model: models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email', 'avatar']
          }
        ]
      });

      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      return ticket;
    } catch (error) {
      logger.error('Error getting ticket:', error);
      throw error;
    }
  }

  async createTicket(ticketData) {
    try {
      // First, ensure customer exists or create them
      let customer = await models.Customer.findOne({
        where: { email: ticketData.customer.email }
      });

      if (!customer) {
        customer = await models.Customer.create({
          name: ticketData.customer.name,
          email: ticketData.customer.email
        });
      }

      // Create the ticket
      const ticket = await models.Ticket.create({
        subject: ticketData.subject,
        status: ticketData.status || 'open',
        priority: ticketData.priority || 'medium',
        category: ticketData.category,
        customerId: customer.id,
        gmailThreadId: ticketData.gmailThreadId
      });

      // If there's initial content, create first message
      if (ticketData.content) {
        await this.addMessage(ticket.id, {
          content: ticketData.content,
          direction: 'inbound',
          internal: false,
          from: ticketData.customer.email
        });
      }

      logger.info(`New ticket created with ID: ${ticket.id}`);
      return ticket;
    } catch (error) {
      logger.error('Error creating ticket:', error);
      throw new ApiError(500, 'Failed to create ticket');
    }
  }

  async updateTicket(id, updates) {
    try {
      const ticket = await models.Ticket.findByPk(id);
      
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      await ticket.update(updates);
      logger.info(`Ticket ${id} updated`);
      
      return ticket;
    } catch (error) {
      logger.error('Error updating ticket:', error);
      throw error;
    }
  }

  async addMessage(ticketId, messageData) {
    try {
      const ticket = await models.Ticket.findByPk(ticketId);
      
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      const message = await models.Message.create({
        ticketId,
        content: messageData.content,
        direction: messageData.direction,
        internal: messageData.internal || false,
        authorId: messageData.authorId
      });

      logger.info(`New message added to ticket ${ticketId}`);
      return message;
    } catch (error) {
      logger.error('Error adding message:', error);
      throw error;
    }
  }

  async addReply(ticketId, replyData) {
    try {
      const ticket = await this.getTicketById(ticketId);
      
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      const message = await models.Message.create({
        ticketId,
        content: replyData.content,
        direction: 'outbound',
        internal: false,
        authorId: replyData.userId
      });

      // Update ticket status
      await ticket.update({
        status: 'pending',
        updatedAt: new Date()
      });

      logger.info(`Reply added to ticket ${ticketId}`);
      return message;
    } catch (error) {
      logger.error('Error adding reply:', {
        error: error.message,
        ticketId,
        data: replyData
      });
      throw new Error('Error adding reply');
    }
  }
}

module.exports = new TicketService();