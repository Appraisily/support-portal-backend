const logger = require('../utils/logger');
const { initializeDatabase } = require('../config/database');
const ApiError = require('../utils/apiError');
const SheetsService = require('./SheetsService');
const { Op } = require('sequelize');

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

  async listTickets({ status, priority, sort = 'createdAt', order = 'DESC' }, { page = 1, limit = 10 }) {
    await this.ensureInitialized();

    try {
      const where = {};
      if (status) where.status = status;
      if (priority) where.priority = priority;

      logger.debug('Listing tickets with query:', {
        where,
        sort,
        order,
        page,
        limit
      });

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
        order: [[sort, order]],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        distinct: true
      });

      const formattedTickets = tickets.map(ticket => ({
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        customer: ticket.customer,
        assignedTo: ticket.assignedTo,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        lastMessageAt: ticket.lastMessageAt
      }));

      return {
        tickets: formattedTickets,
        pagination: {
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error listing tickets:', {
        error: error.message,
        stack: error.stack,
        filters: { status, priority },
        pagination: { page, limit }
      });
      throw new ApiError(500, 'Failed to fetch tickets: ' + error.message);
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
                through: { attributes: [] }
              }
            ],
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
      let customerInfo = null;
      if (ticket.customer?.email) {
        customerInfo = await SheetsService.getCustomerInfo(ticket.customer.email);
      }

      return {
        success: true,
        data: {
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          customer: ticket.customer,
          assignedTo: ticket.assignedTo,
          customerInfo, // Include customer info from sheets
          messages: ticket.messages.map(msg => ({
            id: msg.id,
            content: msg.content,
            direction: msg.direction,
            createdAt: msg.createdAt,
            attachments: msg.attachments?.map(att => ({
              id: att.id,
              name: att.filename,
              url: att.url
            })) || []
          })),
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          lastMessageAt: ticket.lastMessageAt
        }
      };
    } catch (error) {
      logger.error('Error getting ticket:', {
        error: error.message,
        stack: error.stack,
        ticketId: id
      });
      throw error;
    }
  }

  async createTicket(data) {
    await this.ensureInitialized();

    try {
      const ticket = await this.models.Ticket.create(data);
      return ticket;
    } catch (error) {
      logger.error('Error creating ticket:', {
        error: error.message,
        stack: error.stack,
        data
      });
      throw new ApiError(500, 'Failed to create ticket: ' + error.message);
    }
  }

  async updateTicket(id, updates) {
    await this.ensureInitialized();

    try {
      const ticket = await this.models.Ticket.findByPk(id);
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      await ticket.update(updates);
      return ticket;
    } catch (error) {
      logger.error('Error updating ticket:', {
        error: error.message,
        stack: error.stack,
        ticketId: id,
        updates
      });
      throw error;
    }
  }

  async addReply(ticketId, { content, direction, userId, attachments = [] }) {
    await this.ensureInitialized();

    try {
      const message = await this.models.Message.create({
        ticketId,
        content,
        direction,
        userId
      });

      if (attachments.length > 0) {
        await message.setAttachments(attachments);
      }

      // Update ticket's lastMessageAt
      await this.models.Ticket.update(
        { lastMessageAt: new Date() },
        { where: { id: ticketId } }
      );

      return message;
    } catch (error) {
      logger.error('Error adding reply:', {
        error: error.message,
        stack: error.stack,
        ticketId,
        direction
      });
      throw new ApiError(500, 'Failed to add reply: ' + error.message);
    }
  }
}

module.exports = TicketService;