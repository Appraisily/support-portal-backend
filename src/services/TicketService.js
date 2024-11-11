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
      
      const { status, priority, sortBy = 'lastMessageAt', sortOrder = 'DESC', search } = filters;
      const page = Math.max(1, parseInt(pagination.page) || 1);
      const limit = Math.max(1, Math.min(50, parseInt(pagination.limit) || 10));

      logger.info('Listing tickets with filters:', {
        filters: { status, priority },
        pagination: { page, limit },
        sorting: { sortBy, sortOrder }
      });

      const where = {};
      
      if (status) {
        where.status = status === 'pending' ? 'open' : status;
      }
      
      if (priority) {
        where.priority = priority;
      }

      if (search) {
        where[Op.or] = [
          { subject: { [Op.iLike]: `%${search}%` } },
          { '$customer.name$': { [Op.iLike]: `%${search}%` } },
          { '$customer.email$': { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { rows: tickets, count } = await this.models.Ticket.findAndCountAll({
        where,
        include: [
          {
            model: this.models.Customer,
            as: 'customer',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: [[sortBy, sortOrder]],
        limit,
        offset: (page - 1) * limit,
        distinct: true
      });

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
      throw error;
    }
  }

  async getTicketById(id) {
    try {
      await this.ensureInitialized();
      
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

      // Get customer info from sheets if customer exists
      let customerInfo = null;
      if (ticket.customer?.email) {
        try {
          customerInfo = await SheetsService.getCustomerInfo(ticket.customer.email);
          logger.info('Retrieved customer info from sheets', {
            ticketId: id,
            customerEmail: ticket.customer.email,
            hasInfo: !!customerInfo
          });
        } catch (error) {
          logger.error('Error getting customer info from sheets:', {
            error: error.message,
            ticketId: id,
            customerEmail: ticket.customer.email
          });
          customerInfo = {
            sales: [],
            pendingAppraisals: [],
            completedAppraisals: [],
            summary: {
              totalPurchases: 0,
              totalSpent: 0,
              hasPendingAppraisals: false,
              hasCompletedAppraisals: false,
              isExistingCustomer: false,
              lastPurchaseDate: null,
              stripeCustomerId: null
            }
          };
        }
      }

      // Map status for frontend consistency
      const status = ticket.status === 'open' ? 'pending' : ticket.status;

      // Format response according to frontend expectations
      const formattedTicket = {
        success: true,
        data: {
          id: ticket.id,
          subject: ticket.subject,
          status,
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

      logger.info('Ticket retrieved successfully', {
        ticketId: id,
        messageCount: formattedMessages.length,
        hasCustomerInfo: !!customerInfo
      });

      return formattedTicket;

    } catch (error) {
      logger.error('Error retrieving ticket:', {
        error: error.message,
        ticketId: id,
        stack: error.stack
      });
      throw error;
    }
  }

  async createTicket(data) {
    try {
      await this.ensureInitialized();

      const ticket = await this.models.Ticket.create({
        subject: data.subject,
        category: data.category,
        priority: data.priority || 'medium',
        customerId: data.customerId,
        status: 'open'
      });

      logger.info('Ticket created successfully', {
        ticketId: ticket.id,
        subject: ticket.subject,
        customerId: ticket.customerId
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

  async updateTicket(id, data) {
    try {
      await this.ensureInitialized();

      const ticket = await this.models.Ticket.findByPk(id);
      if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
      }

      // Map 'pending' status to 'open' for database
      if (data.status === 'pending') {
        data.status = 'open';
      }

      await ticket.update(data);

      logger.info('Ticket updated successfully', {
        ticketId: id,
        updates: data
      });

      return ticket;
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
        userId: data.userId,
        attachments: data.attachments
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
      throw error;
    }
  }
}

module.exports = new TicketService();