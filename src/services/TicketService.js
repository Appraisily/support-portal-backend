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

      logger.info('Tickets retrieved successfully', {
        totalCount: count,
        pageCount: tickets.length,
        page: pageInt,
        limit: limitInt
      });

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
      logger.info('Fetching ticket with messages', { ticketId: id });

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
        logger.warn('Ticket not found', { ticketId: id });
        throw new ApiError(404, 'Ticket not found');
      }

      logger.info('Retrieved ticket with messages', {
        ticketId: id,
        messageCount: ticket.messages?.length || 0,
        hasCustomer: !!ticket.customer
      });

      // Format messages
      const formattedMessages = ticket.messages.map(message => {
        const formatted = {
          id: message.id,
          content: message.content,
          direction: message.direction,
          createdAt: message.createdAt,
          attachments: message.attachments?.map(attachment => ({
            id: attachment.id,
            name: attachment.filename,
            url: attachment.url
          })) || []
        };

        logger.debug('Formatted message', {
          messageId: message.id,
          direction: message.direction,
          attachmentCount: formatted.attachments.length
        });

        return formatted;
      });

      // Get customer info from sheets if available
      let customerInfo = null;
      if (ticket.customer?.email) {
        try {
          customerInfo = await SheetsService.getCustomerInfo(ticket.customer.email);
          logger.info('Retrieved customer info', {
            customerEmail: ticket.customer.email,
            hasInfo: !!customerInfo
          });
        } catch (error) {
          logger.warn('Could not fetch customer info:', {
            error: error.message,
            customerEmail: ticket.customer.email
          });
        }
      }

      const response = {
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

      logger.info('Sending ticket response', {
        ticketId: id,
        messageCount: formattedMessages.length,
        status: response.data.status,
        hasCustomerInfo: !!customerInfo
      });

      return response;

    } catch (error) {
      logger.error('Error getting ticket:', {
        error: error.message,
        ticketId: id,
        stack: error.stack
      });
      throw error;
    }
  }
}

// Export the class instead of an instance
module.exports = TicketService;