const logger = require('../utils/logger');
const { initializeDatabase } = require('../config/database');
const ApiError = require('../utils/apiError');
const { Op } = require('sequelize');
const SheetsService = require('./SheetsService');

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
      
      const { status, priority, sortBy = 'lastMessageAt', sortOrder = 'DESC', search, searchFields } = filters;
      const page = Math.max(1, parseInt(pagination.page) || 1);
      const limit = Math.max(1, Math.min(50, parseInt(pagination.limit) || 10));

      logger.info('Listing tickets with filters:', {
        filters: { status, priority },
        pagination: { page, limit },
        sorting: { sortBy, sortOrder }
      });

      const where = {};
      
      // Handle status filter
      if (status) {
        where.status = status === 'pending' ? 'open' : status;
      }
      
      // Handle priority filter
      if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
        where.priority = priority;
      }

      // Handle search if provided
      if (search && searchFields?.length > 0) {
        where[Op.or] = searchFields.map(field => ({
          [field]: { [Op.iLike]: `%${search}%` }
        }));
      }

      const { rows: tickets, count } = await this.models.Ticket.findAndCountAll({
        where,
        include: [
          {
            model: this.models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.models.User,
            as: 'assignedTo',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: [[sortBy, sortOrder]],
        limit,
        offset: (page - 1) * limit,
        distinct: true
      });

      // Map status for frontend consistency
      const mappedTickets = tickets.map(ticket => {
        const plainTicket = ticket.get({ plain: true });
        if (plainTicket.status === 'open') {
          plainTicket.status = 'pending';
        }
        return plainTicket;
      });

      logger.info('Successfully retrieved tickets', {
        count,
        page,
        totalPages: Math.ceil(count / limit)
      });

      return {
        tickets: mappedTickets,
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
          },
          {
            model: this.models.User,
            as: 'assignedTo',
            attributes: ['id', 'name', 'email']
          }
        ]
      });

      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      // Get customer info from sheets if customer exists
      if (ticket.customer && ticket.customer.email) {
        try {
          const customerInfo = await SheetsService.getCustomerInfo(ticket.customer.email);
          ticket.setDataValue('customerInfo', customerInfo);
        } catch (error) {
          logger.error('Error getting customer info from sheets:', {
            error: error.message,
            ticketId: id,
            customerEmail: ticket.customer.email
          });
          // Don't fail the whole request if sheets info fails
          ticket.setDataValue('customerInfo', {
            error: 'Could not retrieve customer information'
          });
        }
      }

      // Map status for frontend
      if (ticket.status === 'open') {
        ticket.status = 'pending';
      }

      return ticket;
    } catch (error) {
      logger.error('Error retrieving ticket:', {
        error: error.message,
        ticketId: id
      });
      throw error;
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
        content: data.content,
        direction: data.direction || 'outbound',
        customerId: data.customerId,
        userId: data.userId
      });

      // Update ticket's last message timestamp
      await ticket.update({
        lastMessageAt: new Date()
      });

      logger.info('Reply added successfully', {
        messageId: reply.id,
        direction: reply.direction,
        ticketId
      });

      return reply;
    } catch (error) {
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