const logger = require('../utils/logger');
const { initializeDatabase } = require('../config/database');
const ApiError = require('../utils/apiError');
const { Sequelize } = require('sequelize');

class TicketService {
  constructor() {
    this.sequelize = null;
    this.models = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.sequelize = await initializeDatabase();
      this.models = this.sequelize.models;
      
      if (!this.models.Ticket || !this.models.Customer || !this.models.Message) {
        throw new Error('Required models not found');
      }

      this.initialized = true;
      logger.info('TicketService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize TicketService:', {
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
      
      const { status, priority, sort = 'createdAt', order = 'DESC' } = filters;
      const page = Math.max(1, parseInt(pagination.page) || 1);
      const limit = Math.max(1, Math.min(50, parseInt(pagination.limit) || 10));

      logger.info('Listing tickets with filters:', {
        filters: { status, priority },
        pagination: { page, limit },
        sorting: { sort, order }
      });

      const where = {};
      if (status) where.status = status;
      if (priority) where.priority = priority;

      const { rows: tickets, count } = await this.models.Ticket.findAndCountAll({
        where,
        include: [
          {
            model: this.models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: [[sort, order]],
        limit,
        offset: (page - 1) * limit,
        distinct: true
      });

      logger.info('Successfully retrieved tickets', {
        count,
        page,
        totalPages: Math.ceil(count / limit)
      });

      return {
        tickets: tickets.map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          customer: ticket.customer ? {
            id: ticket.customer.id,
            name: ticket.customer.name,
            email: ticket.customer.email
          } : null,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt
        })),
        pagination: {
          total: count,
          page,
          totalPages: Math.ceil(count / limit),
          limit
        }
      };

    } catch (error) {
      logger.error('Error listing tickets:', {
        error: error.message,
        stack: error.stack
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
            order: [['createdAt', 'ASC']]
          }
        ]
      });

      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      return ticket;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      
      logger.error('Error retrieving ticket:', {
        error: error.message,
        ticketId: id
      });
      throw new ApiError(500, 'Error retrieving ticket');
    }
  }

  async createTicket(data) {
    try {
      await this.ensureInitialized();
      
      const ticket = await this.models.Ticket.create(data);
      logger.info('Ticket created successfully', { ticketId: ticket.id });
      return ticket;
    } catch (error) {
      logger.error('Error creating ticket:', {
        error: error.message,
        data
      });
      throw new ApiError(500, 'Error creating ticket');
    }
  }

  async updateTicket(id, data) {
    try {
      await this.ensureInitialized();
      
      const ticket = await this.models.Ticket.findByPk(id);
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      await ticket.update(data);
      logger.info('Ticket updated successfully', { ticketId: id });
      return ticket;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      
      logger.error('Error updating ticket:', {
        error: error.message,
        ticketId: id,
        data
      });
      throw new ApiError(500, 'Error updating ticket');
    }
  }

  async addReply(ticketId, data) {
    try {
      await this.ensureInitialized();
      
      const ticket = await this.models.Ticket.findByPk(ticketId);
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      const reply = await this.models.Message.create({
        ticketId,
        ...data
      });

      logger.info('Reply added successfully', {
        ticketId,
        messageId: reply.id
      });

      return reply;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      
      logger.error('Error adding reply:', {
        error: error.message,
        ticketId,
        data
      });
      throw new ApiError(500, 'Error adding reply');
    }
  }
}

module.exports = new TicketService();