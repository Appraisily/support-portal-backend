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
                through: { attributes: [] }, // Exclude join table attributes
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

      // Get customer info from sheets
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

  // ... rest of the service methods remain the same ...
}