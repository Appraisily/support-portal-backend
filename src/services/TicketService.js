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

  async updateTicket(id, updates) {
    await this.ensureInitialized();

    const transaction = await this.sequelize.transaction();

    try {
      const ticket = await this.models.Ticket.findByPk(id, { transaction });
      
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      // Map frontend status to database status if provided
      if (updates.status) {
        updates.status = STATUS_MAPPING[updates.status] || updates.status;
      }

      // Update the ticket
      await ticket.update(updates, { transaction });

      // Get updated ticket with associations
      const updatedTicket = await this.models.Ticket.findByPk(id, {
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
        transaction
      });

      await transaction.commit();

      // Format response
      return {
        id: updatedTicket.id,
        subject: updatedTicket.subject,
        status: REVERSE_STATUS_MAPPING[updatedTicket.status] || updatedTicket.status,
        priority: updatedTicket.priority,
        category: updatedTicket.category,
        customer: updatedTicket.customer ? {
          id: updatedTicket.customer.id,
          name: updatedTicket.customer.name,
          email: updatedTicket.customer.email
        } : null,
        assignedTo: updatedTicket.assignedTo ? {
          id: updatedTicket.assignedTo.id,
          name: updatedTicket.assignedTo.name,
          email: updatedTicket.assignedTo.email
        } : null,
        lastMessageAt: updatedTicket.lastMessageAt,
        updatedAt: updatedTicket.updatedAt
      };

    } catch (error) {
      await transaction.rollback();
      logger.error('Error updating ticket:', {
        error: error.message,
        ticketId: id,
        updates,
        stack: error.stack
      });
      throw error;
    }
  }

  async listTickets({ status, priority, sort = 'lastMessageAt', order = 'desc' }, { page = 1, limit = 10 }) {
    await this.ensureInitialized();

    try {
      const where = {};
      
      // Map frontend status to database status
      if (status) {
        where.status = STATUS_MAPPING[status] || status;
      }
      
      if (priority) {
        where.priority = priority;
      }

      // Convert page/limit to integers
      const pageInt = parseInt(page, 10);
      const limitInt = parseInt(limit, 10);
      const offset = (pageInt - 1) * limitInt;

      // Get tickets with count
      const { count, rows } = await this.models.Ticket.findAndCountAll({
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
        order: [[sort, order.toUpperCase()]],
        limit: limitInt,
        offset
      });

      // Format tickets for response
      const tickets = rows.map(ticket => ({
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
        assignedTo: ticket.assignedTo ? {
          id: ticket.assignedTo.id,
          name: ticket.assignedTo.name,
          email: ticket.assignedTo.email
        } : null,
        lastMessageAt: ticket.lastMessageAt,
        createdAt: ticket.createdAt
      }));

      return {
        tickets,
        pagination: {
          total: count,
          page: pageInt,
          limit: limitInt,
          totalPages: Math.ceil(count / limitInt)
        }
      };

    } catch (error) {
      logger.error('Error listing tickets:', {
        error: error.message,
        stack: error.stack,
        filters: { status, priority, sort, order },
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
          lastMessageAt: ticket.lastMessageAt,
          gmailThreadId: ticket.gmailThreadId
        }
      };

    } catch (error) {
      logger.error('Error getting ticket:', {
        error: error.message,
        ticketId: id,
        stack: error.stack
      });
      throw error;
    }
  }

  async addReply(ticketId, { content, direction = 'outbound', userId = null, attachments = [] }) {
    await this.ensureInitialized();

    const transaction = await this.sequelize.transaction();

    try {
      // Get ticket to ensure it exists
      const ticket = await this.models.Ticket.findByPk(ticketId, {
        include: [{ model: this.models.Customer, as: 'customer' }],
        transaction
      });

      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      // Create message
      const message = await this.models.Message.create({
        ticketId,
        content,
        direction,
        userId,
        customerId: ticket.customer?.id
      }, { transaction });

      // Handle attachments if any
      if (attachments.length > 0) {
        await message.setAttachments(attachments, { transaction });
      }

      // Update ticket's lastMessageAt
      await ticket.update({
        lastMessageAt: new Date()
      }, { transaction });

      await transaction.commit();

      // Return formatted message
      const createdMessage = await this.models.Message.findByPk(message.id, {
        include: [{
          model: this.models.Attachment,
          as: 'attachments',
          through: { attributes: [] }
        }],
        transaction: null // Use a new transaction
      });

      return {
        id: createdMessage.id,
        content: createdMessage.content,
        direction: createdMessage.direction,
        createdAt: createdMessage.createdAt,
        attachments: createdMessage.attachments?.map(attachment => ({
          id: attachment.id,
          name: attachment.filename,
          url: attachment.url
        })) || []
      };

    } catch (error) {
      await transaction.rollback();
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