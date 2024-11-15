const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { initializeDatabase } = require('../config/database');
const ApiError = require('../utils/apiError');
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

  async listTickets({ status, priority, sort, order }, { page = 1, limit = 10 }) {
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

      // Get customer info from sheets if customer exists
      let customerInfo = null;
      if (ticket.customer?.email) {
        try {
          customerInfo = await SheetsService.getCustomerInfo(ticket.customer.email);
        } catch (error) {
          logger.warn('Failed to get customer info:', {
            error: error.message,
            email: ticket.customer.email
          });
          // Don't throw error, continue without customer info
          customerInfo = null;
        }
      }

      // Format messages ensuring all required fields are present
      const messages = ticket.messages?.map(msg => ({
        id: msg.id,
        content: msg.content || '',
        direction: msg.direction || 'inbound',
        createdAt: msg.createdAt?.toISOString(),
        attachments: msg.attachments?.map(att => ({
          id: att.id,
          name: att.filename,
          url: att.url
        })) || []
      })) || [];

      logger.info('Retrieved ticket with messages:', {
        ticketId: id,
        messageCount: messages.length,
        hasCustomer: !!ticket.customer,
        hasCustomerInfo: !!customerInfo,
        messages: messages.map(m => ({
          id: m.id,
          direction: m.direction,
          contentLength: m.content?.length || 0,
          hasAttachments: m.attachments?.length > 0
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
          customer: {
            id: ticket.customer?.id,
            name: ticket.customer?.name,
            email: ticket.customer?.email
          },
          messages,
          customerInfo,
          createdAt: ticket.createdAt?.toISOString(),
          updatedAt: ticket.updatedAt?.toISOString(),
          lastMessageAt: ticket.lastMessageAt?.toISOString()
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

  async addReply(ticketId, { content, direction, attachments = [] }) {
    await this.ensureInitialized();

    try {
      logger.info('Adding reply to ticket', {
        ticketId,
        direction,
        contentLength: content?.length,
        hasAttachments: attachments.length > 0
      });

      const message = await this.models.Message.create({
        ticketId,
        content,
        direction
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
      throw new Error(`Failed to add reply: ${error.message}`);
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
        ticketId: id,
        updates
      });
      throw error;
    }
  }
}

module.exports = new TicketService();