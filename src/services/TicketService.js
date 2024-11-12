const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const { initializeDatabase } = require('../config/database');

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

  async listTickets({ status, priority, sort, order }, { page = 1, limit = 10 }) {
    await this.ensureInitialized();

    try {
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
        order: sort ? [[sort, order || 'DESC']] : [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      });

      return {
        tickets: tickets.map(ticket => ({
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          customer: ticket.customer,
          createdAt: ticket.createdAt,
          lastMessageAt: ticket.lastMessageAt
        })),
        pagination: {
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('Error listing tickets:', {
        error: error.message,
        filters: { status, priority },
        pagination: { page, limit }
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
                through: { attributes: [] }
              }
            ],
            order: [['createdAt', 'ASC']]
          }
        ]
      });

      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

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

      // Log all dates for debugging
      logger.info('Ticket dates being sent to frontend:', {
        ticketId: ticket.id,
        ticketDates: {
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          lastMessageAt: ticket.lastMessageAt
        },
        messageDates: formattedMessages.map(msg => ({
          messageId: msg.id,
          createdAt: msg.createdAt
        }))
      });

      return {
        success: true,
        data: {
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
          customer: ticket.customer ? {
            id: ticket.customer.id,
            name: ticket.customer.name,
            email: ticket.customer.email
          } : null,
          messages: formattedMessages,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
          lastMessageAt: ticket.lastMessageAt,
          gmailThreadId: ticket.gmailThreadId
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
      const ticket = await this.models.Ticket.create(data);
      
      logger.info('Ticket created successfully', {
        ticketId: ticket.id,
        subject: ticket.subject
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating ticket:', {
        error: error.message,
        data
      });
      throw error;
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

      logger.info('Ticket updated successfully', {
        ticketId: id,
        updates
      });

      return ticket;
    } catch (error) {
      logger.error('Error updating ticket:', {
        error: error.message,
        ticketId: id,
        updates
      });
      throw error;
    }
  }

  async addReply(ticketId, { content, direction, userId, attachments = [] }) {
    await this.ensureInitialized();

    try {
      const ticket = await this.models.Ticket.findByPk(ticketId);
      
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

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
      await ticket.update({
        lastMessageAt: new Date()
      });

      logger.info('Reply added successfully', {
        ticketId,
        messageId: message.id,
        direction
      });

      return message;
    } catch (error) {
      logger.error('Error adding reply:', {
        error: error.message,
        ticketId,
        direction,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = TicketService;