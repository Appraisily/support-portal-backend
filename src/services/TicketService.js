const logger = require('../utils/logger');
const { initializeDatabase } = require('../config/database');
const ApiError = require('../utils/apiError');
const { Op } = require('sequelize');
const SheetsService = require('./SheetsService');

// Status mapping between frontend and database
const STATUS_MAPPING = {
  pending: 'open',
  in_progress: 'in_progress',
  resolved: 'closed',
  closed: 'closed'
};

// Reverse mapping for responses
const REVERSE_STATUS_MAPPING = {
  open: 'pending',
  in_progress: 'in_progress',
  closed: 'resolved'
};

class TicketService {
  constructor() {
    this.sequelize = null;
    this.models = null;
    this.initialized = false;
    this.initPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    try {
      this.initPromise = this._initialize();
      await this.initPromise;
      this.initialized = true;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  async _initialize() {
    try {
      this.sequelize = await initializeDatabase();
      this.models = this.sequelize.models;
      
      if (!this.models.Ticket || !this.models.Customer || !this.models.Message) {
        throw new Error('Required models not found');
      }

      logger.info('TicketService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize TicketService:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async listTickets({ status, priority, sort = 'lastMessageAt', order = 'desc' }, { page = 1, limit = 10 }) {
    await this.ensureInitialized();

    try {
      const where = {};
      if (status) {
        where.status = STATUS_MAPPING[status] || status;
      }
      if (priority) where.priority = priority;

      const offset = (page - 1) * limit;
      const orderBy = [[sort, order.toUpperCase()]];

      const { rows: tickets, count: total } = await this.models.Ticket.findAndCountAll({
        where,
        include: [
          {
            model: this.models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: orderBy,
        limit: parseInt(limit),
        offset
      });

      logger.info('Tickets retrieved successfully', {
        total,
        page,
        limit,
        ticketsCount: tickets.length
      });

      return {
        tickets: tickets.map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          status: REVERSE_STATUS_MAPPING[ticket.status] || ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          customer: ticket.customer,
          lastMessageAt: ticket.lastMessageAt,
          createdAt: ticket.createdAt
        })),
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Error listing tickets:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async getTicketById(id) {
    await this.ensureInitialized();
    
    try {
      const ticket = await this.models.Ticket.findByPk(id, {
        include: [
          {
            model: this.models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email']
          },
          {
            model: this.models.Message,
            as: 'messages',
            include: [
              {
                model: this.models.Attachment,
                as: 'attachments',
                through: { attributes: [] },
                attributes: ['id', 'filename', 'url']
              }
            ],
            order: [['createdAt', 'ASC']]
          }
        ]
      });

      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      // Format messages
      const formattedMessages = ticket.messages.map(message => ({
        id: message.id,
        content: message.content,
        direction: message.direction,
        createdAt: message.createdAt,
        attachments: message.attachments?.map(attachment => ({
          id: attachment.id,
          name: attachment.filename,
          url: attachment.url
        })) || []
      }));

      // Get customer info from sheets if available
      let customerInfo = null;
      if (ticket.customer?.email) {
        try {
          customerInfo = await SheetsService.getCustomerInfo(ticket.customer.email);
        } catch (error) {
          logger.warn('Could not fetch customer info:', {
            error: error.message,
            customerEmail: ticket.customer.email
          });
        }
      }

      return {
        success: true,
        data: {
          id: ticket.id,
          subject: ticket.subject,
          status: REVERSE_STATUS_MAPPING[ticket.status] || ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          customer: ticket.customer ? {
            id: ticket.customer.id,
            name: ticket.customer.name,
            email: ticket.customer.email
          } : null,
          messages: formattedMessages,
          customerInfo,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          lastMessageAt: ticket.lastMessageAt
        }
      };
    } catch (error) {
      logger.error('Error getting ticket:', {
        error: error.message,
        ticketId: id
      });
      throw error;
    }
  }

  async createTicket(data) {
    await this.ensureInitialized();

    try {
      // Map status if provided
      if (data.status) {
        data.status = STATUS_MAPPING[data.status] || data.status;
      }

      const ticket = await this.models.Ticket.create(data);
      
      logger.info('Ticket created successfully', {
        ticketId: ticket.id
      });

      return {
        ...ticket.toJSON(),
        status: REVERSE_STATUS_MAPPING[ticket.status] || ticket.status
      };
    } catch (error) {
      logger.error('Error creating ticket:', {
        error: error.message,
        data
      });
      throw error;
    }
  }

  async updateTicket(id, data) {
    await this.ensureInitialized();

    try {
      const ticket = await this.models.Ticket.findByPk(id);
      
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      // Map status if provided
      if (data.status) {
        data.status = STATUS_MAPPING[data.status] || data.status;
      }

      await ticket.update(data);
      
      logger.info('Ticket updated successfully', {
        ticketId: id,
        updates: data
      });

      return {
        ...ticket.toJSON(),
        status: REVERSE_STATUS_MAPPING[ticket.status] || ticket.status
      };
    } catch (error) {
      logger.error('Error updating ticket:', {
        error: error.message,
        ticketId: id,
        updates: data
      });
      throw error;
    }
  }

  async addReply(ticketId, data) {
    await this.ensureInitialized();

    try {
      const ticket = await this.models.Ticket.findByPk(ticketId);
      
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      const message = await this.models.Message.create({
        ticketId,
        ...data
      });

      // Update ticket's last message timestamp
      await ticket.update({
        lastMessageAt: message.createdAt
      });

      logger.info('Reply added successfully', {
        ticketId,
        messageId: message.id
      });

      return message;
    } catch (error) {
      logger.error('Error adding reply:', {
        error: error.message,
        ticketId,
        data
      });
      throw error;
    }
  }
}

module.exports = new TicketService();