const logger = require('../utils/logger');
const { getModels } = require('../config/database');
const ApiError = require('../utils/apiError');

class TicketService {
  constructor() {
    this.initialized = false;
    this.models = null;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      const { models } = await getModels();
      this.models = models;
      
      if (!this.models?.Ticket || !this.models?.Customer || !this.models?.Message) {
        throw new Error('Required models not available');
      }
      
      this.initialized = true;
      logger.info('TicketService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize TicketService', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async listTickets(filters = {}, pagination = {}) {
    try {
      await this.ensureInitialized();
      
      const { 
        status, 
        priority, 
        sort = 'createdAt', 
        order = 'DESC' 
      } = filters;

      const page = Math.max(1, parseInt(pagination.page) || 1);
      const limit = Math.max(1, Math.min(50, parseInt(pagination.limit) || 10));

      logger.debug('Building ticket query', { filters, pagination });

      const query = {};
      if (status) query.status = status;
      if (priority) query.priority = priority;

      const tickets = await this.models.Ticket.findAndCountAll({
        where: query,
        include: [
          {
            model: this.models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.models.Message,
            as: 'messages',
            limit: 1,
            order: [['createdAt', 'DESC']],
            separate: true
          }
        ],
        order: [[sort, order]],
        limit,
        offset: (page - 1) * limit,
        distinct: true
      });

      logger.info('Tickets retrieved successfully', {
        count: tickets.count,
        page,
        limit
      });

      return {
        tickets: tickets.rows.map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          customer: ticket.customer ? {
            id: ticket.customer.id,
            name: ticket.customer.name,
            email: ticket.customer.email
          } : null,
          lastMessage: ticket.messages?.[0] ? {
            content: ticket.messages[0].content,
            createdAt: ticket.messages[0].createdAt
          } : null,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt
        })),
        pagination: {
          total: tickets.count,
          page: parseInt(page),
          totalPages: Math.ceil(tickets.count / limit),
          limit: parseInt(limit)
        }
      };

    } catch (error) {
      logger.error('Error listing tickets', {
        error: error.message,
        stack: error.stack,
        filters
      });
      throw new ApiError(500, 'Error retrieving tickets');
    }
  }

  async getTicketById(id) {
    try {
      await this.ensureInitialized();
      
      const ticket = await this.models.Ticket.findByPk(id, {
        include: [
          {
            model: this.models.Customer,
            as: 'customer'
          },
          {
            model: this.models.Message,
            as: 'messages',
            order: [['createdAt', 'ASC']],
            include: [
              {
                model: this.models.User,
                as: 'author',
                attributes: ['id', 'name', 'email']
              }
            ]
          }
        ]
      });

      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      return ticket;
    } catch (error) {
      logger.error('Error getting ticket', {
        error: error.message,
        ticketId: id
      });
      throw error;
    }
  }

  async createTicketFromEmail(emailData) {
    try {
      await this.ensureInitialized();

      const [customer] = await this.models.Customer.findOrCreate({
        where: { email: emailData.from },
        defaults: {
          name: emailData.fromName || emailData.from.split('@')[0],
          email: emailData.from
        }
      });

      const ticket = await this.models.Ticket.create({
        subject: emailData.subject,
        status: 'open',
        priority: 'medium',
        category: 'email',
        customerId: customer.id,
        gmailThreadId: emailData.threadId,
        gmailMessageId: emailData.messageId
      });

      await this.models.Message.create({
        ticketId: ticket.id,
        content: emailData.content,
        direction: 'inbound',
        customerId: customer.id
      });

      logger.info('Ticket created from email', {
        ticketId: ticket.id,
        threadId: emailData.threadId
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating ticket from email', {
        error: error.message,
        emailData
      });
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new TicketService();