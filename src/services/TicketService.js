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

  async listTickets({ status, priority, sort, order, search, searchFields }, { page = 1, limit = 10 }) {
    await this.ensureInitialized();

    try {
      const where = {};
      const include = [
        {
          model: this.models.Customer,
          as: 'customer',
          attributes: ['id', 'name', 'email']
        },
        {
          model: this.models.Message,
          as: 'messages',
          attributes: ['id', 'content', 'direction', 'createdAt'],
          separate: true,
          limit: 1,
          order: [['createdAt', 'DESC']]
        }
      ];

      // Add status filter
      if (status) {
        where.status = status;
      }

      // Add priority filter
      if (priority) {
        where.priority = priority;
      }

      // Add search conditions
      if (search && searchFields?.length > 0) {
        const searchConditions = [];
        
        if (searchFields.includes('email')) {
          include[0].where = {
            email: { [Op.iLike]: `%${search}%` }
          };
        }
        
        if (searchFields.includes('subject')) {
          searchConditions.push({
            subject: { [Op.iLike]: `%${search}%` }
          });
        }
        
        if (searchFields.includes('content')) {
          include[1].where = {
            content: { [Op.iLike]: `%${search}%` }
          };
        }

        if (searchConditions.length > 0) {
          where[Op.or] = searchConditions;
        }
      }

      // Execute query
      const { rows: tickets, count } = await this.models.Ticket.findAndCountAll({
        where,
        include,
        order: sort ? [[sort, order || 'DESC']] : [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        distinct: true
      });

      logger.info('Tickets retrieved successfully', {
        totalCount: count,
        pageCount: tickets.length,
        page,
        limit
      });

      return {
        success: true,
        data: {
          tickets: tickets.map(ticket => ({
            id: ticket.id,
            subject: ticket.subject,
            status: ticket.status,
            priority: ticket.priority,
            customer: ticket.customer,
            lastMessage: ticket.messages[0],
            createdAt: ticket.createdAt.toISOString(),
            updatedAt: ticket.updatedAt.toISOString(),
            lastMessageAt: ticket.lastMessageAt?.toISOString()
          })),
          pagination: {
            total: count,
            page: parseInt(page),
            totalPages: Math.ceil(count / limit),
            limit: parseInt(limit)
          }
        }
      };
    } catch (error) {
      logger.error('Error listing tickets:', {
        error: error.message,
        stack: error.stack,
        filters: { status, priority, sort, order, search, searchFields },
        pagination: { page, limit }
      });
      throw error;
    }
  }

  async getTicketById(id) {
    await this.ensureInitialized();

    try {
      // Get ticket with all related data
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
            attributes: ['id', 'content', 'direction', 'createdAt'],
            include: [
              {
                model: this.models.Attachment,
                as: 'attachments',
                attributes: ['id', 'filename', 'url'],
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
          customerInfo = {
            sales: [],
            pendingAppraisals: [],
            completedAppraisals: [],
            summary: {
              totalPurchases: 0,
              totalSpent: 0,
              hasPendingAppraisals: false,
              hasCompletedAppraisals: false,
              totalAppraisals: 0,
              isExistingCustomer: false,
              lastPurchaseDate: null,
              stripeCustomerId: null
            }
          };
        }
      }

      // Format messages ensuring all required fields are present
      const messages = ticket.messages.map(msg => ({
        id: msg.id,
        content: msg.content || '',
        direction: msg.direction,
        createdAt: msg.createdAt.toISOString(),
        attachments: (msg.attachments || []).map(att => ({
          id: att.id,
          name: att.filename,
          url: att.url
        }))
      }));

      logger.info('Retrieved ticket with messages:', {
        ticketId: id,
        messageCount: messages.length,
        hasCustomer: !!ticket.customer,
        hasCustomerInfo: !!customerInfo,
        messages: messages.map(m => ({
          id: m.id,
          direction: m.direction,
          contentLength: m.content.length,
          hasAttachments: m.attachments?.length > 0
        }))
      });

      // Return response in the exact format expected by frontend
      return {
        success: true,
        data: {
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category || 'general',
          customer: ticket.customer ? {
            id: ticket.customer.id,
            name: ticket.customer.name,
            email: ticket.customer.email
          } : null,
          messages: messages,
          customerInfo: customerInfo,
          createdAt: ticket.createdAt.toISOString(),
          updatedAt: ticket.updatedAt.toISOString(),
          lastMessageAt: ticket.lastMessageAt?.toISOString(),
          gmailThreadId: ticket.gmailThreadId
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

      // Create message
      const message = await this.models.Message.create({
        ticketId,
        content: content || '',
        direction: direction || 'outbound'
      });

      // Add attachments if any
      if (attachments.length > 0) {
        await message.setAttachments(attachments);
      }

      // Update ticket's lastMessageAt
      await this.models.Ticket.update(
        { lastMessageAt: new Date() },
        { where: { id: ticketId } }
      );

      return {
        id: message.id,
        content: message.content,
        direction: message.direction,
        createdAt: message.createdAt.toISOString(),
        attachments: attachments.map(att => ({
          id: att.id,
          name: att.filename,
          url: att.url
        }))
      };
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
}

// Export a singleton instance
const ticketService = new TicketService();
module.exports = ticketService;